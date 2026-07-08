/**
 * POST /api/social/plans/:id/portal-post-action
 *
 * Per-post approve / request-changes inside a plan review. Anonymous (the
 * client clicks from an emailed link), authenticated by the *plan*'s
 * approval_token rather than a per-post token. The post must belong to this
 * plan or we 403.
 *
 * Body: { token: string, postId: string, action: 'approve' | 'request_changes', note?: string }
 */
import { z } from 'zod'
import { getContentPlanById, getContentPlanPosts } from '~~/server/utils/content-plans'
import { updateSocialPost } from '~~/server/utils/social-directus'
import { notifyEvent } from '~~/server/utils/notify-event'
import { writeClientTimeline } from '~~/server/utils/write-timeline'

const bodySchema = z.object({
  token: z.string().min(8).max(128),
  postId: z.string().uuid(),
  action: z.enum(['approve', 'request_changes']),
  note: z.string().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Plan ID required' })

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: parsed.error.flatten(),
    })
  }

  const plan = await getContentPlanById(id)
  if (!plan) throw createError({ statusCode: 404, message: 'Plan not found' })
  if (!plan.approval_token || plan.approval_token !== parsed.data.token) {
    throw createError({ statusCode: 403, message: 'Invalid approval token' })
  }

  // Ensure the post belongs to this plan (anti-cross-tenant probe).
  const posts = await getContentPlanPosts(id)
  const post = posts.find((p) => String(p.id) === parsed.data.postId)
  if (!post) {
    throw createError({ statusCode: 404, message: 'Post not in this plan' })
  }

  let approverId: string | null = null
  try {
    const session = await getUserSession(event)
    const sessionUserId = (session as any)?.user?.id as string | undefined
    if (sessionUserId) approverId = sessionUserId
  } catch {
    approverId = null
  }

  const patch =
    parsed.data.action === 'approve'
      ? {
          approval_state: 'approved' as const,
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        }
      : {
          approval_state: 'requested_changes' as const,
          // Persist the client's "what to change" note so staff see the
          // specific feedback on the post (was accepted by the schema but
          // previously dropped — no field existed to hold it).
          client_feedback: parsed.data.note?.trim() || null,
        }

  const updated = await updateSocialPost(parsed.data.postId, patch as any)

  // ── Return leg (request-changes only) ────────────────────────────────────
  // A client asking for changes is internal WIP: notify ONLY the assigned
  // staff (the resolver never touches portal users) and log it on the client
  // timeline. Fire-and-forget.
  if (parsed.data.action === 'request_changes') {
    const orgId = typeof plan.organization === 'object' ? (plan.organization as any)?.id : plan.organization
    const clientId = typeof plan.target_client === 'object' ? (plan.target_client as any)?.id : plan.target_client
    const projectId = typeof (post as any).project === 'object' ? (post as any).project?.id : (post as any).project
    const note = parsed.data.note?.trim() || null

    void notifyEvent({
      collection: 'social_posts',
      action: 'update',
      item: {
        project: projectId,
        user_created: (post as any).user_created,
        client_feedback: note,
        organization: orgId,
      },
      itemId: String(parsed.data.postId),
      userId: approverId || '',
      orgId,
      staffOnly: true,
    }).catch((e) => console.warn('[plans/portal-post-action] notify failed:', e))

    void writeClientTimeline({
      organizationId: orgId,
      clientId,
      verb: 'changes.requested',
      title: 'Requested changes on a post',
      subtitle: note,
      actorType: 'client',
      actorUserId: approverId,
      sourceCollection: 'social_posts',
      sourceId: parsed.data.postId,
      icon: 'lucide:message-square-warning',
    })
  }

  return { data: updated }
})

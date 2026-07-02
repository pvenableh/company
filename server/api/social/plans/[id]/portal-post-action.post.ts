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
  return { data: updated }
})

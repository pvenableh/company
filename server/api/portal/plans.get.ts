/**
 * GET /api/portal/plans
 *
 * List content plans visible to the active portal scope, hydrated with their
 * posts so the page can render one PlanReviewCard per plan without an
 * N+1 round-trip. Scoped via `requirePortalContext` — the user only sees
 * plans whose `target_client` is the active client (or a descendant) AND
 * whose `organization` matches their portal org.
 *
 * Query:
 *   ?state=in_review|approved|all   default: in_review
 */
import { requirePortalContext } from '~~/server/utils/portal-auth'
import { getContentPlanPosts, listContentPlans } from '~~/server/utils/content-plans'
import type { ContentPlanState } from '~~/shared/social'

const ALLOWED_STATES = new Set<ContentPlanState | 'all'>(['in_review', 'approved', 'draft', 'archived', 'all'])

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event)
  const q = getQuery(event)
  const stateRaw = (typeof q.state === 'string' ? q.state : 'in_review') as ContentPlanState | 'all'
  const state = (ALLOWED_STATES.has(stateRaw) ? stateRaw : 'in_review') as ContentPlanState | 'all'

  const scope = new Set(ctx.scopedClientIds)
  const plans = await listContentPlans({
    organization: ctx.organizationId,
    state: state === 'all' ? undefined : state,
  })

  // Visible to a portal user when target_client (or project.client) is in scope.
  // Inbox plans (no target_client + no project) are NEVER portal-visible —
  // they're staff buckets for unsorted drafts.
  const visible = plans.filter((p) => p.target_client && scope.has(p.target_client))

  // Hydrate posts per plan. Plans tend to have ~10-30 posts; over the
  // small set of in_review plans a portal user holds, sequential fetches
  // are fine and keep the code straightforward.
  const hydrated = await Promise.all(
    visible.map(async (plan) => ({ plan, posts: await getContentPlanPosts(plan.id) })),
  )

  return { data: hydrated }
})

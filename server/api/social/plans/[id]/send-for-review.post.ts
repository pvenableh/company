/**
 * POST /api/social/plans/:id/send-for-review
 *
 * Plan-level "Send for Review". Mints an approval_token, transitions the plan
 * to in_review, and cascades child draft / requested_changes posts to
 * in_review so the client sees the full month under one review link.
 *
 * Returns the updated plan + the public review URL.
 */
import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { sendPlanForReview } from '~~/server/utils/content-plans'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing id' })

  const result = await sendPlanForReview(id, { organization: organizationId })

  const origin =
    getRequestHeader(event, 'origin') ||
    `${getRequestProtocol(event)}://${getRequestHost(event)}`
  const reviewUrl = result.plan.approval_token
    ? `${origin}/portal/plans/${result.plan.approval_token}`
    : null

  return {
    data: { plan: result.plan, postsTransitioned: result.postsTransitioned, reviewUrl },
  }
})

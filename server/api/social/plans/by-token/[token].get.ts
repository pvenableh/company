/**
 * GET /api/social/plans/by-token/:token
 *
 * Anonymous lookup of a content_plan + its posts via the plan-level
 * approval_token. Used by /portal/plans/[token] to render the review surface
 * before the client has authenticated. Does NOT mutate state.
 *
 * Returns a 404 (not 403) when the token is unknown so we don't leak the
 * existence of plan ids to scrapers.
 */
import { getContentPlanByToken, getContentPlanPosts } from '~~/server/utils/content-plans'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token || token.length < 16) {
    throw createError({ statusCode: 404, message: 'Plan not found' })
  }

  const plan = await getContentPlanByToken(token)
  if (!plan) throw createError({ statusCode: 404, message: 'Plan not found' })

  const posts = await getContentPlanPosts(plan.id)
  return { data: { plan, posts } }
})

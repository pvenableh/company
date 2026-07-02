/**
 * POST /api/social/posts/:id/publish-now
 *
 * Publishes the post immediately, regardless of scheduled_at. Used by the
 * "Post Now" flow on the composer. Tenancy is enforced via requireSocialOrg.
 */
import { publishSocialPost } from '~~/server/utils/social-publish'
import { getSocialPostById } from '~~/server/utils/social-directus'
import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { isSocialPublishingEnabled } from '~~/server/utils/social-publishing'
import { awardUserEP } from '~~/server/utils/earnestScoreUser'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const session = await requireUserSession(event)
  const userId = (session as any).user?.id as string | undefined

  // Kill-switch: external publishing is disabled until the Meta/LinkedIn
  // app credentials are approved. Studio + manual planning stay available.
  if (!isSocialPublishingEnabled(event)) {
    throw createError({
      statusCode: 403,
      message: 'Social publishing is currently disabled. Content creation and planning remain available.',
    })
  }
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Post ID required' })
  }

  const post = await getSocialPostById(id, organizationId)
  if (!post) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }
  if (post.status === 'published') {
    return { data: post, alreadyPublished: true }
  }
  if (!post.platforms?.length) {
    throw createError({ statusCode: 400, message: 'Post has no target accounts' })
  }

  const outcome = await publishSocialPost(id)

  // Arcade / Earnest Score — fire-and-forget growth EP for publishing. Admin
  // token here, so only UPDATE the publisher's existing row (no mis-attribution).
  if (userId) {
    awardUserEP(getTypedDirectus(), organizationId, userId, 'social_post', { createIfMissing: false })
      .catch((e) => console.warn('[social/publish-now] Failed to award EP:', e))
  }

  return { data: outcome }
})

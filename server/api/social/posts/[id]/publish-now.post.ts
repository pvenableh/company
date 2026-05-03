/**
 * POST /api/social/posts/:id/publish-now
 *
 * Publishes the post immediately, regardless of scheduled_at. Used by the
 * "Post Now" flow on the composer. Tenancy is enforced via requireSocialOrg.
 */
import { publishSocialPost } from '~~/server/utils/social-publish'
import { getSocialPostById } from '~~/server/utils/social-directus'
import { requireSocialOrg } from '~~/server/utils/social-tenancy'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
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
  return { data: outcome }
})

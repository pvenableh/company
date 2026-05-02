/**
 * GET /api/social/accounts/connect/:platform — start OAuth flow.
 *
 * Resolves the active organization for the signed-in user, encodes it into
 * the OAuth state, and redirects to the platform's auth URL. The callback
 * decodes the state and writes `organization` onto the new social_account.
 */

import { getInstagramAuthUrl } from '~~/server/adapters/instagram'
import { getTikTokAuthUrl } from '~~/server/adapters/tiktok'
import { getLinkedInAuthUrl } from '~~/server/adapters/linkedin'
import { getFacebookAuthUrl } from '~~/server/adapters/facebook'
import { getThreadsAuthUrl } from '~~/server/adapters/threads'
import { requireSocialOrg, encodeOAuthState } from '~~/server/utils/social-tenancy'

const authUrlGenerators: Record<string, (state: string) => string> = {
  instagram: getInstagramAuthUrl,
  tiktok: getTikTokAuthUrl,
  linkedin: getLinkedInAuthUrl,
  facebook: getFacebookAuthUrl,
  threads: getThreadsAuthUrl,
}

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const platform = getRouterParam(event, 'platform')
  const getAuthUrl = platform ? authUrlGenerators[platform] : undefined
  if (!getAuthUrl) {
    throw createError({ statusCode: 400, message: 'Invalid platform' })
  }
  const state = encodeOAuthState(organizationId)
  return sendRedirect(event, getAuthUrl(state))
})

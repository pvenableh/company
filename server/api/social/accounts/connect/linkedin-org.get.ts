/**
 * GET /api/social/accounts/connect/linkedin-org — start OAuth flow for App B
 * (LinkedIn Community Management API → Company Page posting).
 *
 * LinkedIn requires Community Management API to be the ONLY product on its
 * app, so this flow uses a separate client_id/secret/redirect URI from the
 * personal-profile flow at /connect/linkedin.
 */

import { getLinkedInOrgAuthUrl } from '~~/server/adapters/linkedin'
import { requireSocialOrg, encodeOAuthState } from '~~/server/utils/social-tenancy'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const state = encodeOAuthState(organizationId)
  return sendRedirect(event, getLinkedInOrgAuthUrl(state))
})

/**
 * LinkedIn (Community Management API) OAuth Callback
 * GET /api/social/oauth/linkedin-org/callback
 *
 * Handles the App B flow: token has org-management scopes only, so we don't
 * call /userinfo (would 403). We list the Company Pages the user administers
 * and create one social_account per page with metadata.type = 'organization'.
 */

import { exchangeLinkedInOrgCode, getLinkedInOrganizations } from '~~/server/adapters/linkedin'
import {
  getSocialAccountByPlatformId,
  createSocialAccount,
  updateSocialAccount,
  logSocialActivity,
} from '~~/server/utils/social-directus'
import { decodeOAuthState } from '~~/server/utils/social-tenancy'
import { requireOrgMembership } from '~~/server/utils/marketing-perms'
import { computeTokenExpiry } from '~~/server/utils/oauth-expiry'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { code, state, error, error_description } = query as Record<string, string>

  if (error) {
    console.error('[social:oauth:linkedin-org] Authorization denied:', error, error_description)
    return sendRedirect(event, `/social/settings?error=linkedin_org_denied&message=${encodeURIComponent(error_description || error)}`)
  }

  if (!code) {
    return sendRedirect(event, `/social/settings?error=no_code`)
  }

  let organizationId: string
  try {
    organizationId = decodeOAuthState(state).organizationId
    await requireOrgMembership(event, organizationId)
  } catch (err: any) {
    return sendRedirect(event, `/social/settings?error=invalid_state&message=${encodeURIComponent(err.message || 'state invalid')}`)
  }

  try {
    const tokens = await exchangeLinkedInOrgCode(code)
    const tokenExpiresAt = computeTokenExpiry(tokens.expiresIn)

    const orgs = await getLinkedInOrganizations(tokens.accessToken)

    if (!orgs.length) {
      return sendRedirect(event, `/social/settings?error=linkedin_no_pages&message=${encodeURIComponent('No LinkedIn Company Pages found that you administer.')}`)
    }

    let connectedCount = 0

    for (const org of orgs) {
      const orgPlatformId = `org_${org.organizationId}`
      const existing = await getSocialAccountByPlatformId('linkedin', orgPlatformId, organizationId)

      const data = {
        organization: organizationId,
        platform: 'linkedin' as const,
        platform_user_id: orgPlatformId,
        account_name: org.name,
        account_handle: org.vanityName,
        profile_picture_url: org.logoUrl,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: tokenExpiresAt,
        metadata: { type: 'organization', authorUrn: `urn:li:organization:${org.organizationId}` },
      }

      if (existing) {
        await updateSocialAccount(existing.id, { ...data, status: 'active' })
        await logSocialActivity({
          action: 'account_token_refreshed',
          entity_type: 'account',
          entity_id: existing.id,
          platform: 'linkedin',
        })
      } else {
        const newAccount = await createSocialAccount(data)
        await logSocialActivity({
          action: 'account_connected',
          entity_type: 'account',
          entity_id: newAccount.id,
          platform: 'linkedin',
        })
      }
      connectedCount++
    }

    return sendRedirect(event, `/social/settings?success=linkedin&count=${connectedCount}`)
  } catch (err: any) {
    console.error('[social:oauth:linkedin-org] Error:', err)
    return sendRedirect(
      event,
      `/social/settings?error=linkedin_org_failed&message=${encodeURIComponent(err.message)}`,
    )
  }
})

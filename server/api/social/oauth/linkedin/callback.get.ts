/**
 * LinkedIn OAuth Callback
 * GET /api/social/oauth/linkedin/callback
 */

import { exchangeLinkedInCode, getLinkedInProfile } from '~~/server/adapters/linkedin'
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
    console.error('[social:oauth:linkedin] Authorization denied:', error, error_description)
    return sendRedirect(event, `/social/settings?error=linkedin_denied`)
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
    // Exchange code for tokens
    const tokens = await exchangeLinkedInCode(code)

    // Get user profile
    const profile = await getLinkedInProfile(tokens.accessToken)

    const tokenExpiresAt = computeTokenExpiry(tokens.expiresIn)

    // Connect personal profile only. Company-Page connections go through the
    // separate App B flow at /api/social/oauth/linkedin-org/callback.
    const existingPersonal = await getSocialAccountByPlatformId('linkedin', profile.sub, organizationId)

    const personalData = {
      organization: organizationId,
      platform: 'linkedin' as const,
      platform_user_id: profile.sub,
      account_name: profile.name,
      account_handle: profile.name,
      profile_picture_url: profile.picture,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: tokenExpiresAt,
      metadata: { type: 'personal', authorUrn: `urn:li:person:${profile.sub}` },
    }

    if (existingPersonal) {
      await updateSocialAccount(existingPersonal.id, {
        ...personalData,
        status: 'active',
      })
      await logSocialActivity({
        action: 'account_token_refreshed',
        entity_type: 'account',
        entity_id: existingPersonal.id,
        platform: 'linkedin',
      })
    } else {
      const newAccount = await createSocialAccount(personalData)
      await logSocialActivity({
        action: 'account_connected',
        entity_type: 'account',
        entity_id: newAccount.id,
        platform: 'linkedin',
      })
    }

    return sendRedirect(event, `/social/settings?success=linkedin&count=1`)
  } catch (err: any) {
    console.error('[social:oauth:linkedin] Error:', err)
    return sendRedirect(
      event,
      `/social/settings?error=linkedin_failed&message=${encodeURIComponent(err.message)}`,
    )
  }
})

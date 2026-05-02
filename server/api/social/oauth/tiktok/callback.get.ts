/**
 * TikTok OAuth Callback
 * GET /api/social/oauth/tiktok/callback
 */

import { exchangeTikTokCode, getTikTokUserInfo } from '~~/server/adapters/tiktok'
import {
  getSocialAccountByPlatformId,
  createSocialAccount,
  updateSocialAccount,
  logSocialActivity,
} from '~~/server/utils/social-directus'
import { decodeOAuthState } from '~~/server/utils/social-tenancy'
import { requireOrgMembership } from '~~/server/utils/marketing-perms'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { code, state, error, error_description } = query as Record<string, string>

  if (error) {
    console.error('[social:oauth:tiktok] Authorization denied:', error, error_description)
    return sendRedirect(event, `/social/settings?error=tiktok_denied`)
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
    const tokens = await exchangeTikTokCode(code)

    // Get user profile
    const userInfo = await getTikTokUserInfo(tokens.accessToken)

    const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString()

    const existing = await getSocialAccountByPlatformId('tiktok', tokens.openId, organizationId)

    const accountData = {
      organization: organizationId,
      platform: 'tiktok' as const,
      platform_user_id: tokens.openId,
      account_name: userInfo.displayName,
      account_handle: userInfo.username,
      profile_picture_url: userInfo.avatarUrl,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: tokenExpiresAt,
    }

    if (existing) {
      await updateSocialAccount(existing.id, {
        ...accountData,
        status: 'active',
      })
      await logSocialActivity({
        action: 'account_token_refreshed',
        entity_type: 'account',
        entity_id: existing.id,
        platform: 'tiktok',
      })
    } else {
      const newAccount = await createSocialAccount(accountData)
      await logSocialActivity({
        action: 'account_connected',
        entity_type: 'account',
        entity_id: newAccount.id,
        platform: 'tiktok',
      })
    }

    return sendRedirect(event, `/social/settings?success=tiktok`)
  } catch (err: any) {
    console.error('[social:oauth:tiktok] Error:', err)
    return sendRedirect(
      event,
      `/social/settings?error=tiktok_failed&message=${encodeURIComponent(err.message)}`
    )
  }
})

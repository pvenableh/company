/**
 * Instagram OAuth Callback
 * GET /api/social/oauth/instagram/callback
 */

import { exchangeInstagramCode, getInstagramAccounts } from '~/server/adapters/instagram'
import {
  getSocialAccountByPlatformId,
  createSocialAccount,
  updateSocialAccount,
  logSocialActivity,
} from '~/server/utils/social-directus'
import { addDays } from 'date-fns'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { code, state, error } = query as Record<string, string>

  if (error) {
    console.error('[social:oauth:instagram] Authorization denied:', error)
    return sendRedirect(event, `/social/settings?error=instagram_denied`)
  }

  if (!code) {
    return sendRedirect(event, `/social/settings?error=no_code`)
  }

  try {
    // Exchange code for token
    const { accessToken, expiresIn, userId } = await exchangeInstagramCode(code)

    // Get connected IG accounts
    const igAccounts = await getInstagramAccounts(accessToken)

    if (igAccounts.length === 0) {
      return sendRedirect(event, `/social/settings?error=no_ig_accounts`)
    }

    let connectedCount = 0

    for (const ig of igAccounts) {
      const existing = await getSocialAccountByPlatformId('instagram', ig.igUserId)
      const tokenExpiresAt = addDays(new Date(), Math.floor(expiresIn / 86400)).toISOString()

      const accountData = {
        platform: 'instagram' as const,
        platform_user_id: ig.igUserId,
        account_name: ig.name,
        account_handle: ig.username,
        profile_picture_url: ig.profilePictureUrl,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        metadata: { page_id: ig.pageId, fb_user_id: userId },
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
          platform: 'instagram',
        })
      } else {
        const newAccount = await createSocialAccount(accountData)
        await logSocialActivity({
          action: 'account_connected',
          entity_type: 'account',
          entity_id: newAccount.id,
          platform: 'instagram',
        })
      }

      connectedCount++
    }

    return sendRedirect(event, `/social/settings?success=instagram&count=${connectedCount}`)
  } catch (err: any) {
    console.error('[social:oauth:instagram] Error:', err)
    return sendRedirect(
      event,
      `/social/settings?error=instagram_failed&message=${encodeURIComponent(err.message)}`
    )
  }
})

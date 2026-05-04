/**
 * Instagram OAuth Callback
 * GET /api/social/oauth/instagram/callback
 */

import { exchangeInstagramCode, getInstagramAccounts } from '~~/server/adapters/instagram'
import {
  getSocialAccountByPlatformId,
  createSocialAccount,
  updateSocialAccount,
  logSocialActivity,
} from '~~/server/utils/social-directus'
import { decodeOAuthState } from '~~/server/utils/social-tenancy'
import { requireOrgMembership } from '~~/server/utils/marketing-perms'
import { computeTokenExpiry } from '~~/server/utils/oauth-expiry'
import { subscribeInstagramAccount } from '~~/server/utils/meta-subscribe'

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

  let organizationId: string
  try {
    organizationId = decodeOAuthState(state).organizationId
    await requireOrgMembership(event, organizationId)
  } catch (err: any) {
    return sendRedirect(event, `/social/settings?error=invalid_state&message=${encodeURIComponent(err.message || 'state invalid')}`)
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
      const existing = await getSocialAccountByPlatformId('instagram', ig.igUserId, organizationId)
      const tokenExpiresAt = computeTokenExpiry(expiresIn)

      const accountData = {
        organization: organizationId,
        platform: 'instagram' as const,
        platform_user_id: ig.igUserId,
        account_name: ig.name,
        account_handle: ig.username,
        profile_picture_url: ig.profilePictureUrl,
        // Send API + subscribed_apps require the Page Access Token, not the user token.
        access_token: ig.pageAccessToken,
        token_expires_at: tokenExpiresAt,
        metadata: {
          page_id: ig.pageId,
          fb_user_id: userId,
          // Keep the user token around for refresh flows (Page tokens inherit
          // expiry from the underlying long-lived user token).
          user_access_token: accessToken,
        },
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

      // Opt the IG account's underlying Page into webhook events. Failure
      // here is non-fatal — the account is still connected; the user just
      // won't get realtime inbox events until they reconnect.
      const sub = await subscribeInstagramAccount(ig.pageId, ig.pageAccessToken)
      if (!sub.ok) {
        console.warn(`[social:oauth:instagram] subscribed_apps failed for page ${ig.pageId}: ${sub.error}`)
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

/**
 * Facebook Pages OAuth Callback
 * GET /api/social/oauth/facebook/callback
 */

import { exchangeFacebookCode, getFacebookPages } from '~~/server/adapters/facebook'
import {
  getSocialAccountByPlatformId,
  createSocialAccount,
  updateSocialAccount,
  logSocialActivity,
} from '~~/server/utils/social-directus'
import { decodeOAuthState } from '~~/server/utils/social-tenancy'
import { requireOrgMembership } from '~~/server/utils/marketing-perms'
import { computeTokenExpiry } from '~~/server/utils/oauth-expiry'
import { subscribeMetaPage } from '~~/server/utils/meta-subscribe'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { code, state, error } = query as Record<string, string>

  if (error) {
    console.error('[social:oauth:facebook] Authorization denied:', error)
    return sendRedirect(event, `/social/settings?error=facebook_denied`)
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
    const { accessToken, expiresIn, userId } = await exchangeFacebookCode(code)

    // Get managed Facebook Pages
    const pages = await getFacebookPages(accessToken)

    if (pages.length === 0) {
      return sendRedirect(event, `/social/settings?error=no_fb_pages`)
    }

    let connectedCount = 0

    for (const page of pages) {
      const existing = await getSocialAccountByPlatformId('facebook', page.pageId, organizationId)
      const tokenExpiresAt = computeTokenExpiry(expiresIn)

      const accountData = {
        organization: organizationId,
        platform: 'facebook' as const,
        platform_user_id: page.pageId,
        account_name: page.name,
        account_handle: page.category,
        profile_picture_url: page.pictureUrl,
        access_token: page.pageAccessToken, // Use page-specific token
        token_expires_at: tokenExpiresAt,
        metadata: {
          fb_user_id: userId,
          category: page.category,
          followersCount: page.followersCount,
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
          platform: 'facebook',
        })
      } else {
        const newAccount = await createSocialAccount(accountData)
        await logSocialActivity({
          action: 'account_connected',
          entity_type: 'account',
          entity_id: newAccount.id,
          platform: 'facebook',
        })
      }

      // Opt this Page into webhook events. Failure here is non-fatal — the
      // account is still connected and posting works; the user just won't get
      // realtime inbox events until they reconnect or we backfill.
      const sub = await subscribeMetaPage(page.pageId, page.pageAccessToken)
      if (!sub.ok) {
        console.warn(`[social:oauth:facebook] subscribed_apps failed for page ${page.pageId}: ${sub.error}`)
      }

      connectedCount++
    }

    return sendRedirect(event, `/social/settings?success=facebook&count=${connectedCount}`)
  } catch (err: any) {
    console.error('[social:oauth:facebook] Error:', err)
    return sendRedirect(
      event,
      `/social/settings?error=facebook_failed&message=${encodeURIComponent(err.message)}`,
    )
  }
})

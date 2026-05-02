/**
 * Threads OAuth Callback
 * GET /api/social/oauth/threads/callback
 */

import { exchangeThreadsCode, getThreadsProfile } from '~~/server/adapters/threads'
import {
  getSocialAccountByPlatformId,
  createSocialAccount,
  updateSocialAccount,
  logSocialActivity,
} from '~~/server/utils/social-directus'
import { decodeOAuthState } from '~~/server/utils/social-tenancy'
import { requireOrgMembership } from '~~/server/utils/marketing-perms'
import { addDays } from 'date-fns'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { code, state, error, error_description } = query as Record<string, string>

  if (error) {
    console.error('[social:oauth:threads] Authorization denied:', error, error_description)
    return sendRedirect(event, `/social/settings?error=threads_denied`)
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
    const tokens = await exchangeThreadsCode(code)

    // Get user profile
    const profile = await getThreadsProfile(tokens.accessToken)

    const tokenExpiresAt = addDays(new Date(), Math.floor(tokens.expiresIn / 86400)).toISOString()

    const existing = await getSocialAccountByPlatformId('threads', profile.id, organizationId)

    const accountData = {
      organization: organizationId,
      platform: 'threads' as const,
      platform_user_id: profile.id,
      account_name: profile.name,
      account_handle: profile.username,
      profile_picture_url: profile.profilePictureUrl,
      access_token: tokens.accessToken,
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
        platform: 'threads',
      })
    } else {
      const newAccount = await createSocialAccount(accountData)
      await logSocialActivity({
        action: 'account_connected',
        entity_type: 'account',
        entity_id: newAccount.id,
        platform: 'threads',
      })
    }

    return sendRedirect(event, `/social/settings?success=threads`)
  } catch (err: any) {
    console.error('[social:oauth:threads] Error:', err)
    return sendRedirect(
      event,
      `/social/settings?error=threads_failed&message=${encodeURIComponent(err.message)}`,
    )
  }
})

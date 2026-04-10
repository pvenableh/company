/**
 * LinkedIn OAuth Callback
 * GET /api/social/oauth/linkedin/callback
 */

import { exchangeLinkedInCode, getLinkedInProfile, getLinkedInOrganizations } from '~~/server/adapters/linkedin'
import {
  getSocialAccountByPlatformId,
  createSocialAccount,
  updateSocialAccount,
  logSocialActivity,
} from '~~/server/utils/social-directus'
import { addDays } from 'date-fns'

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

  try {
    // Exchange code for tokens
    const tokens = await exchangeLinkedInCode(code)

    // Get user profile
    const profile = await getLinkedInProfile(tokens.accessToken)

    const tokenExpiresAt = addDays(new Date(), Math.floor(tokens.expiresIn / 86400)).toISOString()
    let connectedCount = 0

    // Connect personal profile
    const existingPersonal = await getSocialAccountByPlatformId('linkedin', profile.sub)

    const personalData = {
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
    connectedCount++

    // Also connect organization pages the user manages
    const orgs = await getLinkedInOrganizations(tokens.accessToken).catch(() => [])

    for (const org of orgs) {
      const orgPlatformId = `org_${org.organizationId}`
      const existingOrg = await getSocialAccountByPlatformId('linkedin', orgPlatformId)

      const orgData = {
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

      if (existingOrg) {
        await updateSocialAccount(existingOrg.id, {
          ...orgData,
          status: 'active',
        })
        await logSocialActivity({
          action: 'account_token_refreshed',
          entity_type: 'account',
          entity_id: existingOrg.id,
          platform: 'linkedin',
        })
      } else {
        const newAccount = await createSocialAccount(orgData)
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
    console.error('[social:oauth:linkedin] Error:', err)
    return sendRedirect(
      event,
      `/social/settings?error=linkedin_failed&message=${encodeURIComponent(err.message)}`,
    )
  }
})

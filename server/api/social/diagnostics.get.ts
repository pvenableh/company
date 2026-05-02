/**
 * Social Connection Diagnostics — admin-only.
 *
 * For each platform: env-var presence + a live ping against the platform's
 * "who am I" endpoint for every connected account, with the raw response
 * surfaced so the developer can paste it into the platform's developer
 * console when something breaks.
 *
 * NOT org-scoped — returns every connected social_account in the database.
 * That's deliberate: this is a developer-debug tool to validate the
 * deployment's OAuth configuration. Tenant-scoping for the user-facing
 * routes lands in PR 2.
 */

import type { SocialPlatform } from '~~/shared/social'
import { safeDecryptSocialToken } from '~~/server/utils/social-crypto'
import { requireOrgRole } from '~~/server/utils/org-permissions'

type CheckStatus = 'ok' | 'fail' | 'unconfigured'

interface EnvCheck {
  name: string
  required: boolean
  present: boolean
}

interface AccountPing {
  accountId: string
  accountName: string
  accountHandle: string
  status: CheckStatus
  httpStatus?: number
  errorMessage?: string
  rawResponse?: unknown
}

interface PlatformReport {
  platform: SocialPlatform
  configured: boolean
  envChecks: EnvCheck[]
  scopesRequested: string[]
  redirectUri: string
  accountPings: AccountPing[]
}

const PLATFORM_ORDER: SocialPlatform[] = ['instagram', 'tiktok', 'linkedin', 'facebook', 'threads']

const SCOPES_REQUESTED: Record<SocialPlatform, string[]> = {
  instagram: [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
  ],
  tiktok: ['user.info.basic', 'video.upload', 'video.publish', 'video.list'],
  linkedin: [
    'openid',
    'profile',
    'w_member_social',
    'r_organization_social',
    'w_organization_social',
    'rw_organization_admin',
  ],
  facebook: [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_engagement',
    'pages_read_user_content',
    'read_insights',
  ],
  threads: [
    'threads_basic',
    'threads_content_publish',
    'threads_manage_insights',
    'threads_manage_replies',
  ],
}

function envChecksFor(platform: SocialPlatform): EnvCheck[] {
  const has = (k: string) => !!process.env[k]
  switch (platform) {
    case 'instagram':
      return [
        { name: 'INSTAGRAM_APP_ID', required: true, present: has('INSTAGRAM_APP_ID') },
        { name: 'INSTAGRAM_APP_SECRET', required: true, present: has('INSTAGRAM_APP_SECRET') },
        { name: 'INSTAGRAM_REDIRECT_URI', required: true, present: has('INSTAGRAM_REDIRECT_URI') },
      ]
    case 'tiktok':
      return [
        { name: 'TIKTOK_CLIENT_KEY', required: true, present: has('TIKTOK_CLIENT_KEY') },
        { name: 'TIKTOK_CLIENT_SECRET', required: true, present: has('TIKTOK_CLIENT_SECRET') },
        { name: 'TIKTOK_REDIRECT_URI', required: true, present: has('TIKTOK_REDIRECT_URI') },
      ]
    case 'linkedin':
      return [
        { name: 'LINKEDIN_CLIENT_ID', required: true, present: has('LINKEDIN_CLIENT_ID') },
        { name: 'LINKEDIN_CLIENT_SECRET', required: true, present: has('LINKEDIN_CLIENT_SECRET') },
        { name: 'LINKEDIN_REDIRECT_URI', required: true, present: has('LINKEDIN_REDIRECT_URI') },
      ]
    case 'facebook':
      return [
        { name: 'FACEBOOK_APP_ID', required: false, present: has('FACEBOOK_APP_ID') || has('INSTAGRAM_APP_ID') },
        { name: 'FACEBOOK_APP_SECRET', required: false, present: has('FACEBOOK_APP_SECRET') || has('INSTAGRAM_APP_SECRET') },
        { name: 'FACEBOOK_REDIRECT_URI', required: true, present: has('FACEBOOK_REDIRECT_URI') },
      ]
    case 'threads':
      return [
        { name: 'THREADS_APP_ID', required: false, present: has('THREADS_APP_ID') || has('INSTAGRAM_APP_ID') },
        { name: 'THREADS_APP_SECRET', required: false, present: has('THREADS_APP_SECRET') || has('INSTAGRAM_APP_SECRET') },
        { name: 'THREADS_REDIRECT_URI', required: true, present: has('THREADS_REDIRECT_URI') },
      ]
  }
}

function redirectUriFor(platform: SocialPlatform): string {
  const config = useRuntimeConfig()
  const siteUrl = (config.public.siteUrl as string) || ''
  return `${siteUrl}/api/social/oauth/${platform}/callback`
}

/**
 * Hit each platform's "who am I" endpoint with the stored token. We catch
 * everything and shape it into a PingResult so the UI can render even when
 * the request blows up at the network layer.
 */
async function pingAccount(platform: SocialPlatform, token: string): Promise<{
  status: CheckStatus
  httpStatus?: number
  errorMessage?: string
  rawResponse?: unknown
}> {
  let url: string
  let headers: Record<string, string> = {}

  switch (platform) {
    case 'instagram':
    case 'facebook':
      url = `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`
      break
    case 'threads':
      url = `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`
      break
    case 'tiktok':
      url = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name'
      headers = { Authorization: `Bearer ${token}` }
      break
    case 'linkedin':
      url = 'https://api.linkedin.com/v2/userinfo'
      headers = { Authorization: `Bearer ${token}` }
      break
  }

  try {
    const res = await fetch(url, { headers })
    const text = await res.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = text }

    if (!res.ok) {
      return {
        status: 'fail',
        httpStatus: res.status,
        errorMessage: `HTTP ${res.status} ${res.statusText}`,
        rawResponse: parsed,
      }
    }
    return { status: 'ok', httpStatus: res.status, rawResponse: parsed }
  } catch (err: any) {
    return {
      status: 'fail',
      errorMessage: err?.message || 'Network error',
    }
  }
}

async function fetchAllSocialAccounts(): Promise<any[]> {
  const config = useRuntimeConfig()
  const directusUrl = config.directus?.url || config.public?.directusUrl
  const serverToken = (config.directus as any)?.serverToken || (config as any).directusServerToken
  if (!directusUrl || !serverToken) return []

  const params = new URLSearchParams({
    fields: 'id,platform,account_name,account_handle,access_token,account_status',
    limit: '500',
  })
  const res = await fetch(`${directusUrl}/items/social_accounts?${params}`, {
    headers: { Authorization: `Bearer ${serverToken}` },
  })
  if (!res.ok) return []
  const json = await res.json()
  return Array.isArray(json?.data) ? json.data : []
}

export default defineEventHandler(async (event) => {
  await requireOrgRole(event, ['admin', 'owner'])

  const accounts = await fetchAllSocialAccounts()
  const reports: PlatformReport[] = []

  for (const platform of PLATFORM_ORDER) {
    const envChecks = envChecksFor(platform)
    const configured = envChecks.filter((c) => c.required).every((c) => c.present)

    const platformAccounts = accounts.filter((a) => a.platform === platform)
    const accountPings: AccountPing[] = []

    for (const acc of platformAccounts) {
      const decrypted = acc.access_token ? safeDecryptSocialToken(acc.access_token) : null
      if (!decrypted) {
        accountPings.push({
          accountId: acc.id,
          accountName: acc.account_name,
          accountHandle: acc.account_handle,
          status: 'fail',
          errorMessage: 'Stored token failed to decrypt (encryption key changed?)',
        })
        continue
      }
      const result = await pingAccount(platform, decrypted)
      accountPings.push({
        accountId: acc.id,
        accountName: acc.account_name,
        accountHandle: acc.account_handle,
        ...result,
      })
    }

    reports.push({
      platform,
      configured,
      envChecks,
      scopesRequested: SCOPES_REQUESTED[platform],
      redirectUri: redirectUriFor(platform),
      accountPings,
    })
  }

  return { generatedAt: new Date().toISOString(), reports }
})

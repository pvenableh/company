/**
 * Social Accounts API
 * GET /api/social/accounts — List all accounts (with optional client filter)
 */

import { getSocialAccounts, getSocialAccountById } from '~/server/utils/social-directus'
import type { SocialAccountPublic, SocialPlatform } from '~/types/social'
import { differenceInHours } from 'date-fns'

async function directusFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {}
): Promise<T> {
  const config = useRuntimeConfig()
  const { method = 'GET', body, params } = options
  const queryString = params ? `?${new URLSearchParams(params).toString()}` : ''

  const response = await fetch(`${config.directus.url}${path}${queryString}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.directus.serverToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Directus request failed: ${response.status} ${error}`)
  }

  const json = await response.json()
  return json.data as T
}

// ── GET /api/social/accounts ──
export default defineEventHandler(async (event) => {
  const method = getMethod(event)

  if (method === 'GET') {
    const query = getQuery(event)
    const platform = query.platform as SocialPlatform | undefined
    const clientId = query.client_id as string | undefined
    const status = query.status as string | undefined

    // Build filter params
    const params: Record<string, string> = {
      sort: 'account_name',
    }

    if (platform) params['filter[platform][_eq]'] = platform
    if (clientId) params['filter[client_id][_eq]'] = clientId
    if (status) params['filter[account_status][_eq]'] = status

    const accounts = await directusFetch<any[]>('/items/social_accounts', { params })

    // Get clients for name lookup
    let clientMap = new Map<string, string>()
    try {
      const clients = await directusFetch<any[]>('/items/social_clients', {
        params: { fields: 'id,name' },
      })
      clientMap = new Map(clients.map((c) => [c.id, c.name]))
    } catch {
      // Clients collection may not exist yet
    }

    // Transform to public format (account_status maps to public status)
    const publicAccounts: SocialAccountPublic[] = accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      account_name: a.account_name,
      account_handle: a.account_handle,
      profile_picture_url: a.profile_picture_url,
      status: a.account_status || 'active',
      token_expires_at: a.token_expires_at,
      is_token_expiring_soon: a.token_expires_at
        ? differenceInHours(new Date(a.token_expires_at), new Date()) < 24 * 7
        : false,
      client_id: a.client_id,
      client_name: a.client_id ? clientMap.get(a.client_id) : undefined,
    }))

    return { data: publicAccounts }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})

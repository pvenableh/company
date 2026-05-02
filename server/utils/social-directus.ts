/**
 * Social Media Directus Helpers
 *
 * Type-safe helpers for interacting with social media collections in Directus.
 */

import type {
  SocialAccount,
  SocialAnalyticsSnapshot,
  SocialComment,
  SocialActivityLog,
  SocialAction,
  SocialPlatform,
  SocialPost,
} from '~~/shared/social'
import type { SocialPost as DirectusSocialPost } from '~~/shared/directus'
import { encryptSocialToken, safeDecryptSocialToken } from './social-crypto'

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

function getDirectusConfig() {
  const config = useRuntimeConfig()
  return {
    url: config.directus?.url || process.env.DIRECTUS_URL || 'http://localhost:8055',
    token: config.directus?.serverToken || process.env.DIRECTUS_SERVER_TOKEN || '',
  }
}

async function directusFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {}
): Promise<T> {
  const { url, token } = getDirectusConfig()
  const { method = 'GET', body, params } = options

  const queryString = params ? `?${new URLSearchParams(params).toString()}` : ''

  const response = await fetch(`${url}${path}${queryString}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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

// ══════════════════════════════════════════════════════════════════════════════
// SOCIAL ACCOUNTS
// ══════════════════════════════════════════════════════════════════════════════

export async function getSocialAccounts(
  organization: string,
  filters?: {
    platform?: SocialPlatform
    status?: 'active' | 'expired' | 'revoked'
    client?: string | null
  },
): Promise<SocialAccount[]> {
  const params: Record<string, string> = {
    'filter[organization][_eq]': organization,
  }
  if (filters?.platform) params['filter[platform][_eq]'] = filters.platform
  if (filters?.status) params['filter[account_status][_eq]'] = filters.status
  if (filters?.client === null) params['filter[client][_null]'] = 'true'
  else if (filters?.client) params['filter[client][_eq]'] = filters.client

  return directusFetch<SocialAccount[]>('/items/social_accounts', { params })
}

export async function getSocialAccountById(id: string, organization?: string): Promise<SocialAccount | null> {
  try {
    const account = await directusFetch<SocialAccount>(`/items/social_accounts/${id}`)
    if (organization && account && (account.organization as any) !== organization && (account.organization as any)?.id !== organization) {
      return null
    }
    return account
  } catch {
    return null
  }
}

export async function getSocialAccountByPlatformId(
  platform: SocialPlatform,
  platformUserId: string,
  organization: string,
): Promise<SocialAccount | null> {
  const accounts = await directusFetch<SocialAccount[]>('/items/social_accounts', {
    params: {
      'filter[organization][_eq]': organization,
      'filter[platform][_eq]': platform,
      'filter[platform_user_id][_eq]': platformUserId,
      limit: '1',
    },
  })
  return accounts[0] || null
}

export async function createSocialAccount(data: {
  organization: string
  client?: string | null
  platform: SocialPlatform
  platform_user_id: string
  account_name: string
  account_handle: string
  profile_picture_url?: string
  access_token: string
  refresh_token?: string
  token_expires_at: string
  metadata?: Record<string, unknown>
}): Promise<SocialAccount> {
  return directusFetch<SocialAccount>('/items/social_accounts', {
    method: 'POST',
    body: {
      ...data,
      access_token: encryptSocialToken(data.access_token),
      refresh_token: data.refresh_token ? encryptSocialToken(data.refresh_token) : null,
      account_status: 'active',
    },
  })
}

export async function updateSocialAccount(
  id: string,
  data: Partial<{
    account_name: string
    account_handle: string
    profile_picture_url: string
    access_token: string
    refresh_token: string
    token_expires_at: string
    status: 'active' | 'expired' | 'revoked'
    client: string | null
    metadata: Record<string, unknown>
  }>
): Promise<SocialAccount> {
  const updateData: Record<string, unknown> = { ...data }

  if (data.access_token) {
    updateData.access_token = encryptSocialToken(data.access_token)
  }
  if (data.refresh_token) {
    updateData.refresh_token = encryptSocialToken(data.refresh_token)
  }
  if ('status' in updateData) {
    updateData.account_status = updateData.status
    delete updateData.status
  }

  return directusFetch<SocialAccount>(`/items/social_accounts/${id}`, {
    method: 'PATCH',
    body: updateData,
  })
}

export async function deleteSocialAccount(id: string): Promise<void> {
  await directusFetch(`/items/social_accounts/${id}`, { method: 'DELETE' })
}

export async function getDecryptedAccessToken(accountId: string): Promise<string | null> {
  const account = await getSocialAccountById(accountId)
  if (!account) return null
  return safeDecryptSocialToken(account.access_token)
}

export async function getDecryptedRefreshToken(accountId: string): Promise<string | null> {
  const account = await getSocialAccountById(accountId)
  if (!account?.refresh_token) return null
  return safeDecryptSocialToken(account.refresh_token)
}

// ══════════════════════════════════════════════════════════════════════════════
// SOCIAL POSTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Map Directus SocialPost (post_status, Record fields) to frontend SocialPost
 */
function mapDirectusPost(raw: DirectusSocialPost): SocialPost {
  return {
    id: raw.id,
    caption: raw.caption,
    media_urls: Array.isArray(raw.media_urls) ? raw.media_urls : [],
    media_types: Array.isArray(raw.media_types) ? raw.media_types : [],
    thumbnail_url: raw.thumbnail_url ?? null,
    platforms: Array.isArray(raw.platforms) ? raw.platforms : [],
    post_type: raw.post_type ?? 'image',
    scheduled_at: raw.scheduled_at,
    status: (raw.post_status ?? 'draft') as SocialPost['status'],
    publish_results: raw.publish_results ? (Array.isArray(raw.publish_results) ? raw.publish_results : []) : null,
    published_at: raw.published_at ?? null,
    error_message: raw.error_message ?? null,
    created_by: null,
    date_created: raw.date_created ?? '',
    date_updated: raw.date_updated ?? null,
  }
}

/**
 * Map frontend SocialPost fields back to Directus field names for writes
 */
function mapPostToDirectus(data: Record<string, unknown>): Record<string, unknown> {
  const mapped = { ...data }
  // Map 'status' -> 'post_status' for Directus
  if ('status' in mapped) {
    mapped.post_status = mapped.status
    delete mapped.status
  }
  return mapped
}

export async function getSocialPosts(
  organization: string,
  filters?: {
    status?: string
    scheduled_after?: string
    scheduled_before?: string
    client?: string | null
    limit?: number
  },
): Promise<SocialPost[]> {
  const params: Record<string, string> = {
    sort: '-scheduled_at',
    'filter[organization][_eq]': organization,
  }
  if (filters?.status) params['filter[post_status][_eq]'] = filters.status
  if (filters?.scheduled_after) params['filter[scheduled_at][_gte]'] = filters.scheduled_after
  if (filters?.scheduled_before) params['filter[scheduled_at][_lte]'] = filters.scheduled_before
  if (filters?.client === null) params['filter[client][_null]'] = 'true'
  else if (filters?.client) params['filter[client][_eq]'] = filters.client
  if (filters?.limit) params.limit = String(filters.limit)

  const raw = await directusFetch<DirectusSocialPost[]>('/items/social_posts', { params })
  return raw.map(mapDirectusPost)
}

export async function getSocialPostById(id: string, organization?: string): Promise<SocialPost | null> {
  try {
    const raw = await directusFetch<DirectusSocialPost>(`/items/social_posts/${id}`)
    if (organization && raw && (raw.organization as any) !== organization && (raw.organization as any)?.id !== organization) {
      return null
    }
    return mapDirectusPost(raw)
  } catch {
    return null
  }
}

export async function createSocialPost(
  data: Omit<SocialPost, 'id' | 'date_created' | 'date_updated'> & { organization: string; client?: string | null },
): Promise<SocialPost> {
  const raw = await directusFetch<DirectusSocialPost>('/items/social_posts', {
    method: 'POST',
    body: mapPostToDirectus(data as unknown as Record<string, unknown>),
  })
  return mapDirectusPost(raw)
}

export async function updateSocialPost(id: string, data: Partial<SocialPost>): Promise<SocialPost> {
  const raw = await directusFetch<DirectusSocialPost>(`/items/social_posts/${id}`, {
    method: 'PATCH',
    body: mapPostToDirectus(data as unknown as Record<string, unknown>),
  })
  return mapDirectusPost(raw)
}

export async function deleteSocialPost(id: string): Promise<void> {
  await directusFetch(`/items/social_posts/${id}`, { method: 'DELETE' })
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS SNAPSHOTS
// ══════════════════════════════════════════════════════════════════════════════

export async function createAnalyticsSnapshot(
  data: Omit<SocialAnalyticsSnapshot, 'id' | 'date_created'>
): Promise<SocialAnalyticsSnapshot> {
  return directusFetch<SocialAnalyticsSnapshot>('/items/social_analytics_snapshots', {
    method: 'POST',
    body: data,
  })
}

export async function getAnalyticsSnapshots(filters: {
  social_account: string
  snapshot_type?: 'account' | 'post'
  captured_after?: string
  captured_before?: string
  limit?: number
}): Promise<SocialAnalyticsSnapshot[]> {
  const params: Record<string, string> = {
    'filter[social_account][_eq]': filters.social_account,
    sort: '-captured_at',
  }

  if (filters.snapshot_type) params['filter[snapshot_type][_eq]'] = filters.snapshot_type
  if (filters.captured_after) params['filter[captured_at][_gte]'] = filters.captured_after
  if (filters.captured_before) params['filter[captured_at][_lte]'] = filters.captured_before
  if (filters.limit) params.limit = String(filters.limit)

  return directusFetch<SocialAnalyticsSnapshot[]>('/items/social_analytics_snapshots', { params })
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ══════════════════════════════════════════════════════════════════════════════

export async function getSocialComments(filters: {
  social_account?: string
  platform?: SocialPlatform
  is_hidden?: boolean
  limit?: number
}): Promise<SocialComment[]> {
  const params: Record<string, string> = { sort: '-commented_at' }

  if (filters.social_account) params['filter[social_account][_eq]'] = filters.social_account
  if (filters.platform) params['filter[platform][_eq]'] = filters.platform
  if (filters.is_hidden !== undefined) params['filter[is_hidden][_eq]'] = String(filters.is_hidden)
  if (filters.limit) params.limit = String(filters.limit)

  return directusFetch<SocialComment[]>('/items/social_comments', { params })
}

export async function upsertSocialComment(
  data: Omit<SocialComment, 'id' | 'date_created'>
): Promise<SocialComment> {
  const existing = await directusFetch<SocialComment[]>('/items/social_comments', {
    params: { 'filter[platform_comment_id][_eq]': data.platform_comment_id, limit: '1' },
  })

  if (existing.length > 0 && existing[0]) {
    return directusFetch<SocialComment>(`/items/social_comments/${existing[0].id}`, {
      method: 'PATCH',
      body: data,
    })
  }

  return directusFetch<SocialComment>('/items/social_comments', { method: 'POST', body: data })
}

export async function updateSocialComment(id: string, data: Partial<SocialComment>): Promise<SocialComment> {
  return directusFetch<SocialComment>(`/items/social_comments/${id}`, { method: 'PATCH', body: data })
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTIVITY LOG
// ══════════════════════════════════════════════════════════════════════════════

export async function logSocialActivity(data: {
  action: SocialAction
  entity_type: 'post' | 'account' | 'comment'
  entity_id: string
  platform?: SocialPlatform
  details?: Record<string, unknown>
  performed_by?: string
}): Promise<SocialActivityLog> {
  return directusFetch<SocialActivityLog>('/items/social_activity_log', { method: 'POST', body: data })
}

export async function getSocialActivityLog(filters?: {
  action?: SocialAction
  entity_type?: string
  entity_id?: string
  platform?: SocialPlatform
  limit?: number
}): Promise<SocialActivityLog[]> {
  const params: Record<string, string> = { sort: '-date_created' }

  if (filters?.action) params['filter[action][_eq]'] = filters.action
  if (filters?.entity_type) params['filter[entity_type][_eq]'] = filters.entity_type
  if (filters?.entity_id) params['filter[entity_id][_eq]'] = filters.entity_id
  if (filters?.platform) params['filter[platform][_eq]'] = filters.platform
  if (filters?.limit) params.limit = String(filters.limit)

  return directusFetch<SocialActivityLog[]>('/items/social_activity_log', { params })
}

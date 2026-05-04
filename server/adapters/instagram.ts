/**
 * Instagram Graph API Adapter
 *
 * Handles all Instagram API interactions via Meta's Graph API.
 *
 * Features:
 * - OAuth 2.0 flow (Facebook Login for agency multi-account access)
 * - Long-lived token management (60-day tokens with auto-refresh)
 * - Content publishing (images, carousels, Reels, Stories)
 * - Comment management (read, reply, hide, delete)
 * - Insights / analytics fetching
 *
 * API Version: v21.0
 * Docs: https://developers.facebook.com/docs/instagram-api
 */

import type { InstagramMetrics } from '~~/shared/social'
import type {
  PlatformAdapter,
  OAuthTokenResult,
  PlatformAccount,
  PublishPayload,
  PublishResponse,
  PlatformComment,
  PlatformConversation,
  PlatformMessage,
  SendMessagePayload,
} from './types'

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

export function getInstagramConfig() {
  const config = useRuntimeConfig()
  return {
    appId: config.social.instagram.appId,
    appSecret: config.social.instagram.appSecret,
    redirectUri: config.social.instagram.redirectUri,
    apiVersion: config.social.instagram.apiVersion || 'v21.0',
  }
}

function graphUrl(path: string): string {
  const { apiVersion } = getInstagramConfig()
  return `https://graph.facebook.com/${apiVersion}${path}`
}

// ══════════════════════════════════════════════════════════════════════════════
// OAUTH FLOW
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the OAuth authorization URL.
 * Uses Facebook Login flow for multi-account agency access.
 */
export function getInstagramAuthUrl(state: string): string {
  const { appId, redirectUri } = getInstagramConfig()
  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
    'business_management',
  ].join(',')

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    state,
  })

  return `https://www.facebook.com/${getInstagramConfig().apiVersion}/dialog/oauth?${params}`
}

/**
 * Exchange authorization code for tokens.
 * Automatically upgrades to long-lived token (60 days).
 */
export async function exchangeInstagramCode(code: string): Promise<{
  accessToken: string
  expiresIn: number
  userId: string
}> {
  const { appId, appSecret, redirectUri } = getInstagramConfig()

  // Step 1: Exchange code for short-lived token
  const shortLivedRes = await $fetch<{
    access_token: string
    token_type: string
  }>(graphUrl('/oauth/access_token'), {
    params: { client_id: appId, redirect_uri: redirectUri, client_secret: appSecret, code },
  })

  // Step 2: Exchange for long-lived token
  const longLivedRes = await $fetch<{
    access_token: string
    token_type: string
    expires_in: number
  }>(graphUrl('/oauth/access_token'), {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedRes.access_token,
    },
  })

  // Step 3: Get user ID
  const meRes = await $fetch<{ id: string }>(graphUrl('/me'), {
    params: { access_token: longLivedRes.access_token },
  })

  return {
    accessToken: longLivedRes.access_token,
    expiresIn: longLivedRes.expires_in,
    userId: meRes.id,
  }
}

/**
 * Refresh a long-lived token before expiry.
 */
export async function refreshInstagramToken(currentToken: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const { appId, appSecret } = getInstagramConfig()

  const res = await $fetch<{
    access_token: string
    expires_in: number
  }>(graphUrl('/oauth/access_token'), {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: currentToken,
    },
  })

  return { accessToken: res.access_token, expiresIn: res.expires_in }
}

type RawPage = {
  id: string
  name: string
  access_token?: string
}

async function fetchAllGraphPages<T>(
  initialUrl: string,
  initialParams: Record<string, string>,
): Promise<T[]> {
  const all: T[] = []
  let url: string | undefined = initialUrl
  let params: Record<string, string> | undefined = initialParams

  while (url) {
    const res = await $fetch<{ data: T[]; paging?: { next?: string } }>(url, { params })
    all.push(...(res.data || []))
    url = res.paging?.next
    params = undefined
  }
  return all
}

/**
 * Fetch Instagram Business accounts linked to Facebook Pages the user manages.
 *
 * Pulls candidate Pages from three sources and de-duplicates by Page id:
 *   1. /me/accounts — pages the user is a direct admin of
 *   2. owned_pages of every business in /me/businesses (Business Manager)
 *   3. client_pages of every business (partner access via Business Manager)
 *
 * Then for each Page, fetches its linked instagram_business_account (if any).
 */
export async function getInstagramAccounts(accessToken: string): Promise<Array<{
  igUserId: string
  username: string
  name: string
  profilePictureUrl: string
  pageId: string
  pageAccessToken: string
}>> {
  const pageFields = 'id,name,access_token'
  const limit = '200'

  const directPages = await fetchAllGraphPages<RawPage>(graphUrl('/me/accounts'), {
    access_token: accessToken,
    fields: pageFields,
    limit,
  })

  let businesses: Array<{ id: string }> = []
  try {
    businesses = await fetchAllGraphPages<{ id: string }>(graphUrl('/me/businesses'), {
      access_token: accessToken,
      fields: 'id',
      limit,
    })
  } catch (err) {
    console.warn('[social:oauth:instagram] /me/businesses failed (likely missing business_management scope):', err)
  }

  const businessPages: RawPage[] = []
  for (const biz of businesses) {
    for (const path of [`/${biz.id}/owned_pages`, `/${biz.id}/client_pages`]) {
      try {
        const pages = await fetchAllGraphPages<RawPage>(graphUrl(path), {
          access_token: accessToken,
          fields: pageFields,
          limit,
        })
        businessPages.push(...pages)
      } catch (err) {
        console.warn(`[social:oauth:instagram] ${path} failed:`, err)
      }
    }
  }

  const seenPages = new Set<string>()
  const candidatePages: RawPage[] = []
  for (const page of [...directPages, ...businessPages]) {
    if (!page.access_token || seenPages.has(page.id)) continue
    seenPages.add(page.id)
    candidatePages.push(page)
  }

  const accounts: Array<{
    igUserId: string
    username: string
    name: string
    profilePictureUrl: string
    pageId: string
    pageAccessToken: string
  }> = []
  const seenIg = new Set<string>()

  for (const page of candidatePages) {
    try {
      const igRes = await $fetch<{ instagram_business_account?: { id: string } }>(
        graphUrl(`/${page.id}`),
        { params: { access_token: page.access_token!, fields: 'instagram_business_account' } }
      )

      const igId = igRes.instagram_business_account?.id
      if (!igId || seenIg.has(igId)) continue
      seenIg.add(igId)

      const igDetails = await $fetch<{
        id: string
        username: string
        name: string
        profile_picture_url: string
      }>(graphUrl(`/${igId}`), {
        params: { access_token: page.access_token!, fields: 'id,username,name,profile_picture_url' },
      })

      accounts.push({
        igUserId: igDetails.id,
        username: igDetails.username,
        name: igDetails.name || igDetails.username,
        profilePictureUrl: igDetails.profile_picture_url,
        pageId: page.id,
        pageAccessToken: page.access_token!,
      })
    } catch (err) {
      console.warn(`[social:oauth:instagram] Failed to fetch IG account for page ${page.id}:`, err)
    }
  }

  return accounts
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT PUBLISHING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Publish a single image post.
 */
export async function publishInstagramImage(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string
): Promise<{ id: string; permalink?: string }> {
  // Create container
  const container = await $fetch<{ id: string }>(graphUrl(`/${igUserId}/media`), {
    method: 'POST',
    params: { access_token: accessToken, image_url: imageUrl, caption },
  })

  // Publish
  const result = await $fetch<{ id: string }>(graphUrl(`/${igUserId}/media_publish`), {
    method: 'POST',
    params: { access_token: accessToken, creation_id: container.id },
  })

  // Get permalink
  const media = await $fetch<{ permalink: string }>(graphUrl(`/${result.id}`), {
    params: { access_token: accessToken, fields: 'permalink' },
  }).catch(() => null)

  return { id: result.id, permalink: media?.permalink }
}

/**
 * Publish a Reel (video).
 */
export async function publishInstagramReel(
  igUserId: string,
  accessToken: string,
  videoUrl: string,
  caption: string,
  shareToFeed: boolean = true
): Promise<{ id: string; permalink?: string }> {
  // Create container
  const container = await $fetch<{ id: string }>(graphUrl(`/${igUserId}/media`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: shareToFeed,
    },
  })

  // Wait for processing
  await waitForInstagramMediaProcessing(container.id, accessToken)

  // Publish
  const result = await $fetch<{ id: string }>(graphUrl(`/${igUserId}/media_publish`), {
    method: 'POST',
    params: { access_token: accessToken, creation_id: container.id },
  })

  const media = await $fetch<{ permalink: string }>(graphUrl(`/${result.id}`), {
    params: { access_token: accessToken, fields: 'permalink' },
  }).catch(() => null)

  return { id: result.id, permalink: media?.permalink }
}

/**
 * Publish a carousel (multiple images/videos).
 */
export async function publishInstagramCarousel(
  igUserId: string,
  accessToken: string,
  items: Array<{ type: 'image' | 'video'; url: string }>,
  caption: string
): Promise<{ id: string; permalink?: string }> {
  // Create item containers
  const itemIds: string[] = []

  for (const item of items) {
    const params: Record<string, string> = {
      access_token: accessToken,
      is_carousel_item: 'true',
    }

    if (item.type === 'image') {
      params.image_url = item.url
    } else {
      params.media_type = 'VIDEO'
      params.video_url = item.url
    }

    const container = await $fetch<{ id: string }>(graphUrl(`/${igUserId}/media`), {
      method: 'POST',
      params,
    })

    if (item.type === 'video') {
      await waitForInstagramMediaProcessing(container.id, accessToken)
    }

    itemIds.push(container.id)
  }

  // Create carousel container
  const carouselContainer = await $fetch<{ id: string }>(graphUrl(`/${igUserId}/media`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      media_type: 'CAROUSEL',
      children: itemIds.join(','),
      caption,
    },
  })

  // Publish
  const result = await $fetch<{ id: string }>(graphUrl(`/${igUserId}/media_publish`), {
    method: 'POST',
    params: { access_token: accessToken, creation_id: carouselContainer.id },
  })

  const media = await $fetch<{ permalink: string }>(graphUrl(`/${result.id}`), {
    params: { access_token: accessToken, fields: 'permalink' },
  }).catch(() => null)

  return { id: result.id, permalink: media?.permalink }
}

/**
 * Publish a Story (image or video).
 */
export async function publishInstagramStory(
  igUserId: string,
  accessToken: string,
  mediaUrl: string,
  mediaType: 'image' | 'video'
): Promise<{ id: string }> {
  const params: Record<string, string> = {
    access_token: accessToken,
    media_type: 'STORIES',
  }

  if (mediaType === 'image') {
    params.image_url = mediaUrl
  } else {
    params.video_url = mediaUrl
  }

  const container = await $fetch<{ id: string }>(graphUrl(`/${igUserId}/media`), {
    method: 'POST',
    params,
  })

  if (mediaType === 'video') {
    await waitForInstagramMediaProcessing(container.id, accessToken)
  }

  const result = await $fetch<{ id: string }>(graphUrl(`/${igUserId}/media_publish`), {
    method: 'POST',
    params: { access_token: accessToken, creation_id: container.id },
  })

  return result
}

/**
 * Poll media container status until processing completes.
 */
async function waitForInstagramMediaProcessing(
  containerId: string,
  accessToken: string,
  maxAttempts: number = 30,
  intervalMs: number = 5000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await $fetch<{ status_code: string; status: string }>(
      graphUrl(`/${containerId}`),
      { params: { access_token: accessToken, fields: 'status_code,status' } }
    )

    if (status.status_code === 'FINISHED') return
    if (status.status_code === 'ERROR') {
      throw new Error(`Instagram media processing failed: ${status.status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('Instagram media processing timed out')
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get comments on a media object.
 */
export async function getInstagramComments(
  mediaId: string,
  accessToken: string,
  cursor?: string
): Promise<{
  comments: Array<{
    id: string
    text: string
    username: string
    timestamp: string
    like_count: number
    replies?: Array<{ id: string; text: string; username: string; timestamp: string }>
  }>
  nextCursor?: string
}> {
  const res = await $fetch<{
    data: Array<{
      id: string
      text: string
      username: string
      timestamp: string
      like_count: number
      replies?: { data: Array<{ id: string; text: string; username: string; timestamp: string }> }
    }>
    paging?: { cursors: { after: string }; next?: string }
  }>(graphUrl(`/${mediaId}/comments`), {
    params: {
      access_token: accessToken,
      fields: 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp}',
      limit: '50',
      ...(cursor ? { after: cursor } : {}),
    },
  })

  return {
    comments: res.data.map((c) => ({
      ...c,
      replies: c.replies?.data,
    })),
    nextCursor: res.paging?.next ? res.paging.cursors.after : undefined,
  }
}

/**
 * Reply to a comment.
 */
export async function replyToInstagramComment(
  commentId: string,
  accessToken: string,
  message: string
): Promise<{ id: string }> {
  return $fetch(graphUrl(`/${commentId}/replies`), {
    method: 'POST',
    params: { access_token: accessToken, message },
  })
}

/**
 * Hide or unhide a comment.
 */
export async function setInstagramCommentVisibility(
  commentId: string,
  accessToken: string,
  hidden: boolean
): Promise<{ success: boolean }> {
  return $fetch(graphUrl(`/${commentId}`), {
    method: 'POST',
    params: { access_token: accessToken, hide: String(hidden) },
  })
}

/**
 * Delete a comment.
 */
export async function deleteInstagramComment(
  commentId: string,
  accessToken: string
): Promise<{ success: boolean }> {
  return $fetch(graphUrl(`/${commentId}`), {
    method: 'DELETE',
    params: { access_token: accessToken },
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// INSIGHTS / ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get account-level insights.
 */
export async function getInstagramAccountInsights(
  igUserId: string,
  accessToken: string,
  period: 'day' | 'week' | 'days_28' = 'days_28'
): Promise<InstagramMetrics> {
  const [insightsRes, profileRes] = await Promise.all([
    $fetch<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(
      graphUrl(`/${igUserId}/insights`),
      {
        params: {
          access_token: accessToken,
          metric: 'reach,impressions,profile_views,website_clicks',
          period,
        },
      }
    ),
    $fetch<{ followers_count: number; follows_count: number; media_count: number }>(
      graphUrl(`/${igUserId}`),
      { params: { access_token: accessToken, fields: 'followers_count,follows_count,media_count' } }
    ),
  ])

  const metrics: InstagramMetrics = {
    followers_count: profileRes.followers_count,
    following_count: profileRes.follows_count,
    media_count: profileRes.media_count,
  }

  for (const metric of insightsRes.data) {
    const value = metric.values?.[0]?.value ?? 0
    switch (metric.name) {
      case 'reach':
        metrics.reach = value
        break
      case 'impressions':
        metrics.impressions = value
        break
      case 'profile_views':
        metrics.profile_views = value
        break
      case 'website_clicks':
        metrics.website_clicks = value
        break
    }
  }

  return metrics
}

/**
 * Get media-level insights.
 */
export async function getInstagramMediaInsights(
  mediaId: string,
  accessToken: string
): Promise<InstagramMetrics> {
  const res = await $fetch<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(
    graphUrl(`/${mediaId}/insights`),
    {
      params: {
        access_token: accessToken,
        metric: 'impressions,reach,engagement,saved,shares,video_views',
      },
    }
  )

  const metrics: InstagramMetrics = {}
  for (const m of res.data) {
    const value = m.values?.[0]?.value ?? 0
    switch (m.name) {
      case 'impressions':
        metrics.impressions = value
        break
      case 'reach':
        metrics.reach = value
        break
      case 'engagement':
        metrics.engagement_rate = value
        break
      case 'saved':
        metrics.saves = value
        break
      case 'shares':
        metrics.shares = value
        break
      case 'video_views':
        metrics.plays = value
        break
    }
  }

  return metrics
}

/**
 * Daily history of account-level insights for a [since, until] window.
 *
 * Returns one row per day. Meta retains ~28 days for most IG account metrics;
 * `profile_views` and `website_clicks` are user-only metrics that may be empty
 * for Business accounts. Values outside the retention window come back missing.
 */
export async function getInstagramAccountInsightsHistory(
  igUserId: string,
  accessToken: string,
  sinceUnix: number,
  untilUnix: number,
): Promise<Array<{ date: string; metrics: Record<string, number> }>> {
  const res = await $fetch<{
    data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>
  }>(graphUrl(`/${igUserId}/insights`), {
    params: {
      access_token: accessToken,
      metric: 'reach,impressions,profile_views,website_clicks',
      period: 'day',
      since: String(sinceUnix),
      until: String(untilUnix),
    },
  }).catch(() => ({ data: [] }))

  const byDate = new Map<string, Record<string, number>>()
  for (const metric of res.data || []) {
    for (const v of metric.values || []) {
      const day = v.end_time?.slice(0, 10)
      if (!day) continue
      const row = byDate.get(day) || {}
      row[metric.name] = Number(v.value) || 0
      byDate.set(day, row)
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, metrics]) => ({ date, metrics }))
}

/**
 * Per-post insights for an IG media object. Returns a flat metric → number map.
 *
 * `video_views` is only valid for video media — we attempt the full set and
 * fall back to the non-video set on `(#100)` errors so the call doesn't fail
 * for image/carousel posts.
 */
export async function getInstagramPostInsights(
  mediaId: string,
  accessToken: string,
): Promise<Record<string, number>> {
  const fetchInsights = async (metricList: string) => {
    const r = await $fetch<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(
      graphUrl(`/${mediaId}/insights`),
      { params: { access_token: accessToken, metric: metricList } },
    )
    return r
  }

  let res
  try {
    res = await fetchInsights('impressions,reach,engagement,saved,video_views')
  } catch {
    res = await fetchInsights('impressions,reach,engagement,saved').catch(() => ({ data: [] }))
  }

  const metrics: Record<string, number> = {}
  for (const m of res.data || []) {
    metrics[m.name] = m.values?.[0]?.value ?? 0
  }
  return metrics
}

/**
 * Get recent media for an account.
 */
export async function getInstagramRecentMedia(
  igUserId: string,
  accessToken: string,
  limit: number = 25
): Promise<
  Array<{
    id: string
    caption: string
    media_type: string
    media_url: string
    thumbnail_url?: string
    permalink: string
    timestamp: string
    like_count: number
    comments_count: number
  }>
> {
  const res = await $fetch<{
    data: Array<{
      id: string
      caption: string
      media_type: string
      media_url: string
      thumbnail_url?: string
      permalink: string
      timestamp: string
      like_count: number
      comments_count: number
    }>
  }>(graphUrl(`/${igUserId}/media`), {
    params: {
      access_token: accessToken,
      fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
      limit: String(limit),
    },
  })

  return res.data
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGING (Instagram DMs via Messenger Platform)
//
// All endpoints require the linked Page Access Token (not the IG user token) and
// the `?platform=instagram` query param when calling /me-scoped Messenger routes.
// ══════════════════════════════════════════════════════════════════════════════

type RawInstagramConversation = {
  id: string
  updated_time: string
  snippet?: string
  unread_count?: number
  participants?: {
    data: Array<{ id: string; username?: string; name?: string }>
  }
}

/**
 * List IG conversations for a Page-linked IG account.
 *
 * @param igUserId IG account id — used to identify the Page side of each thread.
 * @param pageAccessToken The linked Page Access Token (user tokens won't work — gotcha).
 */
export async function getInstagramConversations(
  igUserId: string,
  pageAccessToken: string,
  cursor?: string,
): Promise<{ conversations: PlatformConversation[]; nextCursor?: string }> {
  const params: Record<string, string> = {
    access_token: pageAccessToken,
    platform: 'instagram',
    fields: 'id,updated_time,snippet,unread_count,participants{id,username,name}',
    limit: '50',
  }
  if (cursor) params.after = cursor

  const res = await $fetch<{
    data: RawInstagramConversation[]
    paging?: { cursors?: { after?: string }; next?: string }
  }>(graphUrl('/me/conversations'), { params })

  const conversations: PlatformConversation[] = (res.data || []).map((c) => {
    const participant = c.participants?.data?.find(p => p.id !== igUserId)
    return {
      threadId: c.id,
      participantId: participant?.id || '',
      participantName: participant?.username || participant?.name,
      lastMessageAt: c.updated_time,
      lastMessagePreview: c.snippet,
      unreadCount: c.unread_count,
    }
  })

  return {
    conversations,
    nextCursor: res.paging?.next ? res.paging.cursors?.after : undefined,
  }
}

type RawInstagramMessageAttachment = {
  mime_type?: string
  image_data?: { url?: string }
  video_data?: { url?: string }
  file_url?: string
}

type RawInstagramMessage = {
  id: string
  message?: string
  created_time: string
  from?: { id: string; username?: string }
  attachments?: { data: RawInstagramMessageAttachment[] }
}

/**
 * List messages in an IG conversation. `igUserId` is required so we can flag outgoing messages.
 */
export async function getInstagramMessages(
  threadId: string,
  igUserId: string,
  pageAccessToken: string,
  cursor?: string,
): Promise<{ messages: PlatformMessage[]; nextCursor?: string }> {
  const params: Record<string, string> = {
    access_token: pageAccessToken,
    fields: 'id,message,created_time,from,attachments',
    limit: '50',
  }
  if (cursor) params.after = cursor

  const res = await $fetch<{
    data: RawInstagramMessage[]
    paging?: { cursors?: { after?: string }; next?: string }
  }>(graphUrl(`/${threadId}/messages`), { params })

  const messages: PlatformMessage[] = (res.data || []).map(m => ({
    messageId: m.id,
    threadId,
    fromId: m.from?.id || '',
    isOutgoing: m.from?.id === igUserId,
    text: m.message,
    attachments: (m.attachments?.data || []).map((a) => {
      const url = a.image_data?.url || a.video_data?.url || a.file_url || ''
      return {
        type: a.mime_type?.startsWith('image/')
          ? 'image' as const
          : a.mime_type?.startsWith('video/')
            ? 'video' as const
            : a.mime_type?.startsWith('audio/')
              ? 'audio' as const
              : 'file' as const,
        url,
      }
    }).filter(a => a.url),
    createdAt: m.created_time,
  }))

  return {
    messages,
    nextCursor: res.paging?.next ? res.paging.cursors?.after : undefined,
  }
}

/**
 * Send a DM to an IG user. Uses the Messenger Send API with `?platform=instagram` semantics.
 *
 * IG attachment types are limited: image, video, audio (no generic file).
 */
export async function sendInstagramMessage(
  recipientIgsid: string,
  pageAccessToken: string,
  payload: SendMessagePayload,
): Promise<{ messageId: string }> {
  const message: Record<string, unknown> = {}
  if (payload.text) message.text = payload.text
  if (payload.mediaUrl) {
    const t = payload.mediaType === 'file' ? 'image' : (payload.mediaType || 'image')
    message.attachment = {
      type: t,
      payload: { url: payload.mediaUrl, is_reusable: true },
    }
  }

  const res = await $fetch<{ message_id: string; recipient_id: string }>(graphUrl('/me/messages'), {
    method: 'POST',
    params: { access_token: pageAccessToken },
    body: {
      recipient: { id: recipientIgsid },
      messaging_type: 'RESPONSE',
      message,
    },
  })

  return { messageId: res.message_id }
}

/**
 * Mark an IG conversation as seen (sender_action=mark_seen).
 */
export async function markInstagramConversationSeen(
  recipientIgsid: string,
  pageAccessToken: string,
): Promise<{ success: boolean }> {
  await $fetch(graphUrl('/me/messages'), {
    method: 'POST',
    params: { access_token: pageAccessToken },
    body: {
      recipient: { id: recipientIgsid },
      sender_action: 'mark_seen',
    },
  })
  return { success: true }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADAPTER INSTANCE
// ══════════════════════════════════════════════════════════════════════════════

export const instagramAdapter: PlatformAdapter = {
  platform: 'instagram',

  getAuthUrl: getInstagramAuthUrl,

  async exchangeCode(code: string): Promise<OAuthTokenResult> {
    return exchangeInstagramCode(code)
  },

  async refreshToken(token: string): Promise<OAuthTokenResult> {
    return refreshInstagramToken(token)
  },

  async getAccounts(accessToken: string): Promise<PlatformAccount[]> {
    const accounts = await getInstagramAccounts(accessToken)
    return accounts.map(a => ({
      platformUserId: a.igUserId,
      name: a.name,
      handle: a.username,
      profilePictureUrl: a.profilePictureUrl,
      metadata: {
        pageId: a.pageId,
        pageAccessToken: a.pageAccessToken,
      },
    }))
  },

  async publishPost(accountId, accessToken, payload): Promise<PublishResponse> {
    let result: { id: string; permalink?: string }

    if (payload.mediaUrls?.length && payload.mediaTypes?.[0] === 'video') {
      result = await publishInstagramReel(accountId, accessToken, payload.mediaUrls[0]!, payload.text)
    } else if (payload.mediaUrls?.length && payload.mediaUrls.length > 1) {
      const items = payload.mediaUrls.map((url, i) => ({
        type: (payload.mediaTypes?.[i] === 'video' ? 'video' : 'image') as 'image' | 'video',
        url,
      }))
      result = await publishInstagramCarousel(accountId, accessToken, items, payload.text)
    } else if (payload.mediaUrls?.length) {
      result = await publishInstagramImage(accountId, accessToken, payload.mediaUrls[0]!, payload.text)
    } else {
      throw new Error('Instagram requires at least one media URL — text-only posts are not supported.')
    }

    return {
      platformPostId: result.id,
      permalink: result.permalink,
    }
  },

  async getAccountMetrics(accountId, accessToken) {
    const metrics = await getInstagramAccountInsights(accountId, accessToken)
    return {
      followers_count: metrics.followers_count || 0,
      reach: metrics.reach || 0,
      impressions: metrics.impressions || 0,
      engagement_rate: metrics.engagement_rate || 0,
      profile_views: metrics.profile_views || 0,
    }
  },

  async getPostInsights(platformPostId, accessToken) {
    return getInstagramPostInsights(platformPostId, accessToken)
  },

  async getAccountMetricsHistory(accountId, accessToken, sinceUnix, untilUnix) {
    return getInstagramAccountInsightsHistory(accountId, accessToken, sinceUnix, untilUnix)
  },

  async listRecentPostIds(accountId, accessToken, limit) {
    const media = await getInstagramRecentMedia(accountId, accessToken, limit)
    return media
      .map((m) => ({ platformPostId: m.id, createdAt: m.timestamp }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async getComments(mediaId, accessToken) {
    const result = await getInstagramComments(mediaId, accessToken)
    return {
      comments: result.comments.map<PlatformComment>(c => ({
        id: c.id,
        text: c.text,
        authorName: c.username,
        createdAt: c.timestamp,
        likeCount: c.like_count,
        replies: c.replies?.map(r => ({
          id: r.id,
          text: r.text,
          authorName: r.username,
          createdAt: r.timestamp,
        })),
      })),
      nextCursor: result.nextCursor,
    }
  },

  async replyToComment(commentId, accessToken, message) {
    return replyToInstagramComment(commentId, accessToken, message)
  },

  async getConversations(accountId, accessToken, cursor) {
    return getInstagramConversations(accountId, accessToken, cursor)
  },

  async getMessages(threadId, accountId, accessToken, cursor) {
    return getInstagramMessages(threadId, accountId, accessToken, cursor)
  },

  async sendMessage(recipientId, accessToken, payload) {
    return sendInstagramMessage(recipientId, accessToken, payload)
  },

  async markRead(recipientId, accessToken) {
    return markInstagramConversationSeen(recipientId, accessToken)
  },
}

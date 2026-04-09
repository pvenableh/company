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

import type { InstagramMetrics } from '~~/types/social'

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

/**
 * Fetch Instagram Business accounts linked to user's Facebook Pages.
 */
export async function getInstagramAccounts(accessToken: string): Promise<Array<{
  igUserId: string
  username: string
  name: string
  profilePictureUrl: string
  pageId: string
  pageAccessToken: string
}>> {
  // Get user's Pages
  const pagesRes = await $fetch<{
    data: Array<{ id: string; name: string; access_token: string }>
  }>(graphUrl('/me/accounts'), {
    params: { access_token: accessToken, fields: 'id,name,access_token' },
  })

  const accounts = []

  for (const page of pagesRes.data) {
    try {
      const igRes = await $fetch<{ instagram_business_account?: { id: string } }>(
        graphUrl(`/${page.id}`),
        { params: { access_token: page.access_token, fields: 'instagram_business_account' } }
      )

      if (igRes.instagram_business_account) {
        const igDetails = await $fetch<{
          id: string
          username: string
          name: string
          profile_picture_url: string
        }>(graphUrl(`/${igRes.instagram_business_account.id}`), {
          params: { access_token: page.access_token, fields: 'id,username,name,profile_picture_url' },
        })

        accounts.push({
          igUserId: igDetails.id,
          username: igDetails.username,
          name: igDetails.name || igDetails.username,
          profilePictureUrl: igDetails.profile_picture_url,
          pageId: page.id,
          pageAccessToken: page.access_token,
        })
      }
    } catch (err) {
      console.warn(`[instagram] Failed to fetch IG account for page ${page.id}:`, err)
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

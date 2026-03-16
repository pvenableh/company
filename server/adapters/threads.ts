/**
 * Threads API Adapter
 *
 * Handles all Threads API interactions via Meta's Threads API.
 *
 * Features:
 * - OAuth 2.0 flow (Threads-specific)
 * - Container-based publishing (similar to Instagram)
 * - Text, image, video, and carousel posts
 * - Insights / analytics
 * - Reply management
 *
 * Docs: https://developers.facebook.com/docs/threads
 */

import type { ThreadsMetrics } from '~/types/social'
import type {
  PlatformAdapter,
  OAuthTokenResult,
  PlatformAccount,
  PublishPayload,
  PublishResponse,
  PlatformComment,
} from './types'

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const THREADS_AUTH_URL = 'https://threads.net/oauth/authorize'
const THREADS_GRAPH_URL = 'https://graph.threads.net'

export function getThreadsConfig() {
  const config = useRuntimeConfig()
  return {
    appId: config.social.threads.appId,
    appSecret: config.social.threads.appSecret,
    redirectUri: config.social.threads.redirectUri,
  }
}

function threadsUrl(path: string): string {
  return `${THREADS_GRAPH_URL}/v1.0${path}`
}

// ══════════════════════════════════════════════════════════════════════════════
// OAUTH FLOW
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the Threads OAuth authorization URL.
 */
export function getThreadsAuthUrl(state: string): string {
  const { appId, redirectUri } = getThreadsConfig()
  const scopes = [
    'threads_basic',
    'threads_content_publish',
    'threads_manage_insights',
    'threads_manage_replies',
  ]

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes.join(','),
    response_type: 'code',
    state,
  })

  return `${THREADS_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange authorization code for a short-lived token, then upgrade to long-lived.
 * Long-lived tokens last 60 days.
 */
export async function exchangeThreadsCode(code: string): Promise<OAuthTokenResult> {
  const { appId, appSecret, redirectUri } = getThreadsConfig()

  // Step 1: Exchange code for short-lived token
  const shortLived = await $fetch<{
    access_token: string
    user_id: number
  }>(`${THREADS_GRAPH_URL}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }).toString(),
  })

  // Step 2: Exchange for long-lived token (60 days)
  const longLived = await $fetch<{
    access_token: string
    token_type: string
    expires_in: number
  }>(`${THREADS_GRAPH_URL}/access_token`, {
    params: {
      grant_type: 'th_exchange_token',
      client_secret: appSecret,
      access_token: shortLived.access_token,
    },
  })

  return {
    accessToken: longLived.access_token,
    expiresIn: longLived.expires_in,
    userId: String(shortLived.user_id),
  }
}

/**
 * Refresh a long-lived token.
 * Must be refreshed within the 60-day window; cannot refresh expired tokens.
 */
export async function refreshThreadsToken(currentToken: string): Promise<OAuthTokenResult> {
  const res = await $fetch<{
    access_token: string
    token_type: string
    expires_in: number
  }>(`${THREADS_GRAPH_URL}/refresh_access_token`, {
    params: {
      grant_type: 'th_refresh_token',
      access_token: currentToken,
    },
  })

  return {
    accessToken: res.access_token,
    expiresIn: res.expires_in,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// USER INFO
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get the authenticated Threads user profile.
 */
export async function getThreadsProfile(accessToken: string): Promise<{
  id: string
  username: string
  name: string
  profilePictureUrl: string
  biography: string
}> {
  const res = await $fetch<{
    id: string
    username: string
    name: string
    threads_profile_picture_url: string
    threads_biography: string
  }>(threadsUrl('/me'), {
    params: {
      access_token: accessToken,
      fields: 'id,username,name,threads_profile_picture_url,threads_biography',
    },
  })

  return {
    id: res.id,
    username: res.username,
    name: res.name || res.username,
    profilePictureUrl: res.threads_profile_picture_url,
    biography: res.threads_biography,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT PUBLISHING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Publish a text-only post to Threads.
 */
export async function publishThreadsText(
  userId: string,
  accessToken: string,
  text: string,
): Promise<{ id: string; permalink?: string }> {
  // Step 1: Create container
  const container = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      media_type: 'TEXT',
      text,
    },
  })

  // Step 2: Publish
  const published = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads_publish`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      creation_id: container.id,
    },
  })

  return { id: published.id }
}

/**
 * Publish an image post to Threads.
 */
export async function publishThreadsImage(
  userId: string,
  accessToken: string,
  imageUrl: string,
  text: string,
): Promise<{ id: string; permalink?: string }> {
  // Step 1: Create container
  const container = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      media_type: 'IMAGE',
      image_url: imageUrl,
      text,
    },
  })

  // Step 2: Publish
  const published = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads_publish`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      creation_id: container.id,
    },
  })

  return { id: published.id }
}

/**
 * Publish a video post to Threads.
 */
export async function publishThreadsVideo(
  userId: string,
  accessToken: string,
  videoUrl: string,
  text: string,
): Promise<{ id: string; permalink?: string }> {
  // Step 1: Create container
  const container = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      media_type: 'VIDEO',
      video_url: videoUrl,
      text,
    },
  })

  // Step 2: Wait for processing
  await waitForThreadsProcessing(container.id, accessToken)

  // Step 3: Publish
  const published = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads_publish`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      creation_id: container.id,
    },
  })

  return { id: published.id }
}

/**
 * Publish a carousel post to Threads (multiple images/videos).
 */
export async function publishThreadsCarousel(
  userId: string,
  accessToken: string,
  items: Array<{ type: 'image' | 'video'; url: string }>,
  text: string,
): Promise<{ id: string; permalink?: string }> {
  // Step 1: Create item containers
  const itemIds: string[] = []

  for (const item of items) {
    const params: Record<string, string> = {
      access_token: accessToken,
      media_type: item.type === 'video' ? 'VIDEO' : 'IMAGE',
      is_carousel_item: 'true',
    }

    if (item.type === 'video') {
      params.video_url = item.url
    } else {
      params.image_url = item.url
    }

    const container = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads`), {
      method: 'POST',
      params,
    })

    // Wait for video processing
    if (item.type === 'video') {
      await waitForThreadsProcessing(container.id, accessToken)
    }

    itemIds.push(container.id)
  }

  // Step 2: Create carousel container
  const carousel = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      media_type: 'CAROUSEL',
      children: itemIds.join(','),
      text,
    },
  })

  // Step 3: Publish
  const published = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads_publish`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      creation_id: carousel.id,
    },
  })

  return { id: published.id }
}

/**
 * Wait for Threads media container to finish processing.
 * Polls status every 5s, max 30 attempts.
 */
async function waitForThreadsProcessing(
  containerId: string,
  accessToken: string,
  maxAttempts: number = 30,
  intervalMs: number = 5000,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await $fetch<{
      status: string
      error_message?: string
    }>(threadsUrl(`/${containerId}`), {
      params: {
        access_token: accessToken,
        fields: 'status,error_message',
      },
    })

    if (status.status === 'FINISHED') return
    if (status.status === 'ERROR') {
      throw new Error(`Threads media processing failed: ${status.error_message || 'Unknown error'}`)
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw new Error('Threads media processing timed out')
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS / INSIGHTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get Threads user-level insights.
 */
export async function getThreadsUserInsights(
  userId: string,
  accessToken: string,
): Promise<ThreadsMetrics> {
  const res = await $fetch<{
    data: Array<{
      name: string
      values: Array<{ value: number }>
    }>
  }>(threadsUrl(`/${userId}/threads_insights`), {
    params: {
      access_token: accessToken,
      metric: 'views,likes,replies,reposts,quotes,followers_count',
    },
  }).catch(() => ({ data: [] }))

  const metricsMap: Record<string, number> = {}
  for (const metric of res.data || []) {
    metricsMap[metric.name] = metric.values?.[0]?.value || 0
  }

  return {
    followers_count: metricsMap.followers_count || 0,
    post_count: 0, // Not available via insights
    likes: metricsMap.likes,
    replies: metricsMap.replies,
    reposts: metricsMap.reposts,
  }
}

/**
 * Get insights for a specific Threads post.
 */
export async function getThreadsMediaInsights(
  mediaId: string,
  accessToken: string,
): Promise<Record<string, number>> {
  const res = await $fetch<{
    data: Array<{
      name: string
      values: Array<{ value: number }>
    }>
  }>(threadsUrl(`/${mediaId}/insights`), {
    params: {
      access_token: accessToken,
      metric: 'views,likes,replies,reposts,quotes',
    },
  }).catch(() => ({ data: [] }))

  const metrics: Record<string, number> = {}
  for (const metric of res.data || []) {
    metrics[metric.name] = metric.values?.[0]?.value || 0
  }

  return metrics
}

// ══════════════════════════════════════════════════════════════════════════════
// REPLIES (COMMENTS)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get replies to a Threads post.
 */
export async function getThreadsReplies(
  mediaId: string,
  accessToken: string,
): Promise<Array<{
  id: string
  text: string
  username: string
  timestamp: string
}>> {
  const res = await $fetch<{
    data: Array<{
      id: string
      text: string
      username: string
      timestamp: string
    }>
  }>(threadsUrl(`/${mediaId}/replies`), {
    params: {
      access_token: accessToken,
      fields: 'id,text,username,timestamp',
    },
  })

  return res.data || []
}

/**
 * Reply to a Threads post.
 */
export async function replyToThreadsPost(
  userId: string,
  replyToId: string,
  accessToken: string,
  text: string,
): Promise<{ id: string }> {
  // Step 1: Create reply container
  const container = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      media_type: 'TEXT',
      text,
      reply_to_id: replyToId,
    },
  })

  // Step 2: Publish the reply
  const published = await $fetch<{ id: string }>(threadsUrl(`/${userId}/threads_publish`), {
    method: 'POST',
    params: {
      access_token: accessToken,
      creation_id: container.id,
    },
  })

  return { id: published.id }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADAPTER INSTANCE
// ══════════════════════════════════════════════════════════════════════════════

export const threadsAdapter: PlatformAdapter = {
  platform: 'threads',

  getAuthUrl: getThreadsAuthUrl,
  exchangeCode: exchangeThreadsCode,
  refreshToken: refreshThreadsToken,

  async getAccounts(accessToken: string): Promise<PlatformAccount[]> {
    const profile = await getThreadsProfile(accessToken)
    return [
      {
        platformUserId: profile.id,
        name: profile.name,
        handle: profile.username,
        profilePictureUrl: profile.profilePictureUrl,
      },
    ]
  },

  async publishPost(accountId, accessToken, payload): Promise<PublishResponse> {
    let result: { id: string; permalink?: string }

    if (payload.mediaUrls?.length && payload.mediaUrls.length > 1) {
      // Carousel
      result = await publishThreadsCarousel(
        accountId,
        accessToken,
        payload.mediaUrls.map((url, i) => ({
          type: payload.mediaTypes?.[i] || 'image',
          url,
        })),
        payload.text,
      )
    } else if (payload.mediaUrls?.length && payload.mediaTypes?.[0] === 'video') {
      result = await publishThreadsVideo(accountId, accessToken, payload.mediaUrls[0], payload.text)
    } else if (payload.mediaUrls?.length) {
      result = await publishThreadsImage(accountId, accessToken, payload.mediaUrls[0], payload.text)
    } else {
      result = await publishThreadsText(accountId, accessToken, payload.text)
    }

    return {
      platformPostId: result.id,
      permalink: result.permalink,
    }
  },

  async getAccountMetrics(accountId, accessToken) {
    const metrics = await getThreadsUserInsights(accountId, accessToken)
    return {
      followers_count: metrics.followers_count,
      post_count: metrics.post_count,
      likes: metrics.likes || 0,
      replies: metrics.replies || 0,
      reposts: metrics.reposts || 0,
    }
  },

  async getComments(mediaId, accessToken) {
    const replies = await getThreadsReplies(mediaId, accessToken)
    return {
      comments: replies.map(r => ({
        id: r.id,
        text: r.text,
        authorName: r.username,
        createdAt: r.timestamp,
      })),
    }
  },

  async replyToComment(commentId, accessToken, message) {
    // Need the user ID for Threads replies — extract from the media ID context
    // In practice, the caller should provide userId::mediaId format
    const [userId, mediaId] = commentId.split('::')
    return replyToThreadsPost(userId, mediaId, accessToken, message)
  },
}

/**
 * Facebook Pages API Adapter
 *
 * Handles Facebook Page management via Meta's Graph API.
 * Shares infrastructure with the Instagram adapter (same Meta app).
 *
 * Features:
 * - OAuth 2.0 flow (Facebook Login with Page management scopes)
 * - Page discovery and management
 * - Content publishing (text, images, video, links)
 * - Page insights / analytics
 * - Comment management
 *
 * API Version: v21.0
 * Docs: https://developers.facebook.com/docs/pages-api
 */

import type { FacebookMetrics } from '~~/shared/social'
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

export function getFacebookConfig() {
  const config = useRuntimeConfig()
  return {
    appId: config.social.facebook.appId,
    appSecret: config.social.facebook.appSecret,
    redirectUri: config.social.facebook.redirectUri,
    apiVersion: 'v21.0',
  }
}

function graphUrl(path: string): string {
  const { apiVersion } = getFacebookConfig()
  return `https://graph.facebook.com/${apiVersion}${path}`
}

// ══════════════════════════════════════════════════════════════════════════════
// OAUTH FLOW
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the Facebook OAuth authorization URL.
 * Requests Page management scopes for publishing and insights.
 */
export function getFacebookAuthUrl(state: string): string {
  const { appId, redirectUri } = getFacebookConfig()
  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_engagement',
    'pages_read_user_content',
    'read_insights',
    'business_management',
  ]

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes.join(','),
    response_type: 'code',
    state,
  })

  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`
}

/**
 * Exchange authorization code for access token.
 * Then upgrade to a long-lived token (60 days).
 */
export async function exchangeFacebookCode(code: string): Promise<OAuthTokenResult> {
  const { appId, appSecret, redirectUri } = getFacebookConfig()

  // Step 1: Exchange code for short-lived token
  const shortLived = await $fetch<{
    access_token: string
    token_type: string
    expires_in: number
  }>(graphUrl('/oauth/access_token'), {
    params: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    },
  })

  // Step 2: Upgrade to long-lived token
  const longLived = await $fetch<{
    access_token: string
    token_type: string
    expires_in: number
  }>(graphUrl('/oauth/access_token'), {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.access_token,
    },
  })

  // Step 3: Get user ID
  const me = await $fetch<{ id: string }>(graphUrl('/me'), {
    params: { access_token: longLived.access_token },
  })

  return {
    accessToken: longLived.access_token,
    expiresIn: longLived.expires_in,
    userId: me.id,
  }
}

/**
 * Refresh a long-lived token.
 * Facebook long-lived tokens can be refreshed before they expire.
 */
export async function refreshFacebookToken(currentToken: string): Promise<OAuthTokenResult> {
  const { appId, appSecret } = getFacebookConfig()

  const res = await $fetch<{
    access_token: string
    token_type: string
    expires_in: number
  }>(graphUrl('/oauth/access_token'), {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: currentToken,
    },
  })

  return {
    accessToken: res.access_token,
    expiresIn: res.expires_in,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE DISCOVERY
// ══════════════════════════════════════════════════════════════════════════════

type RawFacebookPage = {
  id: string
  name: string
  category: string
  access_token?: string
  picture?: { data?: { url: string } }
  followers_count?: number
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
 * Get Facebook Pages the user manages.
 *
 * Pulls from three sources and de-duplicates by page id:
 *   1. /me/accounts — pages the user is a direct admin of
 *   2. owned_pages of every business in /me/businesses (Business Manager)
 *   3. client_pages of every business (partner access via Business Manager)
 *
 * Pages without an access_token are dropped — they aren't posting-capable.
 */
export async function getFacebookPages(accessToken: string): Promise<Array<{
  pageId: string
  name: string
  category: string
  pictureUrl: string
  pageAccessToken: string
  followersCount: number
}>> {
  const fields = 'id,name,category,access_token,picture,followers_count'
  const limit = '200'

  const directPages = await fetchAllGraphPages<RawFacebookPage>(graphUrl('/me/accounts'), {
    access_token: accessToken,
    fields,
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
    console.warn('[social:oauth:facebook] /me/businesses failed (likely missing business_management scope):', err)
  }

  const businessPages: RawFacebookPage[] = []
  for (const biz of businesses) {
    for (const path of [`/${biz.id}/owned_pages`, `/${biz.id}/client_pages`]) {
      try {
        const pages = await fetchAllGraphPages<RawFacebookPage>(graphUrl(path), {
          access_token: accessToken,
          fields,
          limit,
        })
        businessPages.push(...pages)
      } catch (err) {
        console.warn(`[social:oauth:facebook] ${path} failed:`, err)
      }
    }
  }

  const seen = new Set<string>()
  const merged: RawFacebookPage[] = []
  for (const page of [...directPages, ...businessPages]) {
    if (!page.access_token || seen.has(page.id)) continue
    seen.add(page.id)
    merged.push(page)
  }

  return merged.map(page => ({
    pageId: page.id,
    name: page.name,
    category: page.category,
    pictureUrl: page.picture?.data?.url || '',
    pageAccessToken: page.access_token!,
    followersCount: page.followers_count || 0,
  }))
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT PUBLISHING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Publish a text post to a Facebook Page.
 */
export async function publishFacebookTextPost(
  pageId: string,
  pageAccessToken: string,
  message: string,
  link?: string,
): Promise<{ id: string; permalink?: string }> {
  const body: Record<string, string> = { message }
  if (link) body.link = link

  const res = await $fetch<{ id: string }>(graphUrl(`/${pageId}/feed`), {
    method: 'POST',
    params: { access_token: pageAccessToken },
    body,
  })

  return {
    id: res.id,
    permalink: `https://www.facebook.com/${res.id}`,
  }
}

/**
 * Publish a photo post to a Facebook Page.
 */
export async function publishFacebookPhoto(
  pageId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string,
): Promise<{ id: string; permalink?: string }> {
  const res = await $fetch<{ id: string; post_id: string }>(graphUrl(`/${pageId}/photos`), {
    method: 'POST',
    params: { access_token: pageAccessToken },
    body: {
      url: imageUrl,
      message: caption,
    },
  })

  return {
    id: res.post_id || res.id,
    permalink: `https://www.facebook.com/${res.post_id || res.id}`,
  }
}

/**
 * Publish multiple photos as a single post.
 */
export async function publishFacebookPhotoAlbum(
  pageId: string,
  pageAccessToken: string,
  imageUrls: string[],
  caption: string,
): Promise<{ id: string; permalink?: string }> {
  // Step 1: Upload each photo as unpublished
  const photoIds: string[] = []

  for (const url of imageUrls) {
    const res = await $fetch<{ id: string }>(graphUrl(`/${pageId}/photos`), {
      method: 'POST',
      params: { access_token: pageAccessToken },
      body: {
        url,
        published: 'false',
      },
    })
    photoIds.push(res.id)
  }

  // Step 2: Create post with attached photos
  const attachedMedia: Record<string, string> = {}
  photoIds.forEach((id, index) => {
    attachedMedia[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id })
  })

  const res = await $fetch<{ id: string }>(graphUrl(`/${pageId}/feed`), {
    method: 'POST',
    params: {
      access_token: pageAccessToken,
      message: caption,
      ...attachedMedia,
    },
  })

  return {
    id: res.id,
    permalink: `https://www.facebook.com/${res.id}`,
  }
}

/**
 * Publish a video to a Facebook Page.
 */
export async function publishFacebookVideo(
  pageId: string,
  pageAccessToken: string,
  videoUrl: string,
  description: string,
): Promise<{ id: string; permalink?: string }> {
  const res = await $fetch<{ id: string }>(graphUrl(`/${pageId}/videos`), {
    method: 'POST',
    params: { access_token: pageAccessToken },
    body: {
      file_url: videoUrl,
      description,
    },
  })

  return {
    id: res.id,
    permalink: `https://www.facebook.com/${res.id}`,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS / INSIGHTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get Facebook Page insights.
 */
export async function getFacebookPageInsights(
  pageId: string,
  pageAccessToken: string,
  period: 'day' | 'week' | 'days_28' = 'days_28',
): Promise<FacebookMetrics> {
  // Get page info
  const pageInfo = await $fetch<{
    followers_count: number
    fan_count: number
  }>(graphUrl(`/${pageId}`), {
    params: {
      access_token: pageAccessToken,
      fields: 'followers_count,fan_count',
    },
  })

  // Get page insights
  const insights = await $fetch<{
    data: Array<{
      name: string
      values: Array<{ value: number }>
    }>
  }>(graphUrl(`/${pageId}/insights`), {
    params: {
      access_token: pageAccessToken,
      metric: 'page_impressions,page_post_engagements,page_fan_adds',
      period,
    },
  }).catch(() => ({ data: [] }))

  const metricsMap: Record<string, number> = {}
  for (const metric of insights.data || []) {
    metricsMap[metric.name] = metric.values?.[0]?.value || 0
  }

  // Get post count
  const posts = await $fetch<{
    data: Array<{ id: string }>
  }>(graphUrl(`/${pageId}/posts`), {
    params: {
      access_token: pageAccessToken,
      limit: '1',
      summary: 'true',
    },
  }).catch(() => ({ data: [] }))

  return {
    followers_count: pageInfo.followers_count || 0,
    page_likes: pageInfo.fan_count || 0,
    post_count: posts.data?.length || 0,
    reach: metricsMap.page_impressions,
    impressions: metricsMap.page_impressions,
    engagement_rate: metricsMap.page_post_engagements
      ? (metricsMap.page_post_engagements / (metricsMap.page_impressions || 1)) * 100
      : undefined,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get comments on a Facebook post.
 */
export async function getFacebookComments(
  postId: string,
  pageAccessToken: string,
  cursor?: string,
): Promise<{
  comments: Array<{
    id: string
    message: string
    from: { id: string; name: string }
    created_time: string
    like_count: number
  }>
  nextCursor?: string
}> {
  const params: Record<string, string> = {
    access_token: pageAccessToken,
    fields: 'id,message,from,created_time,like_count',
    limit: '50',
  }
  if (cursor) params.after = cursor

  const res = await $fetch<{
    data: Array<{
      id: string
      message: string
      from: { id: string; name: string }
      created_time: string
      like_count: number
    }>
    paging?: { cursors?: { after?: string }; next?: string }
  }>(graphUrl(`/${postId}/comments`), { params })

  return {
    comments: res.data || [],
    nextCursor: res.paging?.next ? res.paging.cursors?.after : undefined,
  }
}

/**
 * Reply to a Facebook comment.
 */
export async function replyToFacebookComment(
  commentId: string,
  pageAccessToken: string,
  message: string,
): Promise<{ id: string }> {
  return await $fetch<{ id: string }>(graphUrl(`/${commentId}/comments`), {
    method: 'POST',
    params: { access_token: pageAccessToken },
    body: { message },
  })
}

/**
 * Delete a Facebook comment.
 */
export async function deleteFacebookComment(
  commentId: string,
  pageAccessToken: string,
): Promise<{ success: boolean }> {
  await $fetch(graphUrl(`/${commentId}`), {
    method: 'DELETE',
    params: { access_token: pageAccessToken },
  })
  return { success: true }
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGING (Page DMs via Messenger Platform)
// ══════════════════════════════════════════════════════════════════════════════

type RawFacebookConversation = {
  id: string
  updated_time: string
  snippet?: string
  unread_count?: number
  participants?: {
    data: Array<{ id: string; name?: string; email?: string }>
  }
}

/**
 * List conversations for a Page.
 * Returns participant info derived from `participants.data` (the entry whose id != pageId).
 */
export async function getFacebookConversations(
  pageId: string,
  pageAccessToken: string,
  cursor?: string,
): Promise<{ conversations: PlatformConversation[]; nextCursor?: string }> {
  const params: Record<string, string> = {
    access_token: pageAccessToken,
    fields: 'id,updated_time,snippet,unread_count,participants{id,name}',
    limit: '50',
  }
  if (cursor) params.after = cursor

  const res = await $fetch<{
    data: RawFacebookConversation[]
    paging?: { cursors?: { after?: string }; next?: string }
  }>(graphUrl(`/${pageId}/conversations`), { params })

  const conversations: PlatformConversation[] = (res.data || []).map((c) => {
    const participant = c.participants?.data?.find(p => p.id !== pageId)
    return {
      threadId: c.id,
      participantId: participant?.id || '',
      participantName: participant?.name,
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

type RawFacebookMessageAttachment = {
  mime_type?: string
  image_data?: { url?: string }
  video_data?: { url?: string }
  file_url?: string
}

type RawFacebookMessage = {
  id: string
  message?: string
  created_time: string
  from?: { id: string; name?: string }
  attachments?: { data: RawFacebookMessageAttachment[] }
}

/**
 * List messages in a conversation. Page id is required so we can flag outgoing messages.
 */
export async function getFacebookMessages(
  threadId: string,
  pageId: string,
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
    data: RawFacebookMessage[]
    paging?: { cursors?: { after?: string }; next?: string }
  }>(graphUrl(`/${threadId}/messages`), { params })

  const messages: PlatformMessage[] = (res.data || []).map(m => ({
    messageId: m.id,
    threadId,
    fromId: m.from?.id || '',
    isOutgoing: m.from?.id === pageId,
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
 * Send a message to a participant. Uses the Send API at `/me/messages` with the Page token.
 *
 * For inbound-initiated threads, the standard 24-hour messaging window applies.
 * For outside-window messages we'd need `messaging_type: 'MESSAGE_TAG'` + a tag — out of scope for v1.
 */
export async function sendFacebookMessage(
  recipientPsid: string,
  pageAccessToken: string,
  payload: SendMessagePayload,
): Promise<{ messageId: string }> {
  const message: Record<string, unknown> = {}
  if (payload.text) message.text = payload.text
  if (payload.mediaUrl) {
    message.attachment = {
      type: payload.mediaType || 'image',
      payload: { url: payload.mediaUrl, is_reusable: true },
    }
  }

  const res = await $fetch<{ message_id: string; recipient_id: string }>(graphUrl('/me/messages'), {
    method: 'POST',
    params: { access_token: pageAccessToken },
    body: {
      recipient: { id: recipientPsid },
      messaging_type: 'RESPONSE',
      message,
    },
  })

  return { messageId: res.message_id }
}

/**
 * Mark a conversation as seen by the Page (sender_action=mark_seen).
 */
export async function markFacebookConversationSeen(
  recipientPsid: string,
  pageAccessToken: string,
): Promise<{ success: boolean }> {
  await $fetch(graphUrl('/me/messages'), {
    method: 'POST',
    params: { access_token: pageAccessToken },
    body: {
      recipient: { id: recipientPsid },
      sender_action: 'mark_seen',
    },
  })
  return { success: true }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADAPTER INSTANCE
// ══════════════════════════════════════════════════════════════════════════════

export const facebookAdapter: PlatformAdapter = {
  platform: 'facebook',

  getAuthUrl: getFacebookAuthUrl,
  exchangeCode: exchangeFacebookCode,
  refreshToken: refreshFacebookToken,

  async getAccounts(accessToken: string): Promise<PlatformAccount[]> {
    const pages = await getFacebookPages(accessToken)
    return pages.map(page => ({
      platformUserId: page.pageId,
      name: page.name,
      handle: page.category,
      profilePictureUrl: page.pictureUrl,
      metadata: {
        pageAccessToken: page.pageAccessToken,
        category: page.category,
        followersCount: page.followersCount,
      },
    }))
  },

  async publishPost(accountId, accessToken, payload): Promise<PublishResponse> {
    let result: { id: string; permalink?: string }

    if (payload.mediaUrls?.length && payload.mediaTypes?.[0] === 'video') {
      result = await publishFacebookVideo(accountId, accessToken, payload.mediaUrls[0], payload.text)
    } else if (payload.mediaUrls?.length && payload.mediaUrls.length > 1) {
      result = await publishFacebookPhotoAlbum(accountId, accessToken, payload.mediaUrls, payload.text)
    } else if (payload.mediaUrls?.length) {
      result = await publishFacebookPhoto(accountId, accessToken, payload.mediaUrls[0], payload.text)
    } else {
      result = await publishFacebookTextPost(accountId, accessToken, payload.text)
    }

    return {
      platformPostId: result.id,
      permalink: result.permalink,
    }
  },

  async getAccountMetrics(accountId, accessToken) {
    const metrics = await getFacebookPageInsights(accountId, accessToken)
    return {
      followers_count: metrics.followers_count,
      page_likes: metrics.page_likes,
      post_count: metrics.post_count,
      reach: metrics.reach || 0,
      impressions: metrics.impressions || 0,
      engagement_rate: metrics.engagement_rate || 0,
    }
  },

  async getComments(mediaId, accessToken) {
    const result = await getFacebookComments(mediaId, accessToken)
    return {
      comments: result.comments.map(c => ({
        id: c.id,
        text: c.message,
        authorName: c.from?.name || 'Unknown',
        createdAt: c.created_time,
        likeCount: c.like_count,
      })),
      nextCursor: result.nextCursor,
    }
  },

  async replyToComment(commentId, accessToken, message) {
    return replyToFacebookComment(commentId, accessToken, message)
  },

  async getConversations(accountId, accessToken, cursor) {
    return getFacebookConversations(accountId, accessToken, cursor)
  },

  async getMessages(threadId, accountId, accessToken, cursor) {
    return getFacebookMessages(threadId, accountId, accessToken, cursor)
  },

  async sendMessage(recipientId, accessToken, payload) {
    return sendFacebookMessage(recipientId, accessToken, payload)
  },

  async markRead(recipientId, accessToken) {
    return markFacebookConversationSeen(recipientId, accessToken)
  },
}

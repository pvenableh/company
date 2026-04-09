/**
 * TikTok Content Posting API Adapter
 *
 * Handles all TikTok API interactions.
 *
 * Features:
 * - OAuth 2.0 flow
 * - Token management (24h access, 365-day refresh)
 * - Content posting (Direct Post + Upload to Inbox)
 * - Post status tracking
 * - Video analytics
 *
 * Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
 */

import type { TikTokMetrics, TikTokPostOptions } from '~~/types/social'

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize'
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const TIKTOK_API = 'https://open.tiktokapis.com/v2'

export function getTikTokConfig() {
  const config = useRuntimeConfig()
  return {
    clientKey: config.social.tiktok.clientKey,
    clientSecret: config.social.tiktok.clientSecret,
    redirectUri: config.social.tiktok.redirectUri,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// OAUTH FLOW
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate TikTok OAuth authorization URL.
 */
export function getTikTokAuthUrl(state: string): string {
  const { clientKey, redirectUri } = getTikTokConfig()
  const scopes = ['user.info.basic', 'video.upload', 'video.publish', 'video.list'].join(',')

  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    state,
  })

  return `${TIKTOK_AUTH_URL}/?${params}`
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeTikTokCode(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
  openId: string
}> {
  const { clientKey, clientSecret, redirectUri } = getTikTokConfig()

  const res = await $fetch<{
    access_token: string
    refresh_token: string
    expires_in: number
    refresh_expires_in: number
    open_id: string
  }>(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  })

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresIn: res.expires_in,
    refreshExpiresIn: res.refresh_expires_in,
    openId: res.open_id,
  }
}

/**
 * Refresh an expired access token.
 */
export async function refreshTikTokToken(refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
}> {
  const { clientKey, clientSecret } = getTikTokConfig()

  const res = await $fetch<{
    access_token: string
    refresh_token: string
    expires_in: number
    refresh_expires_in: number
  }>(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresIn: res.expires_in,
    refreshExpiresIn: res.refresh_expires_in,
  }
}

/**
 * Get authenticated user's profile.
 */
export async function getTikTokUserInfo(accessToken: string): Promise<{
  openId: string
  displayName: string
  avatarUrl: string
  username: string
}> {
  const res = await $fetch<{
    data: { user: { open_id: string; display_name: string; avatar_url: string; username: string } }
  }>(`${TIKTOK_API}/user/info/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { fields: 'open_id,display_name,avatar_url,username' },
  })

  return {
    openId: res.data.user.open_id,
    displayName: res.data.user.display_name,
    avatarUrl: res.data.user.avatar_url,
    username: res.data.user.username,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATOR INFO (Required before posting)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Query creator info — MUST call before posting.
 */
export async function queryTikTokCreatorInfo(accessToken: string): Promise<{
  creatorAvatarUrl: string
  creatorNickname: string
  privacyLevelOptions: string[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxVideoPostDurationSec: number
}> {
  const res = await $fetch<{
    data: {
      creator_avatar_url: string
      creator_nickname: string
      privacy_level_options: string[]
      comment_disabled: boolean
      duet_disabled: boolean
      stitch_disabled: boolean
      max_video_post_duration_sec: number
    }
  }>(`${TIKTOK_API}/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  })

  return {
    creatorAvatarUrl: res.data.creator_avatar_url,
    creatorNickname: res.data.creator_nickname,
    privacyLevelOptions: res.data.privacy_level_options,
    commentDisabled: res.data.comment_disabled,
    duetDisabled: res.data.duet_disabled,
    stitchDisabled: res.data.stitch_disabled,
    maxVideoPostDurationSec: res.data.max_video_post_duration_sec,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT POSTING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Direct Post a video via PULL_FROM_URL.
 * NOTE: Requires audit approval for public visibility.
 */
export async function directPostTikTokVideo(
  accessToken: string,
  videoUrl: string,
  options: TikTokPostOptions & { title: string }
): Promise<{ publishId: string }> {
  const res = await $fetch<{
    data: { publish_id: string }
    error: { code: string; message: string }
  }>(`${TIKTOK_API}/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: {
      post_info: {
        title: options.title,
        privacy_level: options.privacy_level,
        disable_duet: options.disable_duet,
        disable_stitch: options.disable_stitch,
        disable_comment: options.disable_comment,
        video_cover_timestamp_ms: options.video_cover_timestamp_ms || 1000,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    },
  })

  if (res.error?.code !== 'ok') {
    throw new Error(`TikTok direct post failed: ${res.error.message}`)
  }

  return { publishId: res.data.publish_id }
}

/**
 * Upload video to TikTok's Inbox (draft mode).
 * User receives notification to finalize and post.
 * Does NOT require audit approval.
 */
export async function uploadTikTokToInbox(
  accessToken: string,
  videoUrl: string
): Promise<{ publishId: string }> {
  const res = await $fetch<{
    data: { publish_id: string }
    error: { code: string; message: string }
  }>(`${TIKTOK_API}/post/publish/inbox/video/init/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: {
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    },
  })

  if (res.error?.code !== 'ok') {
    throw new Error(`TikTok inbox upload failed: ${res.error.message}`)
  }

  return { publishId: res.data.publish_id }
}

/**
 * Direct Post photos via PULL_FROM_URL.
 */
export async function directPostTikTokPhotos(
  accessToken: string,
  photoUrls: string[],
  options: TikTokPostOptions & { title: string; description?: string }
): Promise<{ publishId: string }> {
  const res = await $fetch<{
    data: { publish_id: string }
    error: { code: string; message: string }
  }>(`${TIKTOK_API}/post/publish/content/init/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: {
      post_info: {
        title: options.title,
        description: options.description || '',
        privacy_level: options.privacy_level,
        disable_comment: options.disable_comment,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_urls: photoUrls,
      },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    },
  })

  if (res.error?.code !== 'ok') {
    throw new Error(`TikTok photo post failed: ${res.error.message}`)
  }

  return { publishId: res.data.publish_id }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST STATUS
// ══════════════════════════════════════════════════════════════════════════════

export type TikTokPostStatus =
  | 'PROCESSING_UPLOAD'
  | 'PROCESSING_DOWNLOAD'
  | 'SEND_TO_USER_INBOX'
  | 'PUBLISH_COMPLETE'
  | 'FAILED'

/**
 * Check post publishing status.
 */
export async function getTikTokPostStatus(
  accessToken: string,
  publishId: string
): Promise<{
  status: TikTokPostStatus
  failReason?: string
  postId?: string
}> {
  const res = await $fetch<{
    data: {
      status: TikTokPostStatus
      fail_reason?: string
      publicaly_available_post_id?: string[]
    }
    error: { code: string; message: string }
  }>(`${TIKTOK_API}/post/publish/status/fetch/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: { publish_id: publishId },
  })

  return {
    status: res.data.status,
    failReason: res.data.fail_reason,
    postId: res.data.publicaly_available_post_id?.[0],
  }
}

/**
 * Poll status until complete or failed.
 */
export async function waitForTikTokPostCompletion(
  accessToken: string,
  publishId: string,
  maxAttempts: number = 20,
  intervalMs: number = 10000
): Promise<{
  status: string
  postId?: string
  failReason?: string
}> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getTikTokPostStatus(accessToken, publishId)

    if (result.status === 'PUBLISH_COMPLETE' || result.status === 'SEND_TO_USER_INBOX') {
      return result
    }

    if (result.status === 'FAILED') {
      return result
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  return { status: 'TIMEOUT', failReason: 'Post status check timed out' }
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get user's video list with metrics.
 */
export async function getTikTokUserVideos(
  accessToken: string,
  maxCount: number = 20,
  cursor?: number
): Promise<{
  videos: Array<{
    id: string
    title: string
    create_time: number
    cover_image_url: string
    like_count: number
    comment_count: number
    share_count: number
    view_count: number
    duration: number
  }>
  cursor: number
  hasMore: boolean
}> {
  const body: Record<string, unknown> = {
    fields: 'id,title,create_time,cover_image_url,like_count,comment_count,share_count,view_count,duration',
    max_count: maxCount,
  }
  if (cursor) body.cursor = cursor

  const res = await $fetch<{
    data: {
      videos: Array<{
        id: string
        title: string
        create_time: number
        cover_image_url: string
        like_count: number
        comment_count: number
        share_count: number
        view_count: number
        duration: number
      }>
      cursor: number
      has_more: boolean
    }
    error: { code: string; message: string }
  }>(`${TIKTOK_API}/video/list/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body,
  })

  return {
    videos: res.data.videos || [],
    cursor: res.data.cursor,
    hasMore: res.data.has_more,
  }
}

/**
 * Aggregate account-level metrics from videos.
 */
export async function getTikTokAccountMetrics(accessToken: string): Promise<TikTokMetrics> {
  const { videos } = await getTikTokUserVideos(accessToken, 20)

  const totals = videos.reduce(
    (acc, v) => ({
      views: acc.views + (v.view_count || 0),
      likes: acc.likes + (v.like_count || 0),
      comments: acc.comments + (v.comment_count || 0),
      shares: acc.shares + (v.share_count || 0),
    }),
    { views: 0, likes: 0, comments: 0, shares: 0 }
  )

  const engagementRate =
    totals.views > 0
      ? ((totals.likes + totals.comments + totals.shares) / totals.views) * 100
      : 0

  return {
    video_count: videos.length,
    view_count: totals.views,
    like_count: totals.likes,
    comment_count: totals.comments,
    share_count: totals.shares,
    engagement_rate: Math.round(engagementRate * 100) / 100,
  }
}

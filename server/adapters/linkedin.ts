/**
 * LinkedIn API Adapter
 *
 * Handles all LinkedIn API interactions via the Community Management API.
 *
 * Features:
 * - OAuth 2.0 flow with OpenID Connect
 * - Personal profile and Organization page management
 * - Content publishing (text, images, video, articles)
 * - Post analytics
 * - Comment management
 *
 * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/
 */

import type { LinkedInMetrics } from '~~/types/social'
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

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const LINKEDIN_API = 'https://api.linkedin.com/v2'
const LINKEDIN_REST = 'https://api.linkedin.com/rest'

export function getLinkedInConfig() {
  const config = useRuntimeConfig()
  return {
    clientId: config.social.linkedin.clientId,
    clientSecret: config.social.linkedin.clientSecret,
    redirectUri: config.social.linkedin.redirectUri,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// OAUTH FLOW
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the OAuth authorization URL.
 * Uses OpenID Connect for profile info + social scopes for posting.
 */
export function getLinkedInAuthUrl(state: string): string {
  const { clientId, redirectUri } = getLinkedInConfig()
  const scopes = [
    'openid',
    'profile',
    'w_member_social',
    'r_organization_social',
    'w_organization_social',
    'rw_organization_admin',
  ]

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(' '),
  })

  return `${LINKEDIN_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange authorization code for access token.
 * LinkedIn tokens last 60 days; refresh tokens last 365 days.
 */
export async function exchangeLinkedInCode(code: string): Promise<OAuthTokenResult> {
  const { clientId, clientSecret, redirectUri } = getLinkedInConfig()

  const res = await $fetch<{
    access_token: string
    expires_in: number
    refresh_token?: string
    refresh_token_expires_in?: number
  }>(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
  })

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresIn: res.expires_in,
  }
}

/**
 * Refresh an expired access token.
 */
export async function refreshLinkedInToken(refreshToken: string): Promise<OAuthTokenResult> {
  const { clientId, clientSecret } = getLinkedInConfig()

  const res = await $fetch<{
    access_token: string
    expires_in: number
    refresh_token?: string
    refresh_token_expires_in?: number
  }>(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })

  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresIn: res.expires_in,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// USER / ACCOUNT INFO
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get the authenticated user's profile via OpenID Connect userinfo.
 */
export async function getLinkedInProfile(accessToken: string): Promise<{
  sub: string
  name: string
  picture?: string
  email?: string
}> {
  return await $fetch<{
    sub: string
    name: string
    picture?: string
    email?: string
  }>('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

/**
 * Get organizations (Company Pages) the user administers.
 */
export async function getLinkedInOrganizations(accessToken: string): Promise<Array<{
  organizationId: string
  name: string
  vanityName: string
  logoUrl?: string
}>> {
  const res = await $fetch<{
    elements: Array<{
      organization: string
      role: string
      state: string
    }>
  }>(`${LINKEDIN_API}/organizationalEntityAcls`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202401',
    },
    params: {
      q: 'roleAssignee',
      role: 'ADMINISTRATOR',
      state: 'APPROVED',
      projection: '(elements*(organization,role,state))',
    },
  })

  const orgs: Array<{
    organizationId: string
    name: string
    vanityName: string
    logoUrl?: string
  }> = []

  for (const element of res.elements || []) {
    // Extract org ID from URN like "urn:li:organization:12345"
    const orgId = element.organization.replace('urn:li:organization:', '')

    try {
      const orgDetails = await $fetch<{
        localizedName: string
        vanityName: string
        logoV2?: { 'original~'?: { elements?: Array<{ identifiers?: Array<{ identifier: string }> }> } }
      }>(`${LINKEDIN_API}/organizations/${orgId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'LinkedIn-Version': '202401',
        },
      })

      orgs.push({
        organizationId: orgId,
        name: orgDetails.localizedName,
        vanityName: orgDetails.vanityName || orgId,
        logoUrl: orgDetails.logoV2?.['original~']?.elements?.[0]?.identifiers?.[0]?.identifier,
      })
    } catch {
      // Skip orgs we can't fetch details for
    }
  }

  return orgs
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT PUBLISHING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Publish a post to LinkedIn (personal profile or organization page).
 *
 * @param authorUrn - URN like "urn:li:person:{id}" or "urn:li:organization:{id}"
 * @param accessToken - OAuth access token
 * @param content - Post content
 */
export async function publishLinkedInPost(
  authorUrn: string,
  accessToken: string,
  content: {
    text: string
    mediaUrls?: string[]
    mediaTypes?: ('image' | 'video')[]
    visibility?: 'PUBLIC' | 'CONNECTIONS'
    articleUrl?: string
    articleTitle?: string
  },
): Promise<{ id: string; permalink?: string }> {
  const visibility = content.visibility || 'PUBLIC'

  // Build the post body
  const postBody: Record<string, unknown> = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    visibility: visibility === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC',
    commentary: content.text,
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
  }

  // Article sharing
  if (content.articleUrl) {
    postBody.content = {
      article: {
        source: content.articleUrl,
        title: content.articleTitle || content.text.slice(0, 100),
      },
    }
  }
  // Image upload
  else if (content.mediaUrls?.length && content.mediaTypes?.[0] === 'image') {
    const imageIds: string[] = []

    for (const url of content.mediaUrls) {
      const imageId = await uploadLinkedInImage(authorUrn, accessToken, url)
      imageIds.push(imageId)
    }

    if (imageIds.length === 1) {
      postBody.content = {
        media: { id: imageIds[0] },
      }
    } else {
      postBody.content = {
        multiImage: {
          images: imageIds.map(id => ({ id })),
        },
      }
    }
  }
  // Video
  else if (content.mediaUrls?.length && content.mediaTypes?.[0] === 'video') {
    const videoId = await uploadLinkedInVideo(authorUrn, accessToken, content.mediaUrls[0])
    postBody.content = {
      media: { id: videoId },
    }
  }

  const res = await $fetch<{ id: string }>(`${LINKEDIN_REST}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202401',
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: postBody,
  })

  return {
    id: res.id || '',
    permalink: res.id ? `https://www.linkedin.com/feed/update/${res.id}` : undefined,
  }
}

/**
 * Upload an image to LinkedIn for use in a post.
 * Uses the Images API with a two-step process: initialize + upload binary.
 */
async function uploadLinkedInImage(
  ownerUrn: string,
  accessToken: string,
  imageUrl: string,
): Promise<string> {
  // Step 1: Initialize upload
  const initRes = await $fetch<{
    value: {
      uploadUrl: string
      image: string
    }
  }>(`${LINKEDIN_REST}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202401',
      'Content-Type': 'application/json',
    },
    params: { action: 'initializeUpload' },
    body: {
      initializeUploadRequest: {
        owner: ownerUrn,
      },
    },
  })

  // Step 2: Download the image and upload to LinkedIn
  const imageBuffer = await $fetch<ArrayBuffer>(imageUrl, { responseType: 'arrayBuffer' })

  await $fetch(initRes.value.uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: imageBuffer,
  })

  return initRes.value.image
}

/**
 * Upload a video to LinkedIn.
 * Uses the Videos API with initialize + upload + finalize.
 */
async function uploadLinkedInVideo(
  ownerUrn: string,
  accessToken: string,
  videoUrl: string,
): Promise<string> {
  // Download video to get size
  const videoBuffer = await $fetch<ArrayBuffer>(videoUrl, { responseType: 'arrayBuffer' })

  // Step 1: Initialize upload
  const initRes = await $fetch<{
    value: {
      uploadUrl: string
      video: string
    }
  }>(`${LINKEDIN_REST}/videos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202401',
      'Content-Type': 'application/json',
    },
    params: { action: 'initializeUpload' },
    body: {
      initializeUploadRequest: {
        owner: ownerUrn,
        fileSizeBytes: videoBuffer.byteLength,
      },
    },
  })

  // Step 2: Upload binary
  await $fetch(initRes.value.uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: videoBuffer,
  })

  return initRes.value.video
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get analytics for a LinkedIn organization page.
 */
export async function getLinkedInPageAnalytics(
  organizationId: string,
  accessToken: string,
): Promise<LinkedInMetrics> {
  // Get follower count
  const statsRes = await $fetch<{
    elements: Array<{
      followerCounts: { organicFollowerCount: number; paidFollowerCount: number }
    }>
  }>(`${LINKEDIN_API}/organizationalEntityFollowerStatistics`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202401',
    },
    params: {
      q: 'organizationalEntity',
      organizationalEntity: `urn:li:organization:${organizationId}`,
    },
  }).catch(() => ({ elements: [] }))

  const followers = statsRes.elements?.[0]?.followerCounts
  const followerCount = followers
    ? followers.organicFollowerCount + followers.paidFollowerCount
    : 0

  // Get share statistics
  const shareStats = await $fetch<{
    elements: Array<{
      totalShareStatistics: {
        shareCount: number
        clickCount: number
        impressionCount: number
        engagement: number
      }
    }>
  }>(`${LINKEDIN_API}/organizationalEntityShareStatistics`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202401',
    },
    params: {
      q: 'organizationalEntity',
      organizationalEntity: `urn:li:organization:${organizationId}`,
    },
  }).catch(() => ({ elements: [] }))

  const stats = shareStats.elements?.[0]?.totalShareStatistics

  return {
    followers_count: followerCount,
    post_count: stats?.shareCount || 0,
    impressions: stats?.impressionCount,
    clicks: stats?.clickCount,
    engagement_rate: stats?.engagement ? stats.engagement * 100 : undefined,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get comments on a LinkedIn post.
 */
export async function getLinkedInComments(
  postUrn: string,
  accessToken: string,
): Promise<Array<{
  id: string
  text: string
  authorName: string
  createdAt: string
}>> {
  const res = await $fetch<{
    elements: Array<{
      id: string
      message: { text: string }
      actor: string
      created: { time: number }
    }>
  }>(`${LINKEDIN_API}/socialActions/${encodeURIComponent(postUrn)}/comments`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202401',
    },
  })

  return (res.elements || []).map(c => ({
    id: c.id,
    text: c.message?.text || '',
    authorName: c.actor || 'Unknown',
    createdAt: new Date(c.created?.time || 0).toISOString(),
  }))
}

/**
 * Reply to a LinkedIn comment.
 */
export async function replyToLinkedInComment(
  postUrn: string,
  commentId: string,
  accessToken: string,
  message: string,
): Promise<{ id: string }> {
  const res = await $fetch<{ id: string }>(
    `${LINKEDIN_API}/socialActions/${encodeURIComponent(postUrn)}/comments/${commentId}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': '202401',
        'Content-Type': 'application/json',
      },
      body: {
        message: { text: message },
      },
    },
  )

  return { id: res.id }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADAPTER INSTANCE
// ══════════════════════════════════════════════════════════════════════════════

export const linkedInAdapter: PlatformAdapter = {
  platform: 'linkedin',

  getAuthUrl: getLinkedInAuthUrl,
  exchangeCode: exchangeLinkedInCode,
  refreshToken: refreshLinkedInToken,

  async getAccounts(accessToken: string): Promise<PlatformAccount[]> {
    const profile = await getLinkedInProfile(accessToken)
    const accounts: PlatformAccount[] = [
      {
        platformUserId: profile.sub,
        name: profile.name,
        handle: profile.name,
        profilePictureUrl: profile.picture,
        metadata: { type: 'personal', authorUrn: `urn:li:person:${profile.sub}` },
      },
    ]

    // Also fetch organization pages the user administers
    const orgs = await getLinkedInOrganizations(accessToken).catch(() => [])
    for (const org of orgs) {
      accounts.push({
        platformUserId: `org_${org.organizationId}`,
        name: org.name,
        handle: org.vanityName,
        profilePictureUrl: org.logoUrl,
        metadata: { type: 'organization', authorUrn: `urn:li:organization:${org.organizationId}` },
      })
    }

    return accounts
  },

  async publishPost(accountId, accessToken, payload): Promise<PublishResponse> {
    // Determine author URN — default to personal profile
    const authorUrn = (payload.options?.author_urn as string) || `urn:li:person:${accountId}`

    const result = await publishLinkedInPost(authorUrn, accessToken, {
      text: payload.text,
      mediaUrls: payload.mediaUrls,
      mediaTypes: payload.mediaTypes,
      visibility: (payload.options?.visibility as 'PUBLIC' | 'CONNECTIONS') || 'PUBLIC',
    })

    return {
      platformPostId: result.id,
      permalink: result.permalink,
    }
  },

  async getAccountMetrics(accountId, accessToken) {
    const metrics = await getLinkedInPageAnalytics(accountId, accessToken)
    return {
      followers_count: metrics.followers_count,
      post_count: metrics.post_count,
      impressions: metrics.impressions || 0,
      clicks: metrics.clicks || 0,
      engagement_rate: metrics.engagement_rate || 0,
    }
  },

  async getComments(mediaId, accessToken) {
    const comments = await getLinkedInComments(mediaId, accessToken)
    return {
      comments: comments.map(c => ({
        id: c.id,
        text: c.text,
        authorName: c.authorName,
        createdAt: c.createdAt,
      })),
    }
  },

  async replyToComment(commentId, accessToken, message) {
    // Comment ID format: "postUrn:commentId" — split to get both parts
    const [postUrn, actualCommentId] = commentId.split('::')
    return replyToLinkedInComment(postUrn, actualCommentId, accessToken, message)
  },
}

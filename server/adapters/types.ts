/**
 * PlatformAdapter Interface
 *
 * Shared types and interface for social media platform adapters.
 * New adapters (LinkedIn, Facebook, Threads) implement this interface.
 * Existing adapters (Instagram, TikTok) can be migrated in a follow-up.
 */

import type { SocialPlatform } from '~~/shared/social'

// ══════════════════════════════════════════════════════════════════════════════
// SHARED TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface OAuthTokenResult {
  accessToken: string
  refreshToken?: string
  /** Seconds until expiry. Optional — some providers (e.g. Meta) omit this for non-expiring tokens. */
  expiresIn?: number
  userId?: string
}

export interface PlatformAccount {
  platformUserId: string
  name: string
  handle: string
  profilePictureUrl?: string
  /** Platform-specific metadata (e.g., page ID, org URN) */
  metadata?: Record<string, unknown>
}

export interface PublishPayload {
  text: string
  mediaUrls?: string[]
  mediaTypes?: ('image' | 'video')[]
  postType: string
  /** Platform-specific options */
  options?: Record<string, unknown>
}

export interface PublishResponse {
  platformPostId: string
  permalink?: string
}

export interface PlatformComment {
  id: string
  text: string
  authorName: string
  authorProfileUrl?: string
  createdAt: string
  likeCount?: number
  replies?: PlatformComment[]
}

export interface PlatformConversation {
  /** Meta's t_{...} for FB, conversation id for IG */
  threadId: string
  /** PSID (FB) or IGSID (IG) of the human participant (i.e. not the Page) */
  participantId: string
  participantName?: string
  participantAvatar?: string
  /** ISO timestamp of the most recent message */
  lastMessageAt: string
  lastMessagePreview?: string
  unreadCount?: number
}

export interface PlatformMessage {
  /** Meta's `mid` */
  messageId: string
  threadId: string
  /** PSID/IGSID of sender, or Page id if this is an outgoing message */
  fromId: string
  isOutgoing: boolean
  text?: string
  attachments?: Array<{
    type: 'image' | 'video' | 'audio' | 'file'
    url: string
  }>
  reactions?: Array<{ fromId: string; emoji: string }>
  /** ISO timestamp from the platform (not Directus date_created) */
  createdAt: string
}

export interface SendMessagePayload {
  text?: string
  mediaUrl?: string
  mediaType?: 'image' | 'video' | 'audio' | 'file'
}

// ══════════════════════════════════════════════════════════════════════════════
// ADAPTER INTERFACE
// ══════════════════════════════════════════════════════════════════════════════

export interface PlatformAdapter {
  readonly platform: SocialPlatform

  // ── OAuth ──
  getAuthUrl(state: string): string
  exchangeCode(code: string): Promise<OAuthTokenResult>
  refreshToken(token: string): Promise<OAuthTokenResult>

  // ── Account Discovery ──
  /** Fetch accounts/pages the user has access to after OAuth */
  getAccounts(accessToken: string): Promise<PlatformAccount[]>

  // ── Publishing ──
  publishPost(
    accountId: string,
    accessToken: string,
    payload: PublishPayload,
  ): Promise<PublishResponse>

  // ── Analytics (optional) ──
  getAccountMetrics?(
    accountId: string,
    accessToken: string,
  ): Promise<Record<string, number>>

  /**
   * Per-post insights. Called from the daily refresh cron for posts published
   * in the last week. Adapters that don't implement this leave their post-level
   * snapshots empty until added. Errors should bubble — caller handles per-post
   * tolerance.
   */
  getPostInsights?(
    platformPostId: string,
    accessToken: string,
  ): Promise<Record<string, number>>

  /**
   * Daily account-metrics history for a [since, until] window. Used by the
   * per-account backfill route. Adapters return one row per day inside the
   * window. Platforms with no historical insights endpoint (e.g. Threads)
   * should not implement this.
   *
   * Meta-side retention is typically ~28 days for most page/IG metrics; the
   * adapter forwards what the platform returns and never extrapolates.
   */
  getAccountMetricsHistory?(
    accountId: string,
    accessToken: string,
    sinceUnix: number,
    untilUnix: number,
  ): Promise<Array<{ date: string; metrics: Record<string, number> }>>

  /**
   * Period-aggregate account-metrics for a [since, until] window. Used for
   * platform metrics that Meta requires `metric_type=total_value` for and
   * therefore can't return as a daily time-series (e.g. IG `views`,
   * `profile_views`, `website_clicks` after Graph API v22). Adapters return
   * a single flat metric→number map representing the whole window.
   */
  getAccountMetricsAggregate?(
    accountId: string,
    accessToken: string,
    sinceUnix: number,
    untilUnix: number,
  ): Promise<Record<string, number>>

  /**
   * List the platform-post ids of recent posts on an account, oldest-first up
   * to `limit`. Used by the backfill route to find posts to fetch insights for.
   * Doesn't return insights itself — caller pairs each id with getPostInsights.
   */
  listRecentPostIds?(
    accountId: string,
    accessToken: string,
    limit: number,
  ): Promise<Array<{ platformPostId: string; createdAt: string }>>

  // ── Comments (optional) ──
  getComments?(
    mediaId: string,
    accessToken: string,
    cursor?: string,
  ): Promise<{ comments: PlatformComment[]; nextCursor?: string }>

  replyToComment?(
    commentId: string,
    accessToken: string,
    message: string,
  ): Promise<{ id: string }>

  // ── Messaging (optional) ──
  /**
   * List conversations (DM threads) for an account.
   *
   * @param accountId Page id (FB) or IG account id (IG); the linked Page id is also used internally for IG.
   * @param accessToken Page Access Token (required even for IG — user tokens won't work).
   */
  getConversations?(
    accountId: string,
    accessToken: string,
    cursor?: string,
  ): Promise<{
    conversations: PlatformConversation[]
    nextCursor?: string
  }>

  /**
   * List messages within a single thread.
   *
   * @param accountId Page id (FB) or IG account id. Required so the adapter can flag outgoing
   *   messages by comparing against the sender id on each message.
   */
  getMessages?(
    threadId: string,
    accountId: string,
    accessToken: string,
    cursor?: string,
  ): Promise<{
    messages: PlatformMessage[]
    nextCursor?: string
  }>

  /**
   * Send a reply to a participant. The `recipientId` is the participant PSID/IGSID
   * (not the threadId) — the Send API addresses recipients, not threads.
   * Subject to Meta's 24-hour customer-service window for inbound-initiated threads.
   */
  sendMessage?(
    recipientId: string,
    accessToken: string,
    payload: SendMessagePayload,
  ): Promise<{ messageId: string }>

  /** Mark a thread as seen by the Page. */
  markRead?(
    recipientId: string,
    accessToken: string,
  ): Promise<{ success: boolean }>
}

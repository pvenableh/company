/**
 * PlatformAdapter Interface
 *
 * Shared types and interface for social media platform adapters.
 * New adapters (LinkedIn, Facebook, Threads) implement this interface.
 * Existing adapters (Instagram, TikTok) can be migrated in a follow-up.
 */

import type { SocialPlatform } from '~/types/social'

// ══════════════════════════════════════════════════════════════════════════════
// SHARED TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface OAuthTokenResult {
  accessToken: string
  refreshToken?: string
  expiresIn: number // seconds
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
}

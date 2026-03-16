// types/social.ts — API and derived types only
// Directus collection types come from generate:types

// Re-export Directus collection types used across pages and server utils
export type {
	SocialAccount,
	SocialAnalyticsSnapshot,
	SocialActivityLog,
	SocialComment,
} from './directus';
// Re-export SocialClient and SocialPost with augmented fields for frontend use
export type { SocialClient } from './directus';

export type SocialPlatform = 'instagram' | 'tiktok' | 'linkedin' | 'facebook' | 'threads';
export type PostType = 'image' | 'video' | 'carousel' | 'reel' | 'story' | 'text' | 'article';
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
export type AccountStatus = 'active' | 'expired' | 'revoked';

// Action types for the activity log
export type SocialAction =
	| 'post_created'
	| 'post_scheduled'
	| 'post_published'
	| 'post_failed'
	| 'post_deleted'
	| 'account_connected'
	| 'account_disconnected'
	| 'account_token_refreshed'
	| 'account_token_expired'
	| 'comment_replied'
	| 'comment_hidden'
	| 'comment_deleted'
	| 'analytics_synced';

// Frontend-friendly post type (maps Directus fields to what pages expect)
export interface SocialPost {
	id: string;
	caption: string;
	media_urls: string[];
	media_types: ('image' | 'video')[];
	thumbnail_url: string | null;
	platforms: SocialPostTarget[];
	post_type: PostType;
	scheduled_at: string;
	status: PostStatus;
	publish_results: PublishResult[] | null;
	published_at: string | null;
	error_message: string | null;
	created_by: string | null;
	date_created: string;
	date_updated: string | null;
}

// Dashboard stats summary
export interface SocialDashboardStats {
	total_scheduled: number;
	published_today: number;
	published_this_week: number;
	failed_count: number;
	accounts_by_platform: Record<SocialPlatform, number>;
	engagement_rate_avg: number;
	follower_growth_weekly: number;
}

// Public account (no tokens) — used in API responses
export interface SocialAccountPublic {
	id: string;
	platform: SocialPlatform;
	account_name: string;
	account_handle: string;
	profile_picture_url: string | null;
	status: AccountStatus;
	token_expires_at: string;
	is_token_expiring_soon: boolean;
	client_id: string | null;
	client_name?: string;
}

// Post target for multi-account publishing
export interface SocialPostTarget {
	platform: SocialPlatform;
	account_id: string;
	account_name: string;
	options?: TikTokPostOptions | LinkedInPostOptions;
}

export interface TikTokPostOptions {
	privacy_level: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
	disable_duet: boolean;
	disable_stitch: boolean;
	disable_comment: boolean;
	post_mode: 'DIRECT_POST' | 'MEDIA_UPLOAD';
}

export interface LinkedInPostOptions {
	visibility: 'PUBLIC' | 'CONNECTIONS';
	/** LinkedIn author URN — person or organization */
	author_urn?: string;
}

export interface PublishResult {
	platform: SocialPlatform;
	account_id: string;
	success: boolean;
	platform_post_id?: string;
	error?: string;
	published_at?: string;
}

// Platform metrics for analytics
export interface InstagramMetrics {
	followers_count: number;
	follows_count: number;
	media_count: number;
	reach?: number;
	impressions?: number;
	profile_views?: number;
	engagement_rate?: number;
}

export interface TikTokMetrics {
	follower_count: number;
	following_count: number;
	likes_count: number;
	video_count: number;
}

export interface LinkedInMetrics {
	followers_count: number;
	connections_count?: number;
	post_count: number;
	impressions?: number;
	clicks?: number;
	engagement_rate?: number;
}

export interface FacebookMetrics {
	followers_count: number;
	page_likes: number;
	post_count: number;
	reach?: number;
	impressions?: number;
	engagement_rate?: number;
}

export interface ThreadsMetrics {
	followers_count: number;
	post_count: number;
	likes?: number;
	replies?: number;
	reposts?: number;
}

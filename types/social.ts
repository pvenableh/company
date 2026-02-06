// types/social.ts — API and derived types only
// Directus collection types come from generate:types

export type SocialPlatform = 'instagram' | 'tiktok';
export type PostType = 'image' | 'video' | 'carousel' | 'reel' | 'story';
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
export type AccountStatus = 'active' | 'expired' | 'revoked';

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
	options?: TikTokPostOptions;
}

export interface TikTokPostOptions {
	privacy_level: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
	disable_duet: boolean;
	disable_stitch: boolean;
	disable_comment: boolean;
	post_mode: 'DIRECT_POST' | 'MEDIA_UPLOAD';
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

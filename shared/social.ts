// types/social.ts — API and derived types only
// Directus collection types come from generate:types

// Re-export Directus collection types used across pages and server utils
export type {
	SocialAccount,
	SocialAnalyticsSnapshot,
	SocialActivityLog,
	SocialComment,
	ContentPlan,
} from './directus';

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

export type ApprovalState =
	| 'draft'
	| 'in_review'
	| 'requested_changes'
	| 'approved'
	| 'rejected'
	| 'scheduled'
	| 'published';

// ── Content Plans ────────────────────────────────────────────────
// A strategy + batch of social_posts grouped for client review.
// Covers monthly retainer cadence (target_month) AND campaign/launch
// (project_event), so future grouping concepts plug in without a
// schema rewrite.

export type ContentPlanState = 'draft' | 'in_review' | 'approved' | 'archived';
export type ContentPlanType = 'monthly_cadence' | 'campaign' | 'launch' | 'custom';

/**
 * Frontend-friendly content plan. Mirrors the Directus row but normalizes
 * relation fields to ids when serialized over the wire, with `posts` and
 * `project_detail` optionally hydrated by callers that fetched deep.
 */
export interface ContentPlanRecord {
	id: number;
	organization: string;
	title: string | null;
	project: string | null;
	target_client: string | null;
	plan_type: ContentPlanType;
	target_month: string | null;
	project_event: string | null;
	state: ContentPlanState;
	objective: string | null;
	themes: string[] | null;
	strategy: string | null;
	cover_image_url: string | null;
	approval_token: string | null;
	approved_by: string | null;
	approved_at: string | null;
	sent_for_review_at: string | null;
	date_created: string | null;
	date_updated: string | null;
	user_created: string | null;
}

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
	cta_url?: string | null;
	cta_label?: string | null;
	// Phase 3 — Studio fields
	project?: string | null;
	target_client?: string | null;
	approval_state?: ApprovalState;
	approval_token?: string | null;
	approved_by?: string | null;
	approved_at?: string | null;
	design_image_url?: string | null;
	figma_frame_url?: string | null;
	target_month?: string | null;
	content_plan?: number | null;
	/**
	 * Per-platform caption forks for the master-variant composer.
	 * `null` (or omitted key) = inherit master `caption`. Present key with a
	 * non-empty string = forked variant published in place of master for
	 * that platform.
	 */
	caption_variants?: Partial<Record<SocialPlatform, string>> | null;
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
	organization: string;
	/** Owning client UUID (null = house/agency-owned) */
	client: string | null;
	/** Resolved client name for display (null when house-owned) */
	client_name: string | null;
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

// ── AI Content Generation ──

export type SocialContentType =
	| 'announcement'
	| 'behind-the-scenes'
	| 'promotion'
	| 'thought-leadership'
	| 'event'
	| 'case-study'
	| 'team-spotlight'
	| 'industry-news';

export type SocialTone = 'professional' | 'casual' | 'playful' | 'urgent' | 'inspirational';

export type SocialAudience = 'clients' | 'prospects' | 'industry-peers' | 'general-public' | 'team';

export type SocialCTAType = 'visit-website' | 'book-a-call' | 'learn-more' | 'shop-now';

export interface SocialAIGenerateRequest {
	platforms: SocialPlatform[];
	contentType: SocialContentType;
	topic: string;
	keyPoints?: string;
	tone: SocialTone;
	audience: SocialAudience;
	brandVoice?: string;
	ctaType?: SocialCTAType;
}

export interface SocialAIGeneratedPost {
	platform: SocialPlatform;
	content: string;
	hashtags: string[];
	cta?: string;
	imageSuggestion: {
		description: string;
		searchTerms: string[];
	};
}

export interface SocialAIGenerateResponse {
	posts: SocialAIGeneratedPost[];
}

/**
 * Marketing persistence layer — types for the recommendation-feed model.
 *
 * Three collections work together:
 *
 *   marketing_recommendations  — feed entries (cards in /marketing)
 *           │ approved → creates
 *   marketing_campaigns        — extended with feed-model columns
 *           │ has many
 *   marketing_touches          — individual emails/posts in a campaign
 *
 * The legacy "Marketing Intelligence" dashboard model (typed in
 * shared/marketing.ts) coexists: legacy rows have null card_type and
 * read from plan_data; feed rows leave plan_data null and use the
 * structured columns defined here.
 */

// ─── Card types ─────────────────────────────────────────────────────────────

export type MarketingCardType =
	| 'dormant_clients'
	| 'project_complete'
	| 'lead_reengagement'
	| 'new_client_welcome'
	| 'service_promo'
	| 'campaign_clone'
	| 'partner_anniversary'
	| 'event_teaser';

// ─── Recommendations ────────────────────────────────────────────────────────

export type MarketingRecommendationStatus =
	| 'pending' // surfaced, no user action yet
	| 'generating' // user clicked Generate, AI running
	| 'drafted' // generator output ready, awaiting review
	| 'approved' // user clicked Schedule
	| 'skipped' // user clicked Skip
	| 'expired'; // 7+ days, no action

export interface RankerOutputForCard {
	why_now: string;
	urgency: number;
	audience_overlap_with: string[];
}

export interface MarketingRecommendation {
	// All three marketing collections use integer auto-increment ids on this DB,
	// not uuid. Directus auto-creates `id` as integer when a collection is created
	// without an explicit uuid id declared first.
	id: number;
	organization: string;
	card_type: MarketingCardType;
	candidate_data: Record<string, unknown>; // serialized RecommendationCandidate
	ranker_output: RankerOutputForCard;
	ranker_run_id: string;
	ranker_prompt_version: string;
	status: MarketingRecommendationStatus;
	resulting_campaign: number | null;
	skipped_reason: string | null;
	surfaced_at: string;
	expires_at: string;
	date_created: string;
	date_updated: string;
}

// ─── Campaigns — delta over the existing collection ─────────────────────────

export type MarketingCampaignStatus =
	| 'draft'
	| 'scheduled'
	| 'partial_sent'
	| 'completed'
	| 'cancelled'
	| 'archived';

export type MarketingCampaignType = 'dashboard' | 'campaign' | 'feed_recommendation';

export interface VoiceFingerprintSnapshot {
	voice_summary: string;
	formality: { score: number; confidence: number };
	warmth: { score: number; confidence: number };
	energy: { score: number; confidence: number };
	jargon_level: 'low' | 'mid' | 'high';
	pronoun_default: 'we' | 'i' | 'mixed' | 'avoided';
	signature_phrases: string[];
	avoid_phrases: string[];
	tone_descriptors: string[];
	ingest_run_at: string;
	prompt_version: string;
}

export interface AudienceSnapshot {
	contact_ids: string[];
	cluster_label?: string;
	sample_names: string[];
	captured_at: string;
}

export interface PromptVersions {
	ranker?: string;
	generator?: string;
	voice?: string;
}

/**
 * Fields added to marketing_campaigns by extend-marketing-campaigns-fields.ts.
 * The existing fields (id, title, goal, status, type, plan_data, organization,
 * start_date, end_date, audit fields) are unchanged and remain on the row.
 */
export interface MarketingCampaignFeedFields {
	// Lineage — recommendation is the integer FK to marketing_recommendations.id
	recommendation: number | null;
	card_type: MarketingCardType | null;
	phase: string | null;

	// Brand-context provenance
	voice_fingerprint_snapshot: VoiceFingerprintSnapshot | null;
	facts_used: string[];
	prompt_versions: PromptVersions;

	// Audience captured at generation time (survives CRM drift)
	audience_snapshot: AudienceSnapshot | null;

	// Token accounting
	tokens_spent: number;
	generator_strategy: string | null;
	cadence_rationale: string | null;
}

// ─── Touches ────────────────────────────────────────────────────────────────

export type MarketingTouchKind = 'email' | 'social';

export type MarketingTouchAudienceTarget =
	| 'project_contact'
	| 'lookalike_audience'
	| 'public';

export type MarketingTouchStatus =
	| 'pending'
	| 'scheduled'
	| 'sent'
	| 'cancelled'
	| 'failed';

export type SocialChannel = 'linkedin' | 'instagram' | 'twitter';

export type EmailCTA =
	| 'book_call'
	| 'reply'
	| 'view_portfolio'
	| 'view_case_study'
	| 'reply_with_question';

/**
 * audience_filter is one of the literal values OR a `cluster:<label>` form
 * for lead_reengagement clusters. Kept as string in the schema for flexibility.
 */
export type AudienceFilterLiteral = 'all' | 'opened_previous' | 'unopened_previous';
export type AudienceFilter = AudienceFilterLiteral | `cluster:${string}`;

export type PersonalizationState = 'none' | 'requested' | 'in_progress' | 'completed';

export interface MarketingTouch {
	// integer auto-increment id, not uuid — see note on MarketingRecommendation.
	id: number;
	campaign: number;
	organization: string; // denormalized for fast org-scoped queries
	sequence_index: number;

	kind: MarketingTouchKind;
	audience_target: MarketingTouchAudienceTarget;
	audience_filter: AudienceFilter;

	send_offset_hours: number;
	scheduled_for: string | null;
	sent_at: string | null;
	status: MarketingTouchStatus;

	// Email content (null when kind=social)
	email_subject: string | null;
	email_preview_text: string | null;
	email_body_markdown: string | null;
	email_cta: EmailCTA | null;

	// Social content (null when kind=email)
	social_channel: SocialChannel | null;
	social_caption: string | null;
	social_image_brief: string | null;
	social_image_url: string | null;

	// Operational FKs — populated at schedule time
	source_social_post: string | null;
	source_email_send: string | null;

	personalization_state: PersonalizationState;

	// Engagement (denormalized from social_posts / email_sends)
	opens_count: number | null;
	clicks_count: number | null;
	replies_count: number | null;

	// Provenance
	tokens_spent: number;
	regenerate_history: Record<string, unknown> | null;
	generator_strategy_excerpt: string | null;

	date_created: string;
	date_updated: string;
}

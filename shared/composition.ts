/**
 * Composition view-model — the unified facade over outbound authoring.
 *
 * P3 of the Composition Canvas redesign (see project_composition_canvas_redesign).
 * Email and social are two *destinations* of one canvas, not two products. This
 * file defines the polymorphic shape the UI works with; `useComposition` is the
 * read/write adapter that maps it to the existing persistence tables.
 *
 * NO new Directus collection. This is a pure view-model — every Composition is
 * backed by an existing row in either `social_posts` or `marketing_touches`,
 * referenced by `source` for write-back.
 *
 * Why: P2 just shipped per-platform variants for social. Email already encodes
 * per-segment variants via `marketing_touch_variants`. Both systems converge at
 * the same three axes (master body, channel-axis forks, targets+schedule). The
 * UX just hasn't unified — until now. We layer a view-model so the canvas can
 * treat the two as siblings; the schemas keep their existing shape and the
 * write paths keep their existing validation.
 *
 * Discriminated union by `kind`. Consumers narrow once, then work with
 * channel-specific fields.
 *
 * @see app/composables/useComposition.ts — the adapter that produces these
 * @see project_composition_canvas_redesign — the design rationale
 */

import type {
	SocialPlatform,
	PostType,
	PostStatus,
	SocialPostTarget,
	PublishResult,
} from './social';
import type {
	EmailCTA,
	AudienceFilter,
	MarketingTouchStatus,
} from './marketing-persistence';

// ─── Discriminator ──────────────────────────────────────────────────────────

export type CompositionKind = 'social' | 'email';

// ─── Canonical status ───────────────────────────────────────────────────────

/**
 * Canonical status mapped from the underlying store. Social uses `PostStatus`
 * (`draft`/`scheduled`/`publishing`/`published`/`failed`); email touches use
 * `MarketingTouchStatus` (`pending`/`scheduled`/`sent`/`cancelled`/`failed`).
 *
 * We collapse both to the same five-value enum because the canvas's UX
 * affordances (river leaf glyph, scheduled-pulse animation, failed-badge) need
 * a single switch. The adapter is the single point that does the mapping.
 */
export type CompositionStatus =
	| 'draft'
	| 'scheduled'
	| 'sending'
	| 'sent'
	| 'failed';

// ─── Targets ────────────────────────────────────────────────────────────────

/**
 * Heterogeneous send targets. Social targets are platform accounts; email
 * targets are mailing lists or filtered segments. A single Composition can
 * have many targets (multi-platform social, multi-list email), and one day
 * MAY mix kinds (a "Both" composition that fans out to a touch + a post in
 * parallel). For Phase 3.0 we keep targets homogeneous per Composition; the
 * "Both" path creates two sibling Compositions under one campaign.
 */
export type CompositionTarget =
	| {
			kind: 'social_account';
			platform: SocialPlatform;
			account_id: string;
			account_name: string;
			/** Original SocialPostTarget for round-trip fidelity (preserves
			 * per-platform options like LinkedIn visibility or TikTok privacy). */
			raw?: SocialPostTarget;
	  }
	| {
			kind: 'mailing_list';
			list_id: string;
			list_name: string;
	  }
	| {
			kind: 'audience_segment';
			/** Existing `marketing_touches.audience_filter` literal. */
			filter: AudienceFilter;
	  };

// ─── Results (polymorphic) ──────────────────────────────────────────────────

/**
 * Send/publish results. Social is push (per-platform success/error at the
 * moment of publish). Email is asynchronous tracking (delivery events via
 * SendGrid webhooks: delivered/open/click/bounce). The canvas's "published
 * card" UX renders these differently — social shows the platform pill +
 * permalink; email shows a sparkline of engagement events.
 *
 * Both shapes are nullable until the Composition is actually sent.
 */
export type CompositionResults =
	| { kind: 'social'; results: PublishResult[] }
	| {
			kind: 'email';
			/** Counts denormalized from `email_events` for fast render. */
			delivered: number;
			opened: number;
			clicked: number;
			bounced: number;
			complained: number;
			/** Optional pointer to the underlying `emails.id` for deep-dive. */
			email_id?: number | null;
	  };

// ─── Source pointer (for write-back) ────────────────────────────────────────

/**
 * Every Composition references its backing row so the adapter knows where to
 * write updates. The `source` tag is the source-of-truth pointer — never
 * mutate the wrong table.
 *
 * For email, `campaign_id` is included because creating/updating a touch
 * almost always implies touching the parent campaign too (e.g. one-off
 * emails create a single-touch campaign behind the scenes; the user never
 * sees the distinction).
 */
export type CompositionSource =
	| { type: 'social_post'; post_id: string }
	| { type: 'marketing_touch'; touch_id: number; campaign_id: number };

// ─── Shared fields ──────────────────────────────────────────────────────────

interface CompositionBase {
	/** Stable id for the canvas surface. For social this is the `social_posts`
	 * uuid; for email it's `'touch:'` + the touch's integer id (string-coerced
	 * so the canvas can key on a single shape). The `source` pointer holds the
	 * untransformed primary key for write-back. */
	id: string;
	kind: CompositionKind;
	organization: string;
	/** Project FK (optional). Social can attach to a project; email campaigns
	 * are org-wide today (project=null). The canvas reads-but-doesn't-write
	 * project on email until the schema supports it. */
	project_id: string | null;
	/** Plan grouping FK. For social this is `content_plans.id`; for email it
	 * maps to `marketing_campaigns.id`. The canvas treats both as the same
	 * "what cohort does this belong to" axis. */
	plan_id: number | null;
	/** Canonical status (see CompositionStatus). */
	status: CompositionStatus;
	/** ISO timestamp — schedule fire time, or null if explicitly unscheduled. */
	scheduled_at: string | null;
	/** ISO timestamp — first publish attempt completed (any outcome). */
	published_at: string | null;
	/** Results bundle (null until sent). */
	results: CompositionResults | null;
	created_at: string;
	updated_at: string | null;
	/** Source-of-truth pointer for write-back. */
	source: CompositionSource;
}

// ─── Social ─────────────────────────────────────────────────────────────────

export interface SocialComposition extends CompositionBase {
	kind: 'social';
	/** Master caption — published verbatim for any platform without a fork. */
	body: string;
	/** Per-platform forks. Same semantics as `social_posts.caption_variants`:
	 * absent or null key → inherit master. */
	variants: Partial<Record<SocialPlatform, string>> | null;
	targets: Extract<CompositionTarget, { kind: 'social_account' }>[];
	post_type: PostType;
	media_urls: string[];
	media_types: ('image' | 'video')[];
	thumbnail_url: string | null;
	cta_url: string | null;
	cta_label: string | null;
	/** Mirrors `social_posts.status` exactly when the canonical status maps
	 * back uniquely; otherwise the adapter picks the closest. */
	raw_status: PostStatus;
	source: { type: 'social_post'; post_id: string };
}

// ─── Email ──────────────────────────────────────────────────────────────────

/**
 * Per-target email variant (P4 Item A.2, lane shape upgraded in P4.3
 * Item C for Tiptap HTML storage). The lane axis is the target — the
 * same string keys returned by `targetKeyOf` (e.g. `list:10` for mailing
 * list 10, `segment:opened_previous` for the corresponding audience
 * filter). Both `subject` and `body_html` are forkable; `subject` is
 * optional so a lane that overrides only the body inherits the master
 * subject (and vice versa).
 *
 * Storage format (P4.3): `body_html` is the canonical field — Tiptap's
 * `getHTML()` output. The legacy `body_markdown` field is kept as a
 * deprecated read-fallback for lanes written before the migration ran;
 * new writes always go through `body_html`. After the next-phase cleanup
 * the markdown lane field gets dropped (mirrors the column-level cleanup).
 *
 * Normalization rule (enforced server-side on write): a lane collapses
 * (gets dropped from the JSON object) when its body matches master AND
 * `subject` is either undefined OR matches master. Drop-empty-lanes
 * keeps the column NULL in the common case.
 */
export interface EmailBodyVariant {
	subject?: string;
	body_html: string;
	/** @deprecated since P4.3 — populated only on unmigrated lanes.
	 *  Reads prefer `body_html`; the migration script copies rendered
	 *  markdown into `body_html` and leaves this field in place for one
	 *  release as a safety net. */
	body_markdown?: string;
}

/** @deprecated since P4.1 — kept exported until the next phase to avoid
 *  breaking imports. The lane axis is no longer the audience_filter
 *  literal — it's the target's stable string id. New code should use
 *  `targetKeyOf(target)` directly. */
export type EmailVariantAxis = AudienceFilter;

export interface EmailComposition extends CompositionBase {
	kind: 'email';
	/** Master body — HTML (Tiptap's `getHTML()` output) since P4.3 Item C.
	 * Maps to `marketing_touches.email_body_html`. The adapter falls back
	 * to rendering `email_body_markdown` through `marked` for rows that
	 * haven't been touched since the migration; the send path does the
	 * same. The deprecated markdown column is kept one release for safety
	 * and then dropped in a follow-up phase. */
	body: string;
	subject: string;
	preview_text: string | null;
	cta: EmailCTA | null;
	/** Per-target body + subject forks (P4 Item A.2). Keyed by
	 *  `targetKeyOf(target)` — `list:<id>` or `segment:<filter>`. Null
	 *  when the touch has no forks (the common case). The send path
	 *  reads `variants[targetKey] ?? master` when fanning out per
	 *  recipient. */
	variants: Partial<Record<string, EmailBodyVariant>> | null;
	targets: Extract<
		CompositionTarget,
		{ kind: 'mailing_list' } | { kind: 'audience_segment' }
	>[];
	raw_status: MarketingTouchStatus;
	source: { type: 'marketing_touch'; touch_id: number; campaign_id: number };
}

/**
 * Stable string key for an email target — used as the JSON object key
 * in `EmailComposition.variants` and the lookup key in the send path.
 *
 *   mailing_list      → `list:<list_id>`
 *   audience_segment  → `segment:<filter>`  (filter may include `cluster:` prefix)
 *
 * Pure function so the server and the UI compute the same keys without
 * coordination.
 */
export function targetKeyOf(
	t: Extract<
		CompositionTarget,
		{ kind: 'mailing_list' } | { kind: 'audience_segment' }
	>,
): string {
	if (t.kind === 'mailing_list') return `list:${t.list_id}`;
	return `segment:${t.filter}`;
}

/**
 * Drop lanes from `variants` whose effective subject + body match master.
 * Mirrors `normalizeCaptionVariants` in `server/api/social/posts/index.ts`
 * — keep the column NULL in the common case (touch with no forks).
 *
 * Pure function so it can run client-side (defensive normalization
 * before save) and server-side (authoritative collapse before write).
 *
 * Storage rule (P4.3): the canonical field is `body_html`. Unmigrated
 * lanes may arrive with only `body_markdown`; the read fallback is
 * `lane.body_html ?? lane.body_markdown`. After normalization the
 * output lane always carries `body_html` — never markdown — so the
 * persisted shape is uniform.
 */
function effectiveLaneBody(lane: EmailBodyVariant): string {
	return lane.body_html ?? lane.body_markdown ?? '';
}

export function normalizeBodyVariants(
	variants: Partial<Record<string, EmailBodyVariant>> | null | undefined,
	masterSubject: string,
	masterBody: string,
): Partial<Record<string, EmailBodyVariant>> | null {
	if (!variants) return null;
	const out: Record<string, EmailBodyVariant> = {};
	for (const [key, lane] of Object.entries(variants)) {
		if (!lane || typeof lane !== 'object') continue;
		const subjectEqualsMaster =
			lane.subject === undefined || lane.subject === masterSubject;
		const laneBody = effectiveLaneBody(lane);
		const bodyEqualsMaster = laneBody === masterBody;
		if (subjectEqualsMaster && bodyEqualsMaster) continue;
		// Preserve only fields that differ from master — a subject that
		// matches master gets dropped from the lane (so the read-side
		// `lane.subject ?? master` lookup stays correct). Markdown gets
		// folded into the html field on the way out so the persisted
		// shape is single-axis.
		const collapsedLane: EmailBodyVariant = {
			body_html: laneBody,
		};
		if (lane.subject !== undefined && lane.subject !== masterSubject) {
			collapsedLane.subject = lane.subject;
		}
		out[key] = collapsedLane;
	}
	return Object.keys(out).length === 0 ? null : out;
}

// ─── Union ──────────────────────────────────────────────────────────────────

export type Composition = SocialComposition | EmailComposition;

// ─── Adapter API surface ────────────────────────────────────────────────────

/**
 * Patch shape — only the writable fields. The canvas's z=3 composer surfaces
 * collect these and hand them to `useComposition().update()`. The adapter
 * routes the patch to the right endpoint based on `source.type`.
 *
 * Discriminated by kind so the type-checker catches "email field set on
 * social composition" at the edit site, not at write time.
 */
export type CompositionPatch =
	| {
			kind: 'social';
			body?: string;
			variants?: Partial<Record<SocialPlatform, string>> | null;
			targets?: Extract<CompositionTarget, { kind: 'social_account' }>[];
			post_type?: PostType;
			media_urls?: string[];
			media_types?: ('image' | 'video')[];
			thumbnail_url?: string | null;
			cta_url?: string | null;
			cta_label?: string | null;
			scheduled_at?: string | null;
			status?: Extract<CompositionStatus, 'draft' | 'scheduled'>;
			plan_id?: number | null;
			project_id?: string | null;
	  }
	| {
			kind: 'email';
			body?: string;
			subject?: string;
			preview_text?: string | null;
			cta?: EmailCTA | null;
			variants?: Partial<Record<string, EmailBodyVariant>> | null;
			targets?: Extract<
				CompositionTarget,
				{ kind: 'mailing_list' } | { kind: 'audience_segment' }
			>[];
			scheduled_at?: string | null;
			status?: Extract<CompositionStatus, 'draft' | 'scheduled'>;
			plan_id?: number | null;
	  };

/**
 * Create shape — same constraints as patch but with required fields. The
 * adapter's `create()` accepts this and returns the resulting Composition.
 *
 * Email creates are special: if `plan_id` is omitted, the adapter creates a
 * single-touch `marketing_campaigns` row behind the scenes (one-off email
 * path). The user never sees the distinction.
 */
export type CompositionCreate =
	| {
			kind: 'social';
			organization: string;
			body: string;
			targets: Extract<CompositionTarget, { kind: 'social_account' }>[];
			post_type: PostType;
			scheduled_at: string;
			status?: Extract<CompositionStatus, 'draft' | 'scheduled'>;
			media_urls?: string[];
			media_types?: ('image' | 'video')[];
			thumbnail_url?: string | null;
			variants?: Partial<Record<SocialPlatform, string>> | null;
			cta_url?: string | null;
			cta_label?: string | null;
			plan_id?: number | null;
			project_id?: string | null;
	  }
	| {
			kind: 'email';
			organization: string;
			body: string;
			subject: string;
			targets: Extract<
				CompositionTarget,
				{ kind: 'mailing_list' } | { kind: 'audience_segment' }
			>[];
			scheduled_at: string | null;
			status?: Extract<CompositionStatus, 'draft' | 'scheduled'>;
			preview_text?: string | null;
			cta?: EmailCTA | null;
			variants?: Partial<Record<string, EmailBodyVariant>> | null;
			plan_id?: number | null;
			/** If omitted, the adapter creates a single-touch campaign behind
			 * the scenes (one-off email). */
	  };

// ─── Status mapping ─────────────────────────────────────────────────────────

/**
 * Map `PostStatus` (social_posts) → canonical CompositionStatus.
 * Pure function so it can be unit-tested + reused server-side.
 */
export function statusFromSocial(s: PostStatus): CompositionStatus {
	switch (s) {
		case 'draft':
			return 'draft';
		case 'scheduled':
			return 'scheduled';
		case 'publishing':
			return 'sending';
		case 'published':
			return 'sent';
		case 'failed':
			return 'failed';
	}
}

/**
 * Map `MarketingTouchStatus` (marketing_touches) → canonical CompositionStatus.
 */
export function statusFromTouch(s: MarketingTouchStatus): CompositionStatus {
	switch (s) {
		case 'pending':
			return 'draft';
		case 'scheduled':
			return 'scheduled';
		case 'sent':
			return 'sent';
		case 'cancelled':
			return 'draft'; // cancelled-but-not-deleted reads as "back to draft"
		case 'failed':
			return 'failed';
	}
}

/**
 * Reverse mapping for `scheduled_at` writes — canvas always writes a canonical
 * status; the adapter splits to the underlying enum based on `source.type`.
 */
export function socialStatusFor(
	c: Extract<CompositionStatus, 'draft' | 'scheduled'>,
): PostStatus {
	return c;
}

export function touchStatusFor(
	c: Extract<CompositionStatus, 'draft' | 'scheduled'>,
): MarketingTouchStatus {
	return c === 'draft' ? 'pending' : 'scheduled';
}

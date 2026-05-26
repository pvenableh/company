/**
 * useComposition — the read/write adapter for the Composition Canvas.
 *
 * P3 Phase 3.0 plumbing. Zero UX shift — this composable does not render
 * anything. It exists so the canvas surfaces in 3.1+ can treat social posts
 * and email touches as siblings of one polymorphic `Composition`.
 *
 * Design decisions (locked in 2026-05-26 conversation):
 *   1. **Pure facade, no schema sync.** Every read and write hits an existing
 *      endpoint (`/api/social/posts`, `/api/marketing/timeline`, etc.). No new
 *      Directus collection. No dual-write. If the canvas's view-model proves
 *      itself, a future Phase XII can collapse the schema. For now, the
 *      abstraction is purely client-side.
 *
 *   2. **One-off emails → single-touch campaign behind the scenes.** When the
 *      canvas creates a `kind: 'email'` Composition without a parent campaign,
 *      this composable quietly creates a `marketing_campaigns` row first, then
 *      a single `marketing_touches` row inside it. The user never sees the
 *      distinction; they think they're authoring "an email."
 *
 *   3. **Status is canonical.** The canvas reads `Composition.status`
 *      (`'draft'`/`'scheduled'`/`'sending'`/`'sent'`/`'failed'`). The adapter
 *      maps to/from the underlying enum (`PostStatus` for social,
 *      `MarketingTouchStatus` for email). The mapping is the only place those
 *      two five-value enums coexist.
 *
 *   4. **Email writes live on `/api/marketing/touches/*`.** Phase 3.3 minted
 *      the POST + PATCH/:id + DELETE/:id + GET/:id trio mirroring
 *      `/api/social/posts`. Create routes through that endpoint; the
 *      one-off-campaign helper lives server-side (POST accepts an optional
 *      `campaign` id; when omitted, the route mints a single-touch campaign
 *      first). Email creates and updates here just translate the
 *      `Composition` shape into the touch's column shape and round-trip the
 *      raw row back through `touchToComposition()`.
 *
 * @see shared/composition.ts — the view-model type contract this serves.
 * @see project_composition_canvas_redesign — the design rationale.
 */

import type {
	Composition,
	SocialComposition,
	EmailComposition,
	CompositionCreate,
	CompositionPatch,
	CompositionSource,
	CompositionTarget,
	CompositionResults,
} from '~~/shared/composition';
import {
	statusFromSocial,
	statusFromTouch,
	socialStatusFor,
	touchStatusFor,
} from '~~/shared/composition';
import type {
	SocialPost,
	SocialPostTarget,
	SocialPlatform,
	PublishResult,
} from '~~/shared/social';

// ─── Shape helpers ──────────────────────────────────────────────────────────

/** Encode a touch's int id into the canvas's string-keyed id space. The
 *  `touch:` prefix means a single `Map<id, Composition>` in the canvas can
 *  hold both kinds without collision risk against social-post UUIDs. */
function encodeTouchId(touchId: number): string {
	return `touch:${touchId}`;
}

function decodeTouchId(id: string): number | null {
	if (!id.startsWith('touch:')) return null;
	const n = Number(id.slice(6));
	return Number.isFinite(n) ? n : null;
}

// ─── Social mapping ─────────────────────────────────────────────────────────

function socialPostToComposition(post: SocialPost): SocialComposition {
	const targets: SocialComposition['targets'] = (post.platforms || []).map(
		(t: SocialPostTarget) => ({
			kind: 'social_account' as const,
			platform: t.platform,
			account_id: t.account_id,
			account_name: t.account_name,
			raw: t,
		}),
	);

	const results: CompositionResults | null = post.publish_results
		? { kind: 'social', results: post.publish_results as PublishResult[] }
		: null;

	return {
		id: post.id,
		kind: 'social',
		organization: '', // populated by caller; `social_posts` GET doesn't echo
		project_id: post.project ?? null,
		plan_id: post.content_plan ?? null,
		status: statusFromSocial(post.status),
		raw_status: post.status,
		scheduled_at: post.scheduled_at,
		published_at: post.published_at,
		results,
		created_at: post.date_created,
		updated_at: post.date_updated,
		body: post.caption,
		variants:
			(post.caption_variants as Partial<Record<SocialPlatform, string>> | null) ??
			null,
		targets,
		post_type: post.post_type,
		media_urls: post.media_urls || [],
		media_types: post.media_types || [],
		thumbnail_url: post.thumbnail_url,
		cta_url: post.cta_url ?? null,
		cta_label: post.cta_label ?? null,
		source: { type: 'social_post', post_id: post.id },
	};
}

/** Convert a SocialComposition patch back into the `/api/social/posts/:id`
 *  PATCH body shape. The endpoint owns variant normalization (effective-master
 *  collapse), so we just forward what the canvas sets. */
function socialPatchBody(
	patch: Extract<CompositionPatch, { kind: 'social' }>,
): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (patch.body !== undefined) body.caption = patch.body;
	if (patch.variants !== undefined) body.caption_variants = patch.variants;
	if (patch.targets !== undefined) {
		body.platforms = patch.targets.map((t) => ({
			platform: t.platform,
			account_id: t.account_id,
			account_name: t.account_name,
			options: t.raw?.options,
		}));
	}
	if (patch.post_type !== undefined) body.post_type = patch.post_type;
	if (patch.media_urls !== undefined) body.media_urls = patch.media_urls;
	if (patch.media_types !== undefined) body.media_types = patch.media_types;
	if (patch.thumbnail_url !== undefined) body.thumbnail_url = patch.thumbnail_url;
	if (patch.cta_url !== undefined) body.cta_url = patch.cta_url;
	if (patch.cta_label !== undefined) body.cta_label = patch.cta_label;
	if (patch.scheduled_at !== undefined) body.scheduled_at = patch.scheduled_at;
	if (patch.status !== undefined) body.status = socialStatusFor(patch.status);
	if (patch.plan_id !== undefined) body.content_plan = patch.plan_id;
	if (patch.project_id !== undefined) body.project = patch.project_id;
	return body;
}

/** Convert a SocialComposition create input to `/api/social/posts` POST body.
 *  The endpoint's Zod schema treats `thumbnail_url` as `z.string().url().optional()`
 *  — passing `null` 400s. Mirror the same omit-when-null rule for the other
 *  optional URL/string fields so callers can pass `null` freely. */
function socialCreateBody(
	input: Extract<CompositionCreate, { kind: 'social' }>,
): Record<string, unknown> {
	const body: Record<string, unknown> = {
		caption: input.body,
		caption_variants: input.variants ?? null,
		media_urls: input.media_urls ?? [],
		media_types: input.media_types ?? [],
		platforms: input.targets.map((t) => ({
			platform: t.platform,
			account_id: t.account_id,
			account_name: t.account_name,
			options: t.raw?.options,
		})),
		post_type: input.post_type,
		status: input.status ?? 'draft',
	};
	if (input.thumbnail_url) body.thumbnail_url = input.thumbnail_url;
	if (input.scheduled_at) body.scheduled_at = input.scheduled_at;
	if (input.cta_url) body.cta_url = input.cta_url;
	if (input.cta_label) body.cta_label = input.cta_label;
	if (input.plan_id != null) body.content_plan = input.plan_id;
	if (input.project_id != null) body.project = input.project_id;
	return body;
}

// ─── Email mapping (read-only in 3.0) ───────────────────────────────────────

interface TouchRow {
	id: number;
	campaign: number;
	organization: string;
	sequence_index: number;
	kind: 'email' | 'social';
	audience_filter: string;
	/** Mailing list FK. The touches/[id].get route expands this to
	 *  `{ id, name }` so the canvas can render the list name on the
	 *  lifted card without a follow-up fetch. POST/PATCH responses do
	 *  the same. Bare-number form retained as a fallback for older
	 *  callers (timeline.get is currently still bare-int by design). */
	mailing_list: { id: number; name: string } | number | null;
	scheduled_for: string | null;
	sent_at: string | null;
	status: import('~~/shared/marketing-persistence').MarketingTouchStatus;
	email_subject: string | null;
	email_preview_text: string | null;
	email_body_markdown: string | null;
	email_cta: import('~~/shared/marketing-persistence').EmailCTA | null;
	date_created: string;
	date_updated: string;
}

function touchToComposition(touch: TouchRow): EmailComposition {
	// `audience_filter` is a literal-or-`cluster:${string}` string in the DB.
	// AudienceFilter is the right view-model type for it — no contortion needed.
	const filter = touch.audience_filter as import('~~/shared/marketing-persistence').AudienceFilter;

	// Mailing-list targeting takes priority over audience_filter at the
	// view-model layer (the canvas composer enforces the mutex when
	// writing, so in practice only one is set at a time). When the
	// touches/[id].get expanded the m2o we get `{ id, name }`; a stale
	// caller that returned the bare int gets a placeholder name we'll
	// upgrade on the next fetch.
	let targets: EmailComposition['targets'];
	if (touch.mailing_list != null) {
		const list = touch.mailing_list;
		if (typeof list === 'object' && list && 'id' in list) {
			targets = [
				{
					kind: 'mailing_list',
					list_id: String(list.id),
					list_name: list.name || `List ${list.id}`,
				},
			];
		} else {
			const id = String(list);
			targets = [{ kind: 'mailing_list', list_id: id, list_name: `List ${id}` }];
		}
	} else {
		targets = [{ kind: 'audience_segment', filter }];
	}

	return {
		id: encodeTouchId(touch.id),
		kind: 'email',
		organization: touch.organization,
		project_id: null,
		plan_id: touch.campaign ?? null,
		status: statusFromTouch(touch.status),
		raw_status: touch.status,
		scheduled_at: touch.scheduled_for,
		published_at: touch.sent_at,
		// Engagement counters live in a separate query; canvas surfaces that
		// need them call /api/marketing/timeline directly. Phase 3.0 leaves
		// results null on the Composition until the canvas asks for them.
		results: null,
		created_at: touch.date_created,
		updated_at: touch.date_updated,
		body: touch.email_body_markdown ?? '',
		subject: touch.email_subject ?? '',
		preview_text: touch.email_preview_text,
		cta: touch.email_cta,
		variants: null,
		targets,
		source: { type: 'marketing_touch', touch_id: touch.id, campaign_id: touch.campaign },
	};
}

/** Convert an EmailComposition create input to a `/api/marketing/touches`
 *  POST body. Keeps the canonical-status mapping co-located with the
 *  read mapping so canvas surfaces only ever speak `CompositionStatus`. */
function touchCreateBody(
	input: Extract<CompositionCreate, { kind: 'email' }>,
): Record<string, unknown> {
	const firstTarget = input.targets[0];
	// Mutex: emit either `mailing_list` (FK) or `audience_filter` (literal),
	// never both. The send path checks mailing_list first; if a stale caller
	// somehow set both, the list wins, but the canvas never sends that shape.
	const isList = firstTarget?.kind === 'mailing_list';
	const audienceFilter =
		firstTarget?.kind === 'audience_segment' ? firstTarget.filter : 'all';
	const mailingList = isList ? Number(firstTarget.list_id) : null;
	return {
		organization: input.organization,
		// `plan_id` doubles as `campaign` in the email half of the
		// view-model. Omit when null so the server's one-off-campaign
		// helper runs.
		campaign: input.plan_id ?? null,
		kind: 'email' as const,
		audience_target: 'project_contact' as const,
		audience_filter: audienceFilter,
		mailing_list: mailingList,
		send_offset_hours: 0,
		scheduled_for: input.scheduled_at,
		status: touchStatusFor(input.status ?? 'draft'),
		email_subject: input.subject,
		email_preview_text: input.preview_text ?? null,
		email_body_markdown: input.body,
		email_cta: input.cta ?? null,
	};
}

/** Convert an EmailComposition patch into a `/api/marketing/touches/:id`
 *  PATCH body. Mirrors `socialPatchBody` — only forward keys the caller
 *  set, so partial patches stay partial. */
function touchPatchBody(
	patch: Extract<CompositionPatch, { kind: 'email' }>,
): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (patch.body !== undefined) body.email_body_markdown = patch.body;
	if (patch.subject !== undefined) body.email_subject = patch.subject;
	if (patch.preview_text !== undefined) body.email_preview_text = patch.preview_text;
	if (patch.cta !== undefined) body.email_cta = patch.cta;
	if (patch.targets !== undefined) {
		const first = patch.targets[0];
		// Mutex on write — set one side and clear the other so the row
		// doesn't carry stale state from a previous target kind.
		if (first?.kind === 'mailing_list') {
			body.mailing_list = Number(first.list_id);
			body.audience_filter = 'all';
		} else if (first?.kind === 'audience_segment') {
			body.audience_filter = first.filter;
			body.mailing_list = null;
		}
	}
	if (patch.scheduled_at !== undefined) body.scheduled_for = patch.scheduled_at;
	if (patch.status !== undefined) body.status = touchStatusFor(patch.status);
	if (patch.plan_id !== undefined) body.campaign = patch.plan_id;
	return body;
}

// ─── Composable ─────────────────────────────────────────────────────────────

/**
 * Module-level singleton — Phase 3.0 doesn't need per-instance reactive state.
 * The canvas surfaces (3.1+) will introduce a reactive registry on top of this
 * adapter; we keep the API methods pure for now so they're easy to test.
 */
export function useComposition() {
	/**
	 * Fetch a single Composition by its canvas-id. The id encodes the kind:
	 * social = UUID, email = `touch:<int>`. Returns null on 404.
	 */
	async function fetchById(id: string): Promise<Composition | null> {
		const touchId = decodeTouchId(id);
		if (touchId !== null) {
			// Email read path goes through the dedicated GET endpoint minted in
			// Phase 3.3. Direct fetch-by-id lets the canvas deep-link to any
			// touch even if it's outside the timeline's rolling 30d window.
			const res = await $fetch<{ data: TouchRow }>(
				`/api/marketing/touches/${touchId}`,
				{ credentials: 'include' },
			).catch((err: { statusCode?: number }) => {
				if (err?.statusCode === 404) return null;
				throw err;
			});
			if (!res) return null;
			return touchToComposition(res.data);
		}

		// Social — UUID hits the existing endpoint.
		const res = await $fetch<{ data: SocialPost }>(`/api/social/posts/${id}`, {
			credentials: 'include',
		}).catch((err: { statusCode?: number }) => {
			if (err?.statusCode === 404) return null;
			throw err;
		});
		if (!res) return null;
		const composition = socialPostToComposition(res.data);
		composition.organization = composition.organization || '';
		return composition;
	}

	/**
	 * Create a new Composition. The adapter routes to the right endpoint based
	 * on `input.kind`. Social goes through `/api/social/posts`; email is
	 * stubbed in 3.0 — see the file-header docstring for the Phase 3.3 plan.
	 */
	async function create(input: CompositionCreate): Promise<Composition> {
		if (input.kind === 'social') {
			const body = socialCreateBody(input);
			const res = await $fetch<{ data: SocialPost; message: string }>(
				'/api/social/posts',
				{
					method: 'POST',
					credentials: 'include',
					body,
				},
			);
			const composition = socialPostToComposition(res.data);
			composition.organization = input.organization;
			return composition;
		}

		// Email — the route's one-off-campaign helper kicks in when
		// `plan_id` is null, so the canvas doesn't have to know whether
		// the touch belongs to a real campaign or a synthetic single-touch
		// one.
		const body = touchCreateBody(input);
		const res = await $fetch<{ data: TouchRow }>(
			'/api/marketing/touches',
			{
				method: 'POST',
				credentials: 'include',
				body,
			},
		);
		return touchToComposition(res.data);
	}

	/**
	 * Update an existing Composition. Routes by `source.type`. Social patches
	 * go to `/api/social/posts/:id`; email is stubbed in 3.0 (same plan as
	 * create).
	 */
	async function update(
		source: CompositionSource,
		patch: CompositionPatch,
	): Promise<Composition> {
		if (source.type === 'social_post') {
			if (patch.kind !== 'social') {
				throw new Error(
					`Patch kind mismatch: source is social_post but patch.kind="${patch.kind}"`,
				);
			}
			const body = socialPatchBody(patch);
			const res = await $fetch<{ data: SocialPost }>(
				`/api/social/posts/${source.post_id}`,
				{
					method: 'PATCH',
					credentials: 'include',
					body,
				},
			);
			return socialPostToComposition(res.data);
		}

		// Email — PATCH /api/marketing/touches/:id (Phase 3.3 endpoint).
		// Patch.kind must match source.type, same guard as social.
		if (patch.kind !== 'email') {
			throw new Error(
				`Patch kind mismatch: source is marketing_touch but patch.kind="${patch.kind}"`,
			);
		}
		const body = touchPatchBody(patch);
		const res = await $fetch<{ data: TouchRow }>(
			`/api/marketing/touches/${source.touch_id}`,
			{
				method: 'PATCH',
				credentials: 'include',
				body,
			},
		);
		return touchToComposition(res.data);
	}

	/**
	 * Delete a Composition. Social DELETE goes through `/api/social/posts/:id`
	 * (gated to draft/scheduled/failed by the endpoint). Email is stubbed.
	 */
	async function remove(source: CompositionSource): Promise<void> {
		if (source.type === 'social_post') {
			await $fetch(`/api/social/posts/${source.post_id}`, {
				method: 'DELETE',
				credentials: 'include',
			});
			return;
		}
		await $fetch(`/api/marketing/touches/${source.touch_id}`, {
			method: 'DELETE',
			credentials: 'include',
		});
	}

	return {
		fetchById,
		create,
		update,
		remove,
		// Pure helpers exposed for canvas surfaces that need to map raw rows
		// without going through the network (e.g. river timeline already has
		// the rows in memory).
		_mapSocialPost: socialPostToComposition,
		_mapTouch: touchToComposition,
	};
}

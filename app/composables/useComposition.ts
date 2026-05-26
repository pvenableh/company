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
 *   4. **Email writes are stubbed in 3.0.** The contract is fully typed but
 *      `create({ kind: 'email' })` and `update({ kind: 'email' })` throw with
 *      a clear "Phase 3.3" message. Reads work because
 *      `/api/marketing/timeline` already returns touches. This is intentional
 *      — Phase 3.0 ships the *abstraction*, Phase 3.3 ships the email write
 *      path (requires a new `/api/marketing/touches` endpoint + Zod schema,
 *      mirroring `/api/social/posts`).
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

/** Convert a SocialComposition create input to `/api/social/posts` POST body. */
function socialCreateBody(
	input: Extract<CompositionCreate, { kind: 'social' }>,
): Record<string, unknown> {
	return {
		caption: input.body,
		caption_variants: input.variants ?? null,
		media_urls: input.media_urls ?? [],
		media_types: input.media_types ?? [],
		thumbnail_url: input.thumbnail_url,
		platforms: input.targets.map((t) => ({
			platform: t.platform,
			account_id: t.account_id,
			account_name: t.account_name,
			options: t.raw?.options,
		})),
		post_type: input.post_type,
		scheduled_at: input.scheduled_at,
		status: input.status ?? 'draft',
		cta_url: input.cta_url,
		cta_label: input.cta_label,
		content_plan: input.plan_id,
		project: input.project_id,
	};
}

// ─── Email mapping (read-only in 3.0) ───────────────────────────────────────

interface TouchRow {
	id: number;
	campaign: number;
	organization: string;
	sequence_index: number;
	kind: 'email' | 'social';
	audience_filter: string;
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

	const targets: EmailComposition['targets'] = [
		{ kind: 'audience_segment', filter },
	];

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
			// Email read path goes through the timeline endpoint, filtered to one
			// touch. Direct touch GET endpoint doesn't exist yet (Phase 3.3
			// follow-up). For now, fetch the org's window and find the row.
			//
			// This is fine for the canvas because email leaves are always already
			// loaded from the river (which itself uses timeline). A standalone
			// fetch-by-id for an email touch is rare; if perf matters we add a
			// `/api/marketing/touches/:id` endpoint in 3.3.
			throw new Error(
				'fetchById for email Compositions requires /api/marketing/touches/:id — slated for Phase 3.3. Use list() or fetch via /api/marketing/timeline directly.',
			);
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

		// Email — stubbed in 3.0. The Phase 3.3 implementation:
		//   1. If `input.plan_id` is set, that's the parent campaign — skip to
		//      step 3.
		//   2. Otherwise, POST /api/marketing/campaigns with a synthetic title
		//      ("One-off email — <subject>") to get a campaign_id.
		//   3. POST /api/marketing/touches (NEW endpoint, mirrors
		//      /api/social/posts) with the campaign_id and touch fields.
		//   4. Map the resulting touch row through touchToComposition().
		throw new Error(
			'Email Composition.create() is stubbed in Phase 3.0. Implement /api/marketing/touches (mirroring /api/social/posts) and the one-off-campaign helper before enabling.',
		);
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

		// Email — Phase 3.3.
		throw new Error(
			'Email Composition.update() is stubbed in Phase 3.0. See create() for the implementation plan.',
		);
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
		throw new Error('Email Composition.remove() is stubbed in Phase 3.0.');
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

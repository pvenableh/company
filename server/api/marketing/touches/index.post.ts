/**
 * Create a marketing_touch.
 *
 * Mirrors POST /api/social/posts for the email side of the Composition
 * Canvas (P3 Phase 3.3 — composition-canvas-redesign).
 *
 * Body shape (Zod-validated — MUST stay symmetric with the PATCH schema
 * in `[id].patch.ts` so PATCH doesn't silently drop fields the create
 * accepts. The P2 social variants ship hit that exact trap; see
 * feedback_zod_silent_drop.).
 *
 * Auth: requireOrgMembership. Routes via the server token after the
 * membership check passes — same trust boundary as the existing
 * /api/marketing/* writers (marketing_touches has no row-level perms).
 *
 * One-off campaign helper: callers send a touch without a `campaign` id
 * for a one-off email. We create a single-touch `marketing_campaigns`
 * row first (title derived from the subject), then the touch inside it.
 * The user never sees the synthetic campaign — it just satisfies the
 * FK so engagement counters and timeline reads keep working.
 */
import { z } from 'zod';
import { createItem, createItems, readItem, readItems } from '@directus/sdk';
import type { MarketingTouchStatus } from '~~/shared/marketing-persistence';
import { normalizeBodyVariants } from '~~/shared/composition';

/**
 * Audience targeting on a marketing_touch is one of:
 *   - `mailing_list` (FK) — send path resolves via mailing_list_contacts join
 *   - `audience_filter` (literal | cluster:<>) — send path narrows from
 *     campaign.audience_snapshot
 *
 * Both are accepted at the schema level (no XOR refine) because the canvas
 * composer enforces mutex client-side and the send path picks
 * mailing_list-first. Allowing both lets a future "hybrid" axis (e.g.
 * "opened previously, from list X") slot in without a schema change.
 */

// ─── Schema (SYMMETRIC with PATCH) ──────────────────────────────────────

const audienceTargetSchema = z.enum(['project_contact', 'lookalike_audience', 'public']);

/** `AudienceFilter` is one of the literal values OR a `cluster:<label>`
 *  form. The DB stores it as a string for flexibility — we validate at the
 *  edge but pass through unchanged. */
const audienceFilterSchema = z
	.string()
	.min(1)
	.max(120)
	.refine(
		(v) =>
			v === 'all'
			|| v === 'opened_previous'
			|| v === 'unopened_previous'
			|| v.startsWith('cluster:'),
		{ message: 'audience_filter must be all | opened_previous | unopened_previous | cluster:<label>' },
	);

const emailCtaSchema = z.enum([
	'book_call',
	'reply',
	'view_portfolio',
	'view_case_study',
	'reply_with_question',
]);

const socialChannelSchema = z.enum(['linkedin', 'instagram', 'twitter']);

const TOUCH_STATUSES: readonly MarketingTouchStatus[] = [
	'pending',
	'scheduled',
	'sent',
	'cancelled',
	'failed',
] as const;

/** Create-only status: callers can land in `pending` (draft) or
 *  `scheduled`. Other states are server-driven (worker flips
 *  pending→scheduled→sent/failed; admin actions flip to cancelled). */
const createStatusSchema = z.enum(['pending', 'scheduled']).default('pending');

/** A single recipient bucket on a touch. P4 Item A.1 introduces multi-target
 *  sends — one touch can fan out to a mix of mailing lists and audience
 *  segments, deduped at send time. Each entry maps 1:1 to a row in the new
 *  `marketing_touch_targets` junction.
 *
 *  Mutex per row: `mailing_list` set + `audience_filter` empty when
 *  kind=mailing_list; inverse when kind=audience_segment. Refine catches
 *  any client that flips the wrong field. */
const targetEntrySchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('mailing_list'),
		list_id: z.number().int().positive(),
	}),
	z.object({
		kind: z.literal('audience_segment'),
		filter: audienceFilterSchema,
	}),
]);

const createTouchSchema = z.object({
	organization: z.string().uuid(),

	// Parent campaign — optional. When omitted, the route find-or-creates a
	// single-touch campaign for the one-off email.
	campaign: z.number().int().positive().nullable().optional(),

	// Touch positioning.
	kind: z.enum(['email', 'social']).default('email'),
	sequence_index: z.number().int().min(0).default(0),
	audience_target: audienceTargetSchema.default('project_contact'),
	audience_filter: audienceFilterSchema.default('all'),
	// XOR with audience_filter at the app layer. When set, the send path
	// resolves recipients via mailing_list_contacts instead of
	// campaign.audience_snapshot. See the comment at the top of this file.
	//
	// Back-compat with pre-junction P4.2 callers — the new shape is
	// `targets[]` below. When `targets[]` is provided, the server mirrors
	// the FIRST target back into mailing_list/audience_filter so the
	// pre-junction send path keeps working for any caller still on the
	// single-target shape, AND so timeline/list reads that haven't
	// expanded targets.* surface the right pill copy.
	mailing_list: z.number().int().positive().nullable().optional(),
	send_offset_hours: z.number().int().min(0).max(24 * 30).default(0),

	/** Multi-target recipients. Order preserved — the first entry mirrors
	 *  to the back-compat `mailing_list`/`audience_filter` columns. When
	 *  omitted, falls back to the legacy single-target shape (mailing_list
	 *  OR audience_filter). */
	targets: z.array(targetEntrySchema).max(20).optional(),

	/** P4 Item A.2 — per-target body + subject variants. Keyed by
	 *  `targetKeyOf(target)` (`list:<id>` or `segment:<filter>`). The
	 *  server normalizer drops lanes matching master before write so the
	 *  column stays NULL in the common case. */
	body_variants: z.record(z.string(), z.object({
		subject: z.string().max(998).optional(),
		body_markdown: z.string().max(50_000),
	})).nullable().optional(),

	// Schedule + status.
	scheduled_for: z.string().datetime().nullable().optional(),
	status: createStatusSchema,

	// Email content (the canvas's email composer fills these). Optional in
	// the schema so we can also create kind='social' touches via this same
	// endpoint later if the cross-channel composer ever lands — the v1
	// canvas only emits email touches but the schema doesn't need to be
	// narrower than the table.
	email_subject: z.string().max(998).nullable().optional(),
	email_preview_text: z.string().max(300).nullable().optional(),
	email_body_markdown: z.string().max(50_000).nullable().optional(),
	email_cta: emailCtaSchema.nullable().optional(),

	// Social content (NOT used by the v1 email composer but kept for
	// schema parity with the table — Zod silently drops keys we don't
	// declare, so we declare them).
	social_channel: socialChannelSchema.nullable().optional(),
	social_caption: z.string().max(4_000).nullable().optional(),
	social_image_brief: z.string().max(2_000).nullable().optional(),
	social_image_url: z.string().url().nullable().optional(),
}).refine(
	(data) => {
		if (data.status === 'scheduled') {
			return !!data.scheduled_for;
		}
		return true;
	},
	{ message: 'Scheduled touches require scheduled_for' },
);

// ─── Handler ────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const parsed = createTouchSchema.safeParse(body);

	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			message: 'Validation failed',
			data: parsed.error.flatten(),
		});
	}

	const data = parsed.data;
	await requireOrgMembership(event, data.organization);

	const directus = getTypedDirectus();

	// Resolve campaign — explicit FK wins; otherwise mint a single-touch
	// campaign behind the scenes so the one-off email path has the same
	// parent the worker + timeline expect.
	let campaignId = data.campaign ?? null;
	if (campaignId == null) {
		const title = data.email_subject
			? `One-off email — ${data.email_subject.slice(0, 80)}`
			: 'One-off email';
		try {
			const created = await directus.request(
				createItem('marketing_campaigns', {
					title,
					goal: null,
					status: 'draft',
					type: 'campaign',
					organization: data.organization,
					start_date: null,
					end_date: null,
				}),
			) as any;
			campaignId = Number(created.id);
		} catch (err: any) {
			console.error('[marketing/touches] one-off campaign create failed:', err.message);
			throw createError({ statusCode: 500, message: 'Failed to create parent campaign' });
		}
	} else {
		// Verify the campaign lives in the caller's org. Otherwise a member
		// of org A could attach a touch under org B's campaign by guessing
		// the integer id.
		const campaign = await directus
			.request(
				readItem('marketing_campaigns', campaignId, { fields: ['id', 'organization'] }),
			)
			.catch(() => null) as any;
		if (!campaign || campaign.organization !== data.organization) {
			throw createError({ statusCode: 400, message: 'Invalid campaign for this organization' });
		}
	}

	// Verify mailing_list (when provided) lives in the caller's org. Same
	// trust-boundary concern as the campaign check above — without this an
	// org-A member could target an org-B list by guessing the integer id.
	if (data.mailing_list != null) {
		const list = await directus
			.request(
				readItem('mailing_lists', data.mailing_list, { fields: ['id', 'organization'] }),
			)
			.catch(() => null) as any;
		if (!list || list.organization !== data.organization) {
			throw createError({ statusCode: 400, message: 'Invalid mailing list for this organization' });
		}
	}

	// Resolve effective targets. New shape `targets[]` wins when provided.
	// Otherwise fall back to the legacy single-target columns so pre-P4.1
	// callers still produce a valid junction row.
	const targetsInput = (data.targets && data.targets.length > 0)
		? data.targets
		: data.mailing_list != null
			? [{ kind: 'mailing_list' as const, list_id: data.mailing_list }]
			: [{ kind: 'audience_segment' as const, filter: data.audience_filter }];

	// Cross-org validate every list_id in the targets array. One readItem
	// per unique list; small N (max 20), so a serial loop is fine.
	const listIdsToCheck = Array.from(new Set(
		targetsInput
			.filter((t): t is Extract<typeof t, { kind: 'mailing_list' }> => t.kind === 'mailing_list')
			.map((t) => t.list_id),
	));
	for (const listId of listIdsToCheck) {
		const list = await directus
			.request(readItem('mailing_lists', listId, { fields: ['id', 'organization'] }))
			.catch(() => null) as any;
		if (!list || list.organization !== data.organization) {
			throw createError({
				statusCode: 400,
				message: `Invalid mailing list ${listId} for this organization`,
			});
		}
	}

	// Mirror the FIRST target into the back-compat columns. Pre-junction
	// readers (timeline.get, send-path fallback) read those directly; this
	// keeps the single-target send path live until everything moves to
	// reading the junction.
	const firstTarget = targetsInput[0]!;
	const mirrorMailingList = firstTarget.kind === 'mailing_list' ? firstTarget.list_id : null;
	const mirrorAudienceFilter = firstTarget.kind === 'audience_segment'
		? firstTarget.filter
		: 'all';

	try {
		// Same `mailing_list` expansion as the PATCH route — the canvas's
		// touchToComposition mapper expects the expanded m2o so it can
		// surface the list name on the lifted card immediately.
		// P4 Item A.2 — normalize body_variants against master before write
		// so the column stays NULL in the common case (touch with no forks).
		// The shared helper handles the drop-lane-if-equal-to-master rule.
		const normalizedVariants = normalizeBodyVariants(
			data.body_variants ?? null,
			data.email_subject ?? '',
			data.email_body_markdown ?? '',
		);

		const created = await directus.request(
			createItem('marketing_touches', {
				campaign: campaignId,
				organization: data.organization,
				sequence_index: data.sequence_index,
				kind: data.kind,
				audience_target: data.audience_target,
				audience_filter: mirrorAudienceFilter,
				mailing_list: mirrorMailingList,
				send_offset_hours: data.send_offset_hours,
				scheduled_for: data.scheduled_for ?? null,
				status: data.status,
				email_subject: data.email_subject ?? null,
				email_preview_text: data.email_preview_text ?? null,
				email_body_markdown: data.email_body_markdown ?? null,
				email_cta: data.email_cta ?? null,
				body_variants: normalizedVariants,
				social_channel: data.social_channel ?? null,
				social_caption: data.social_caption ?? null,
				social_image_brief: data.social_image_brief ?? null,
				social_image_url: data.social_image_url ?? null,
				personalization_state: 'none',
				tokens_spent: 0,
				regenerate_history: null,
				generator_strategy_excerpt: null,
			}, {
				fields: ['*', 'mailing_list.id', 'mailing_list.name'],
			}),
		) as any;

		// Persist the full targets array to the junction. Sort preserves
		// the order the caller sent (used as the chip-row display order in
		// the composer). On failure here we leave the touch + back-compat
		// columns in place — the send-path's fallback path still works for
		// the first target, so a junction-write failure degrades but
		// doesn't break.
		try {
			const junctionRows = targetsInput.map((t, idx) => ({
				touch: Number(created.id),
				organization: data.organization,
				target_kind: t.kind,
				mailing_list: t.kind === 'mailing_list' ? t.list_id : null,
				audience_filter: t.kind === 'audience_segment' ? t.filter : null,
				sort: idx,
			}));
			await directus.request(createItems('marketing_touch_targets', junctionRows));
		} catch (err: any) {
			console.warn(
				'[marketing/touches] junction write failed (back-compat columns still set):',
				err.message,
			);
		}

		// Re-fetch the touch with targets.* expanded so the response shape
		// matches what `useComposition.touchToComposition` expects.
		try {
			const withTargets = await directus.request(
				readItem('marketing_touches', Number(created.id), {
					fields: [
						'*',
						'mailing_list.id',
						'mailing_list.name',
						'targets.id',
						'targets.target_kind',
						'targets.mailing_list.id',
						'targets.mailing_list.name',
						'targets.audience_filter',
						'targets.sort',
					],
				}),
			);
			return { data: withTargets };
		} catch {
			// If the targets-expansion fetch fails for any reason, fall
			// back to the original create response. Junction rows still
			// exist; the canvas mapper degrades to the legacy fields.
			return { data: created };
		}
	} catch (err: any) {
		console.error('[marketing/touches] create failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to create touch' });
	}
});


/**
 * Update a marketing_touch.
 *
 * P3 Phase 3.3 (composition-canvas-redesign). Mirrors PATCH
 * /api/social/posts/:id for the email side of the Composition Canvas.
 *
 * The Zod schema MUST mirror the POST create schema in `index.post.ts` —
 * Zod silently drops keys that aren't declared, so any field present in
 * the create body that's absent here will be no-op'd on update. See
 * `feedback_zod_silent_drop` (the P2 social variants bug was exactly
 * this trap).
 *
 * Auth: requireOrgMembership against the touch's `organization` (loaded
 * before the membership check so we have the org id to compare against).
 *
 * Mutability gate: only `pending` / `scheduled` touches accept patches.
 * Sent / failed / cancelled touches are immutable history — same model
 * as social posts (`getSocialPostById` → ['draft','scheduled']).
 */
import { z } from 'zod';
import { createItems, deleteItems, readItem, readItems, updateItem } from '@directus/sdk';
import { normalizeBodyVariants } from '~~/shared/composition';

// ─── Schema (SYMMETRIC with POST) ───────────────────────────────────────

const audienceTargetSchema = z.enum(['project_contact', 'lookalike_audience', 'public']);

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

/** Per-row target shape — MUST stay symmetric with index.post.ts. P4 Item
 *  A.1 multi-target. */
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

const updateTouchSchema = z.object({
	// Reparenting is allowed (move a touch between campaigns) but never
	// re-orging: the caller has membership in exactly the touch's current
	// org and we don't accept `organization` here.
	campaign: z.number().int().positive().nullable().optional(),

	kind: z.enum(['email', 'social']).optional(),
	sequence_index: z.number().int().min(0).optional(),
	audience_target: audienceTargetSchema.optional(),
	audience_filter: audienceFilterSchema.optional(),
	// XOR with audience_filter at the app layer (see index.post.ts header).
	// Nullable so the canvas can clear a list when the user swaps back to
	// audience_segment.
	mailing_list: z.number().int().positive().nullable().optional(),
	send_offset_hours: z.number().int().min(0).max(24 * 30).optional(),

	/** Multi-target recipients (P4 Item A.1). When present, replaces the
	 *  full set of junction rows (delete-then-recreate — diff is overkill
	 *  for v1). Order preserved; first entry mirrors to the back-compat
	 *  mailing_list/audience_filter columns. Omit to leave junction rows
	 *  alone. Pass [] to clear all junction rows (and also clear the
	 *  back-compat columns to a default 'all' segment). */
	targets: z.array(targetEntrySchema).max(20).optional(),

	/** P4 Item A.2 — per-target body + subject variants. Same shape as
	 *  the POST schema; pass null to clear the JSON column. Server
	 *  normalizes against master before write (drops lanes matching
	 *  master). */
	body_variants: z.record(z.string(), z.object({
		subject: z.string().max(998).optional(),
		body_markdown: z.string().max(50_000),
	})).nullable().optional(),

	scheduled_for: z.string().datetime().nullable().optional(),
	status: z.enum(['pending', 'scheduled', 'cancelled']).optional(),

	email_subject: z.string().max(998).nullable().optional(),
	email_preview_text: z.string().max(300).nullable().optional(),
	email_body_markdown: z.string().max(50_000).nullable().optional(),
	email_cta: emailCtaSchema.nullable().optional(),

	social_channel: socialChannelSchema.nullable().optional(),
	social_caption: z.string().max(4_000).nullable().optional(),
	social_image_brief: z.string().max(2_000).nullable().optional(),
	social_image_url: z.string().url().nullable().optional(),
});

// ─── Handler ────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const touchId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(touchId)) {
		throw createError({ statusCode: 400, message: 'Touch ID must be numeric' });
	}

	const directus = getTypedDirectus();
	const existing = await directus
		.request(
			readItem('marketing_touches', touchId, {
				fields: [
					'id',
					'organization',
					'status',
					'campaign',
					'scheduled_for',
					// P4 Item A.2: need the current master subject + body so the
					// body_variants normalizer can collapse lanes that match
					// the effective master (patch values OR existing values).
					'email_subject',
					'email_body_markdown',
				],
			}),
		)
		.catch(() => null) as any;

	if (!existing) {
		throw createError({ statusCode: 404, message: 'Touch not found' });
	}

	await requireOrgMembership(event, existing.organization);

	if (!['pending', 'scheduled'].includes(existing.status)) {
		throw createError({
			statusCode: 400,
			message: `Cannot edit touch with status: ${existing.status}`,
		});
	}

	const body = await readBody(event);
	const parsed = updateTouchSchema.safeParse(body);

	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			message: 'Validation failed',
			data: parsed.error.flatten(),
		});
	}

	// Pull `targets` out — it's not a column on marketing_touches, it's
	// handled as a separate junction-table write below. Leaving it in
	// `patch` would cause Directus to 400 on an unknown field.
	const { targets: incomingTargets, ...patchableData } = parsed.data;
	const patch: Record<string, unknown> = { ...patchableData };

	// P4 Item A.2 — normalize body_variants against the effective master
	// (patch values win; otherwise the existing row). Drop-lane-if-equal-
	// to-master keeps the column NULL in the common case. The composer
	// always sends the full state on save, so partial patches that touch
	// only the master subject/body without resending variants will leave
	// stale lanes in place — acceptable since the send-time read still
	// uses `lane.body_markdown ?? master` correctly.
	if ('body_variants' in patchableData) {
		const effectiveSubject =
			(patch.email_subject as string | undefined)
			?? (existing.email_subject ?? '');
		const effectiveBody =
			(patch.email_body_markdown as string | undefined)
			?? (existing.email_body_markdown ?? '');
		patch.body_variants = normalizeBodyVariants(
			patchableData.body_variants ?? null,
			effectiveSubject,
			effectiveBody,
		);
	}

	// If the caller flips status=scheduled they need a scheduled_for —
	// either in this same patch or already on the row. Mirrors the social
	// post `.refine()` on POST.
	if (parsed.data.status === 'scheduled') {
		const willHaveSchedule = parsed.data.scheduled_for !== undefined
			? !!parsed.data.scheduled_for
			: !!existing.scheduled_for;
		if (!willHaveSchedule) {
			throw createError({
				statusCode: 400,
				message: 'Scheduled touches require scheduled_for',
			});
		}
	}

	// Reparenting: verify the new campaign lives in the same org as the
	// touch (and exists). Otherwise an org-A member could move their
	// touch under org-B's campaign by guessing the integer id.
	if (parsed.data.campaign !== undefined && parsed.data.campaign !== null) {
		const target = await directus
			.request(
				readItem('marketing_campaigns', parsed.data.campaign, {
					fields: ['id', 'organization'],
				}),
			)
			.catch(() => null) as any;
		if (!target || target.organization !== existing.organization) {
			throw createError({ statusCode: 400, message: 'Invalid campaign for this organization' });
		}
	}

	// Same trust-boundary check for mailing_list. Setting to null is
	// always allowed (clears the FK).
	if (parsed.data.mailing_list != null) {
		const list = await directus
			.request(
				readItem('mailing_lists', parsed.data.mailing_list, {
					fields: ['id', 'organization'],
				}),
			)
			.catch(() => null) as any;
		if (!list || list.organization !== existing.organization) {
			throw createError({ statusCode: 400, message: 'Invalid mailing list for this organization' });
		}
	}

	// P4 Item A.1: cross-org validate every list_id in incomingTargets.
	// Same trust-boundary concern as the legacy single-FK check above —
	// without this an org-A member could target an org-B list by guessing
	// the integer id.
	if (incomingTargets !== undefined) {
		const listIdsToCheck = Array.from(new Set(
			incomingTargets
				.filter((t): t is Extract<typeof t, { kind: 'mailing_list' }> => t.kind === 'mailing_list')
				.map((t) => t.list_id),
		));
		for (const listId of listIdsToCheck) {
			const list = await directus
				.request(readItem('mailing_lists', listId, { fields: ['id', 'organization'] }))
				.catch(() => null) as any;
			if (!list || list.organization !== existing.organization) {
				throw createError({
					statusCode: 400,
					message: `Invalid mailing list ${listId} for this organization`,
				});
			}
		}

		// Mirror the FIRST target into the back-compat columns. Pre-junction
		// readers (timeline.get, send-path fallback) read those directly.
		// Empty targets[] clears the back-compat columns to a safe default
		// (audience_filter='all', mailing_list=null).
		const firstTarget = incomingTargets[0];
		if (firstTarget?.kind === 'mailing_list') {
			patch.mailing_list = firstTarget.list_id;
			patch.audience_filter = 'all';
		} else if (firstTarget?.kind === 'audience_segment') {
			patch.audience_filter = firstTarget.filter;
			patch.mailing_list = null;
		} else {
			patch.mailing_list = null;
			patch.audience_filter = 'all';
		}
	}

	try {
		// Expand `mailing_list` on the response so the canvas's
		// touchToComposition mapper can read the list name without a
		// follow-up fetch. Other fields keep Directus's default shape.
		const updated = await directus.request(
			updateItem('marketing_touches', touchId, patch, {
				fields: ['*', 'mailing_list.id', 'mailing_list.name'],
			}),
		) as any;

		// Replace junction rows when targets[] is explicitly provided.
		// Delete-then-recreate is simpler than diff for v1; the row count
		// per touch is bounded (max 20 by schema) so the write volume is
		// trivial. Skip entirely when targets is undefined (= "don't
		// touch junction") to keep partial patches partial.
		if (incomingTargets !== undefined) {
			try {
				// Delete existing rows for this touch.
				const existingRows = (await directus.request(
					readItems('marketing_touch_targets', {
						filter: { touch: { _eq: touchId } },
						fields: ['id'],
						limit: 50,
					}),
				)) as Array<{ id: number }>;
				if (existingRows.length > 0) {
					await directus.request(
						deleteItems('marketing_touch_targets', existingRows.map((r) => r.id)),
					);
				}
				// Recreate from the new shape (no-op when targets is []).
				if (incomingTargets.length > 0) {
					const newRows = incomingTargets.map((t, idx) => ({
						touch: touchId,
						organization: existing.organization,
						target_kind: t.kind,
						mailing_list: t.kind === 'mailing_list' ? t.list_id : null,
						audience_filter: t.kind === 'audience_segment' ? t.filter : null,
						sort: idx,
					}));
					await directus.request(createItems('marketing_touch_targets', newRows));
				}
			} catch (err: any) {
				console.warn(
					'[marketing/touches] junction replace failed (back-compat columns still updated):',
					err.message,
				);
			}
		}

		// Re-fetch with targets.* expanded so the response shape matches
		// what `useComposition.touchToComposition` expects.
		try {
			const withTargets = await directus.request(
				readItem('marketing_touches', touchId, {
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
			return { data: updated };
		}
	} catch (err: any) {
		console.error('[marketing/touches] update failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to update touch' });
	}
});

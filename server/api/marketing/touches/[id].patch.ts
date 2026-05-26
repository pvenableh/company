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
import { readItem, updateItem } from '@directus/sdk';

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
				fields: ['id', 'organization', 'status', 'campaign', 'scheduled_for'],
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

	const patch: Record<string, unknown> = { ...parsed.data };

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

	try {
		// Expand `mailing_list` on the response so the canvas's
		// touchToComposition mapper can read the list name without a
		// follow-up fetch. Other fields keep Directus's default shape.
		const updated = await directus.request(
			updateItem('marketing_touches', touchId, patch, {
				fields: ['*', 'mailing_list.id', 'mailing_list.name'],
			}),
		) as any;
		return { data: updated };
	} catch (err: any) {
		console.error('[marketing/touches] update failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to update touch' });
	}
});

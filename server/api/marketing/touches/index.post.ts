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
import { createItem, readItem } from '@directus/sdk';
import type { MarketingTouchStatus } from '~~/shared/marketing-persistence';

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
	send_offset_hours: z.number().int().min(0).max(24 * 30).default(0),

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

	try {
		const created = await directus.request(
			createItem('marketing_touches', {
				campaign: campaignId,
				organization: data.organization,
				sequence_index: data.sequence_index,
				kind: data.kind,
				audience_target: data.audience_target,
				audience_filter: data.audience_filter,
				send_offset_hours: data.send_offset_hours,
				scheduled_for: data.scheduled_for ?? null,
				status: data.status,
				email_subject: data.email_subject ?? null,
				email_preview_text: data.email_preview_text ?? null,
				email_body_markdown: data.email_body_markdown ?? null,
				email_cta: data.email_cta ?? null,
				social_channel: data.social_channel ?? null,
				social_caption: data.social_caption ?? null,
				social_image_brief: data.social_image_brief ?? null,
				social_image_url: data.social_image_url ?? null,
				personalization_state: 'none',
				tokens_spent: 0,
				regenerate_history: null,
				generator_strategy_excerpt: null,
			}),
		) as any;
		return { data: created };
	} catch (err: any) {
		console.error('[marketing/touches] create failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to create touch' });
	}
});


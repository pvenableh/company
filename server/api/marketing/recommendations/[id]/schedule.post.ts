/**
 * Promote a drafted campaign to scheduled.
 *
 * POST /api/marketing/recommendations/[id]/schedule
 *
 * Body (optional — when present, applies last-second drawer edits before
 * promoting):
 *   {
 *     touches?: DraftedTouch[]   // each must have an id; subject/body edits applied
 *   }
 *
 * Behavior:
 *   1. Load recommendation; require membership.
 *   2. Verify rec.status='drafted' and rec.resulting_campaign is in 'draft'.
 *      (Generate creates the draft up front — schedule promotes it.)
 *   3. Compute campaign_start = next Tuesday 10:00 UTC (>24h out).
 *   4. For each touch in the campaign: PATCH last-second edits if any,
 *      compute scheduled_for = start + send_offset_hours, flip to 'scheduled'.
 *   5. PATCH campaign: status='scheduled', set start_date / end_date.
 *   6. PATCH recommendation: status='approved'.
 *
 * No fresh writes — every row already exists from generate. This makes
 * scheduling a deterministic transition rather than a multi-row create.
 */
import { readItem, readItems, updateItem } from '@directus/sdk';
import type { DraftedTouch } from '~/composables/useMarketingDrafts';

interface SchedulePayload {
	touches?: DraftedTouch[];
}

function nextTuesday10UTC(): Date {
	const now = new Date();
	const d = new Date(now);
	d.setUTCHours(10, 0, 0, 0);
	const dayDiff = (2 - d.getUTCDay() + 7) % 7;
	d.setUTCDate(d.getUTCDate() + dayDiff);
	if (d.getTime() <= now.getTime()) {
		d.setUTCDate(d.getUTCDate() + 7);
	}
	return d;
}

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const recommendationId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(recommendationId)) {
		throw createError({ statusCode: 400, message: 'Recommendation ID must be numeric' });
	}

	const body = (await readBody<SchedulePayload>(event).catch(() => ({}))) as SchedulePayload;
	const editsByTouchId = new Map<number, DraftedTouch>();
	for (const t of body?.touches || []) {
		if (typeof t.id === 'number') editsByTouchId.set(t.id, t);
	}

	const directus = getTypedDirectus();

	const rec = await directus
		.request(
			readItem('marketing_recommendations', recommendationId, {
				fields: ['id', 'organization', 'status', 'resulting_campaign'],
			}),
		)
		.catch(() => null) as any;

	if (!rec) {
		throw createError({ statusCode: 404, message: 'Recommendation not found' });
	}
	if (rec.status === 'approved') {
		throw createError({ statusCode: 409, message: 'Recommendation already scheduled.' });
	}
	if (!['pending', 'drafted'].includes(rec.status)) {
		throw createError({ statusCode: 409, message: `Recommendation is ${rec.status}; cannot schedule.` });
	}
	if (!rec.resulting_campaign) {
		throw createError({
			statusCode: 409,
			message: 'No draft to schedule — run Generate first.',
		});
	}

	const organizationId: string = rec.organization;
	await requireOrgMembership(event, organizationId);

	const campaign = await directus
		.request(
			readItem('marketing_campaigns', rec.resulting_campaign, {
				fields: ['id', 'status'],
			}),
		)
		.catch(() => null) as any;

	if (!campaign) {
		throw createError({ statusCode: 404, message: 'Draft campaign not found' });
	}
	if (campaign.status !== 'draft') {
		throw createError({ statusCode: 409, message: `Campaign is ${campaign.status}; cannot schedule.` });
	}

	const touches = await directus.request(
		readItems('marketing_touches', {
			filter: { campaign: { _eq: campaign.id } },
			sort: ['sequence_index'],
			limit: -1,
			fields: ['id', 'sequence_index', 'send_offset_hours', 'kind'],
		}),
	) as any[];

	if (touches.length === 0) {
		throw createError({ statusCode: 409, message: 'Draft has no touches to schedule.' });
	}

	const campaignStart = nextTuesday10UTC();
	const startIso = campaignStart.toISOString();

	let maxOffset = 0;
	for (const t of touches) {
		const offset = typeof t.send_offset_hours === 'number' ? t.send_offset_hours : 0;
		if (offset > maxOffset) maxOffset = offset;
	}
	const endDate = new Date(campaignStart.getTime() + maxOffset * 60 * 60 * 1000);

	const scheduled: { id: number; scheduled_for: string; kind: string }[] = [];
	for (const t of touches) {
		const edit = editsByTouchId.get(t.id);
		const offset = typeof edit?.send_offset_hours === 'number'
			? edit.send_offset_hours
			: t.send_offset_hours;
		const scheduledFor = new Date(campaignStart.getTime() + offset * 60 * 60 * 1000).toISOString();

		const patch: Record<string, unknown> = {
			status: 'scheduled',
			scheduled_for: scheduledFor,
		};
		if (edit) {
			if (typeof edit.send_offset_hours === 'number') patch.send_offset_hours = edit.send_offset_hours;
			if (edit.audience_filter !== undefined) patch.audience_filter = edit.audience_filter;
			if (edit.email_subject !== undefined) patch.email_subject = edit.email_subject;
			if (edit.email_preview_text !== undefined) patch.email_preview_text = edit.email_preview_text;
			if (edit.email_body_markdown !== undefined) patch.email_body_markdown = edit.email_body_markdown;
			if (edit.email_cta !== undefined) patch.email_cta = edit.email_cta;
			if (edit.social_caption !== undefined) patch.social_caption = edit.social_caption;
			if (edit.social_image_brief !== undefined) patch.social_image_brief = edit.social_image_brief;
		}

		try {
			await directus.request(updateItem('marketing_touches', t.id, patch));
			scheduled.push({ id: t.id, scheduled_for: scheduledFor, kind: t.kind });
		} catch (err: any) {
			console.error('[marketing/schedule] touch patch failed:', t.id, err.message);
			throw createError({
				statusCode: 500,
				message: `Failed to schedule touch ${t.id}`,
			});
		}
	}

	try {
		await directus.request(
			updateItem('marketing_campaigns', campaign.id, {
				status: 'scheduled',
				start_date: startIso.slice(0, 10),
				end_date: endDate.toISOString().slice(0, 10),
			}),
		);
	} catch (err: any) {
		console.error('[marketing/schedule] campaign promote failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to promote campaign to scheduled' });
	}

	try {
		await directus.request(
			updateItem('marketing_recommendations', recommendationId, { status: 'approved' }),
		);
	} catch (err: any) {
		console.warn('[marketing/schedule] rec approve failed:', err.message);
	}

	return {
		campaign: { id: campaign.id, start_date: startIso },
		touches: scheduled,
		recommendation_id: recommendationId,
	};
});

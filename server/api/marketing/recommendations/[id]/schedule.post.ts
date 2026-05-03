/**
 * Schedule a marketing recommendation — flips status to 'approved', creates
 * a campaign row + touches in one best-effort transaction.
 *
 * POST /api/marketing/recommendations/[id]/schedule
 *
 * Body shape (mirrors DraftedCampaign from the client composable; will also
 * be the live generator's response shape):
 *   {
 *     touches: DraftedTouch[],
 *     phase_strategy?: string | null,
 *     cadence_rationale?: string,
 *     facts_used?: { id: string; label: string; kind: string }[],
 *     tokens_spent?: number,
 *     voice_fingerprint_snapshot?: VoiceFingerprintSnapshot | null,
 *     prompt_versions?: { ranker?: string; generator?: string; voice?: string },
 *   }
 *
 * Behavior:
 *   1. Verify the recommendation exists and is in pending|drafted status.
 *   2. requireOrgMembership against the recommendation's organization.
 *   3. Compute campaign_start = next Tuesday 10:00 UTC (>24h out).
 *   4. Insert marketing_campaigns row (status: scheduled).
 *   5. Insert marketing_touches rows with scheduled_for = start + send_offset_hours.
 *   6. Patch recommendation -> status: approved, resulting_campaign.
 *   7. If touch inserts fail mid-flight, best-effort cleanup of the campaign.
 *
 * Reads/writes via server token because none of the marketing_* collections
 * have row-level perms granted to org roles. The trust boundary is the
 * requireOrgMembership check at the top of the handler.
 */
import { readItem, createItem, updateItem, deleteItem } from '@directus/sdk';
import type { DraftedTouch } from '~/composables/useMarketingDrafts';
import type { VoiceFingerprintSnapshot } from '~~/shared/marketing-persistence';

interface SchedulePayload {
	touches: DraftedTouch[];
	phase_strategy?: string | null;
	cadence_rationale?: string;
	facts_used?: { id: string; label?: string; kind?: string }[];
	tokens_spent?: number;
	voice_fingerprint_snapshot?: VoiceFingerprintSnapshot | null;
	prompt_versions?: { ranker?: string; generator?: string; voice?: string };
}

function nextTuesday10UTC(): Date {
	const now = new Date();
	const d = new Date(now);
	d.setUTCHours(10, 0, 0, 0);
	const dayDiff = (2 - d.getUTCDay() + 7) % 7; // 2 = Tuesday
	d.setUTCDate(d.getUTCDate() + dayDiff);
	// If we're already on Tuesday past 10:00 UTC, jump to next Tuesday.
	if (d.getTime() <= now.getTime()) {
		d.setUTCDate(d.getUTCDate() + 7);
	}
	return d;
}

function deriveTitleFromCardType(cardType: string, candidate: any): string {
	const data = candidate || {};
	const audienceSize = data?.audience?.size ?? 0;
	switch (cardType) {
		case 'dormant_clients':
			return `Reach out to ${audienceSize} dormant ${audienceSize === 1 ? 'client' : 'clients'}`;
		case 'project_complete': {
			const phase = data?.phase as string | undefined;
			const contact = data?.signal?.primary_contact_name as string | undefined;
			const project = data?.signal?.project_title as string | undefined;
			if (phase === 'request_testimonial' && contact) return `Ask ${contact} for a testimonial`;
			if (project) return `Turn ${project} into a campaign`;
			return 'Surface a recent win';
		}
		case 'lead_reengagement': {
			const topic = data?.cluster?.label as string | undefined;
			const count = data?.cluster?.size ?? audienceSize;
			if (topic) return `Re-engage ${count} ${topic.toLowerCase()} leads`;
			return `Re-engage ${count} quiet leads`;
		}
		default:
			return 'Marketing action';
	}
}

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const recommendationId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(recommendationId)) {
		throw createError({ statusCode: 400, message: 'Recommendation ID must be numeric' });
	}

	const body = await readBody<SchedulePayload>(event);
	if (!body || !Array.isArray(body.touches) || body.touches.length === 0) {
		throw createError({ statusCode: 400, message: 'touches is required and must be non-empty' });
	}

	const directus = getTypedDirectus();

	// 1. Load the recommendation.
	const rec = await directus
		.request(
			readItem('marketing_recommendations', recommendationId, {
				fields: ['id', 'organization', 'card_type', 'status', 'candidate_data', 'ranker_output', 'ranker_run_id', 'ranker_prompt_version'],
			}),
		)
		.catch(() => null) as any;

	if (!rec) {
		throw createError({ statusCode: 404, message: 'Recommendation not found' });
	}
	if (!['pending', 'drafted', 'generating'].includes(rec.status)) {
		throw createError({
			statusCode: 409,
			message: `Recommendation is already ${rec.status}; cannot schedule.`,
		});
	}

	// 2. Auth — verify caller is a member of the recommendation's org.
	const organizationId: string = rec.organization;
	await requireOrgMembership(event, organizationId);

	// 3. Compute campaign-start anchor.
	const campaignStart = nextTuesday10UTC();
	const startIso = campaignStart.toISOString();

	// Audience snapshot is captured from the recommendation's candidate at
	// generation time so subsequent CRM drift doesn't change history.
	const audienceData = rec.candidate_data?.audience || {};
	const clusterLabel = rec.candidate_data?.cluster?.label;
	const audienceSnapshot = {
		contact_ids: Array.isArray(audienceData.contact_ids) ? audienceData.contact_ids : [],
		cluster_label: clusterLabel,
		sample_names: Array.isArray(audienceData.sample_names) ? audienceData.sample_names : [],
		captured_at: new Date().toISOString(),
	};

	// Compute end_date from the latest touch offset.
	const maxOffset = body.touches.reduce(
		(max, t) => (typeof t.send_offset_hours === 'number' ? Math.max(max, t.send_offset_hours) : max),
		0,
	);
	const endDate = new Date(campaignStart.getTime() + maxOffset * 60 * 60 * 1000);

	// 4. Create the campaign row.
	const title = deriveTitleFromCardType(rec.card_type, rec.candidate_data);
	const goal = rec.ranker_output?.why_now || null;

	let createdCampaign: any;
	try {
		createdCampaign = await directus.request(
			createItem('marketing_campaigns', {
				title,
				goal,
				status: 'scheduled',
				type: 'feed_recommendation',
				organization: organizationId,
				recommendation: recommendationId,
				card_type: rec.card_type,
				phase: rec.candidate_data?.phase || null,
				voice_fingerprint_snapshot: body.voice_fingerprint_snapshot || null,
				facts_used: (body.facts_used || []).map((f) => f.id),
				prompt_versions: body.prompt_versions || { ranker: rec.ranker_prompt_version || null },
				audience_snapshot: audienceSnapshot,
				tokens_spent: body.tokens_spent ?? 0,
				generator_strategy: body.phase_strategy || null,
				cadence_rationale: body.cadence_rationale || null,
				start_date: startIso.slice(0, 10),
				end_date: endDate.toISOString().slice(0, 10),
			}),
		);
	} catch (err: any) {
		console.error('[marketing/schedule] campaign create failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to create campaign' });
	}

	const campaignId = createdCampaign.id;

	// 5. Insert touches sequentially. On any failure, clean up the campaign.
	const createdTouches: any[] = [];
	try {
		for (let i = 0; i < body.touches.length; i++) {
			const t = body.touches[i];
			const offset = typeof t.send_offset_hours === 'number' ? t.send_offset_hours : 0;
			const scheduledFor = new Date(campaignStart.getTime() + offset * 60 * 60 * 1000);

			const created = await directus.request(
				createItem('marketing_touches', {
					campaign: campaignId,
					organization: organizationId,
					sequence_index: i,
					kind: t.kind,
					audience_target: t.audience_target,
					audience_filter: t.audience_filter || 'all',
					send_offset_hours: offset,
					scheduled_for: scheduledFor.toISOString(),
					status: 'scheduled',
					email_subject: t.email_subject,
					email_preview_text: t.email_preview_text,
					email_body_markdown: t.email_body_markdown,
					email_cta: t.email_cta,
					social_channel: t.social_channel,
					social_caption: t.social_caption,
					social_image_brief: t.social_image_brief,
					social_image_url: null,
					personalization_state: 'none',
					tokens_spent: 0,
					generator_strategy_excerpt: body.phase_strategy || null,
				}),
			);
			createdTouches.push(created);
		}
	} catch (err: any) {
		console.error('[marketing/schedule] touch create failed, rolling back campaign:', err.message);
		// Best-effort cleanup. Don't await — fire and forget so we still return the error.
		await directus.request(deleteItem('marketing_campaigns', campaignId)).catch((rollbackErr: any) => {
			console.error('[marketing/schedule] rollback also failed:', rollbackErr.message);
		});
		throw createError({ statusCode: 500, message: 'Failed to schedule all touches' });
	}

	// 6. Mark the recommendation approved.
	try {
		await directus.request(
			updateItem('marketing_recommendations', recommendationId, {
				status: 'approved',
				resulting_campaign: campaignId,
			}),
		);
	} catch (err: any) {
		// Not fatal — campaign + touches exist; the recommendation just won't
		// be flagged. Log and continue so the user gets a usable response.
		console.warn('[marketing/schedule] recommendation status update failed:', err.message);
	}

	return {
		campaign: { id: campaignId, title, start_date: startIso },
		touches: createdTouches.map((t) => ({ id: t.id, scheduled_for: t.scheduled_for, kind: t.kind })),
		recommendation_id: recommendationId,
	};
});

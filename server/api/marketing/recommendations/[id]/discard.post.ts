/**
 * Discard the in-progress draft on a recommendation.
 *
 * POST /api/marketing/recommendations/[id]/discard
 *
 * Deletes the draft marketing_campaigns row + all child marketing_touches
 * (CASCADE), then resets the rec to status='pending' so the next Generate
 * runs a fresh AI call. Refuses if the campaign has already been promoted
 * (status != 'draft') — at that point the work is committed and Discard
 * isn't the right tool.
 */
import { readItem, updateItem, deleteItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const recommendationId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(recommendationId)) {
		throw createError({ statusCode: 400, message: 'Recommendation ID must be numeric' });
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
	await requireOrgMembership(event, rec.organization);

	if (!rec.resulting_campaign) {
		// Nothing persisted — just bounce the rec back to pending defensively.
		if (rec.status === 'drafted') {
			await directus.request(
				updateItem('marketing_recommendations', recommendationId, { status: 'pending' }),
			).catch(() => {});
		}
		return { discarded: false, reason: 'no_draft' };
	}

	const campaign = await directus
		.request(
			readItem('marketing_campaigns', rec.resulting_campaign, { fields: ['id', 'status'] }),
		)
		.catch(() => null) as any;

	if (campaign && campaign.status !== 'draft') {
		throw createError({
			statusCode: 409,
			message: `Campaign is ${campaign.status}; can only discard drafts.`,
		});
	}

	if (campaign) {
		try {
			// CASCADE on the marketing_touches.campaign FK takes the touches with it.
			await directus.request(deleteItem('marketing_campaigns', campaign.id));
		} catch (err: any) {
			console.error('[marketing/discard] delete campaign failed:', err.message);
			throw createError({ statusCode: 500, message: 'Failed to delete draft campaign' });
		}
	}

	try {
		await directus.request(
			updateItem('marketing_recommendations', recommendationId, {
				status: 'pending',
				resulting_campaign: null,
			}),
		);
	} catch (err: any) {
		console.warn('[marketing/discard] rec reset failed:', err.message);
	}

	return { discarded: true, campaign_id: campaign?.id ?? null };
});

/**
 * Skip a marketing recommendation — flips status to 'skipped'.
 *
 * POST /api/marketing/recommendations/[id]/skip
 *
 * Body (optional):
 *   { reason?: string }   // user note explaining the skip
 *
 * The card disappears from the active feed (filtered to pending|drafted)
 * but the row is preserved for skip-rate analytics and ranker eval signal.
 *
 * Routes through the server token after requireOrgMembership — same trust
 * boundary as the rest of the marketing routes.
 */
import { readItem, updateItem } from '@directus/sdk';

interface SkipPayload {
	reason?: string;
}

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const recommendationId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(recommendationId)) {
		throw createError({ statusCode: 400, message: 'Recommendation ID must be numeric' });
	}

	const body = (await readBody<SkipPayload>(event).catch(() => ({}))) || {};

	const directus = getTypedDirectus();

	const rec = await directus
		.request(
			readItem('marketing_recommendations', recommendationId, {
				fields: ['id', 'organization', 'status'],
			}),
		)
		.catch(() => null) as any;

	if (!rec) {
		throw createError({ statusCode: 404, message: 'Recommendation not found' });
	}
	if (!['pending', 'drafted', 'generating'].includes(rec.status)) {
		throw createError({
			statusCode: 409,
			message: `Recommendation is already ${rec.status}; cannot skip.`,
		});
	}

	await requireOrgMembership(event, rec.organization);

	try {
		await directus.request(
			updateItem('marketing_recommendations', recommendationId, {
				status: 'skipped',
				skipped_reason: body.reason ?? null,
			}),
		);
	} catch (err: any) {
		console.error('[marketing/skip] update failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to skip recommendation' });
	}

	return { id: recommendationId, status: 'skipped' };
});

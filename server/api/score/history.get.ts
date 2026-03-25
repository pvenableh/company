// server/api/score/history.get.ts
// Returns Earnest Score history for the org (for sparkline/chart display).

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const query = getQuery(event);
	const orgId = query.orgId as string;
	const days = Math.min(Number(query.days) || 30, 90); // max 90 days

	if (!orgId) {
		throw createError({ statusCode: 400, message: 'orgId is required' });
	}

	try {
		const directus = await getUserDirectus(event);
		const sinceDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

		const history = await directus.request(
			readItems('earnest_history', {
				filter: {
					organization: { _eq: orgId },
					date: { _gte: sinceDate },
				},
				fields: ['date', 'score', 'ep_earned', 'streak', 'dimensions'],
				sort: ['date'],
				limit: 90,
			})
		);

		return { data: history };
	} catch (error: any) {
		console.error('[score/history] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to fetch score history',
		});
	}
});

// server/api/score/me.get.ts
// Returns the current user's org Earnest Score record.

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const query = getQuery(event);
	const orgId = query.orgId as string;
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'orgId is required' });
	}

	try {
		const directus = await getUserDirectus(event);

		const scores = await directus.request(
			readItems('earnest_scores', {
				filter: { organization: { _eq: orgId } },
				fields: [
					'id', 'total_ep', 'level', 'current_score', 'streak', 'best_streak',
					'last_activity_date', 'dimension_scores', 'badges_unlocked',
					'days_active_this_week', 'total_tasks_completed', 'projects_fully_completed',
				],
				limit: 1,
			})
		) as any[];

		if (scores.length === 0) {
			// No score yet — return defaults
			return {
				data: {
					total_ep: 0,
					level: 1,
					current_score: 0,
					streak: 0,
					best_streak: 0,
					last_activity_date: null,
					dimension_scores: {},
					badges_unlocked: {},
					days_active_this_week: 0,
				},
			};
		}

		return { data: scores[0] };
	} catch (error: any) {
		console.error('[score/me] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to fetch score',
		});
	}
});

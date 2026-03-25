// server/api/score/checkin.post.ts
// Daily login check-in — awards 'daily_login' EP.
// Called once per day when the user loads the app.
// The client guards with a localStorage flag to avoid duplicate calls.

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody(event);
	const orgId = body?.orgId as string;
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'orgId is required' });
	}

	try {
		// Award daily login EP (awardEP handles deduplication via last_activity_date)
		await awardEP(orgId, 'daily_login', userId);

		// Return updated score
		const directus = await getUserDirectus(event);
		const scores = await directus.request(
			readItems('earnest_scores', {
				filter: { organization: { _eq: orgId } },
				fields: ['total_ep', 'level', 'current_score', 'streak', 'best_streak', 'days_active_this_week'],
				limit: 1,
			})
		) as any[];

		return {
			success: true,
			data: scores[0] ?? null,
		};
	} catch (error: any) {
		console.error('[score/checkin] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to check in',
		});
	}
});

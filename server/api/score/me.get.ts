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

	// The header score badge is non-critical — a Directus permission denial or a
	// stale-token race on org switch must degrade to zeros, never 500 the request.
	const EMPTY = {
		total_ep: 0,
		today_ep: 0,
		level: 1,
		current_score: 0,
		streak: 0,
		best_streak: 0,
		last_activity_date: null,
		dimension_scores: {},
		badges_unlocked: {},
		days_active_this_week: 0,
	};

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

		// Today's EP — summed from earnest_history rows dated today so the header
		// counter can lead with "earned today" and show the running total below.
		const today = new Date().toISOString().split('T')[0];
		let todayEp = 0;
		try {
			const todays = await directus.request(
				readItems('earnest_history', {
					filter: { organization: { _eq: orgId }, date: { _eq: today } },
					fields: ['ep_earned'],
					limit: -1,
				})
			) as any[];
			todayEp = todays.reduce((sum, r) => sum + (Number(r?.ep_earned) || 0), 0);
		} catch {
			/* history is best-effort — fall back to 0 today */
		}

		if (scores.length === 0) {
			// No score yet — return defaults
			return { data: EMPTY };
		}

		return { data: { ...scores[0], today_ep: todayEp } };
	} catch (error: any) {
		// Log for diagnosis but degrade gracefully — the badge shows zeros rather
		// than surfacing a 500 (a Directus 403/401 has no top-level statusCode, so
		// it would otherwise mask as 500 and spam the console on every org switch).
		console.warn('[score/me] falling back to empty score:', error?.errors?.[0]?.message || error?.message || error);
		return { data: EMPTY };
	}
});

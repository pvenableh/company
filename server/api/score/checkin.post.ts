// server/api/score/checkin.post.ts
// Daily login check-in — awards 'daily_login' EP, per user, once per day.
// Called on app load by plugins/daily-checkin.client.ts (which also guards with
// a localStorage flag). This route is the authoritative per-day guard: it only
// awards if the acting user's own score row hasn't already been active today.
//
// Uses awardUserEP (per-user attribution) rather than the org-level awardEP so
// the EP lands on the acting user's earnest_scores row.

import { readItems } from '@directus/sdk';
import { awardUserEP } from '~~/server/utils/earnestScoreUser';

const SCORE_FIELDS = [
	'total_ep', 'level', 'current_score', 'streak', 'best_streak',
	'last_activity_date', 'days_active_this_week',
];

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
		const directus = await getUserDirectus(event);
		const today = new Date().toISOString().split('T')[0];

		const rows = (await directus.request(
			readItems('earnest_scores', {
				filter: { user_created: { _eq: userId }, organization: { _eq: orgId } },
				fields: ['id', ...SCORE_FIELDS],
				limit: 1,
			})
		)) as any[];
		const existing = rows[0] ?? null;

		// Once-per-day: skip if this user's row was already active today. This
		// is the server-side backstop to the client's localStorage guard.
		let awarded = false;
		if (existing?.last_activity_date !== today) {
			await awardUserEP(directus, orgId, userId, 'daily_login');
			awarded = true;
		}

		const fresh = (await directus.request(
			readItems('earnest_scores', {
				filter: { user_created: { _eq: userId }, organization: { _eq: orgId } },
				fields: SCORE_FIELDS,
				limit: 1,
			})
		)) as any[];

		return { success: true, awarded, data: fresh[0] ?? existing ?? null };
	} catch (error: any) {
		console.error('[score/checkin] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to check in',
		});
	}
});

// server/api/score/award.post.ts
// Per-user, event-driven EP award — the authoritative source for arcade
// rewards. The client fires this the instant a user completes real work
// (closes a ticket, finishes a task, wins a deal, gets paid) and uses the
// response to drive the reward pop + badge/level-up celebration.

import { EP_AWARDS } from '~~/server/utils/earnestScore';
import { awardUserEP } from '~~/server/utils/earnestScoreUser';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody(event);
	const orgId = body?.orgId as string;
	const eventType = body?.event as string;

	if (!orgId) throw createError({ statusCode: 400, message: 'orgId is required' });
	if (!eventType || !(eventType in EP_AWARDS)) {
		throw createError({ statusCode: 400, message: `Unknown or missing event: ${eventType}` });
	}

	try {
		// Run as the acting user so earnest_scores.user_created attributes the
		// EP to them (the collection's only per-user key).
		const directus = await getUserDirectus(event);
		const result = await awardUserEP(directus, orgId, userId, eventType as any);
		return { success: true, data: result };
	} catch (error: any) {
		console.error('[score/award] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to award EP',
		});
	}
});

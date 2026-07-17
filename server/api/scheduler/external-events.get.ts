// server/api/scheduler/external-events.get.ts
//
// Overlay feed: real events from the signed-in host's connected calendars that
// are flagged `show_on_calendar`. Powers the colour-coded external-calendar
// overlay on the Scheduler Hub. Read-only, session-scoped, fail-open.
export default defineEventHandler(async (event) => {
	const session = await getUserSession(event);
	if (!session?.user?.id) {
		throw createError({ statusCode: 401, message: 'Unauthorized - Please sign in' });
	}

	const query = getQuery(event);
	const now = Date.now();
	// Default window: 45 days back → 90 days forward (covers the Hub's month view
	// plus scrolling). Callers may narrow via ?start / ?end ISO strings.
	const start = query.start ? new Date(query.start as string) : new Date(now - 45 * 24 * 60 * 60 * 1000);
	const end = query.end ? new Date(query.end as string) : new Date(now + 90 * 24 * 60 * 60 * 1000);

	if (isNaN(start.getTime()) || isNaN(end.getTime())) {
		throw createError({ statusCode: 400, message: 'Invalid start/end range' });
	}

	try {
		const events = await getOverlayEventsForUser(session.user.id, start, end);
		return { success: true, data: events };
	} catch (e: any) {
		// Fail-open: an overlay that errors should never break the Hub.
		console.warn('[external-events] overlay fetch failed (fail-open):', e?.message);
		return { success: true, data: [] };
	}
});

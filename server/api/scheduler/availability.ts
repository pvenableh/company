// server/api/scheduler/availability.ts
// Get and set the CURRENT USER's weekly availability.
//
// Both GET and POST are scoped to the signed-in user (`user_id`). This is
// critical for POST: it deletes the user's existing availability rows before
// re-creating them, so an unscoped delete would wipe EVERY user's availability
// (the pre-fix behaviour). Never remove the user_id filter.

import { readItems, createItem, deleteItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const method = getMethod(event);

	// Session is required — availability is always per-user.
	const session = await getUserSession(event);
	if (!session?.user?.id) {
		throw createError({ statusCode: 401, message: 'Unauthorized - Please sign in' });
	}
	const userId = session.user.id as string;

	// User-scoped Directus client (writes attribute to the real user).
	const directus = await getUserDirectus(event);

	if (method === 'GET') {
		try {
			const availability = await directus.request(
				readItems('availability', {
					fields: ['*', 'user_id.id', 'user_id.first_name', 'user_id.last_name'],
					filter: {
						user_id: { _eq: userId },
						status: { _neq: 'archived' },
					},
					sort: ['day_of_week'],
				}),
			);

			return {
				success: true,
				data: availability,
			};
		} catch (error: any) {
			console.error('Error fetching availability:', error);
			throw createError({
				statusCode: error.statusCode || 500,
				message: error.message || 'Failed to fetch availability',
			});
		}
	}

	if (method === 'POST') {
		try {
			const body = await readBody(event);

			// Delete this user's existing availability only. The user_id filter
			// is load-bearing — without it this wipes all users' rows.
			try {
				await directus.request(
					deleteItems('availability', {
						filter: {
							user_id: { _eq: userId },
						},
					}),
				);
			} catch (e) {
				// Ignore if no items to delete
			}

			// Create new availability entries
			const dayMapping: Record<string, string> = {
				monday: 'Monday',
				tuesday: 'Tuesday',
				wednesday: 'Wednesday',
				thursday: 'Thursday',
				friday: 'Friday',
				saturday: 'Saturday',
				sunday: 'Sunday',
			};

			const entries = [];
			for (const [day, data] of Object.entries(body)) {
				const { enabled, start, end } = data as { enabled: boolean; start: string; end: string };
				if (enabled) {
					entries.push({
						user_id: userId,
						day_of_week: dayMapping[day] || day,
						start_time: start + ':00',
						end_time: end + ':00',
						recurring: true,
						status: 'published',
					});
				}
			}

			// Create all entries
			for (const entry of entries) {
				await directus.request(createItem('availability', entry));
			}

			return {
				success: true,
				message: 'Availability saved',
				count: entries.length,
			};
		} catch (error: any) {
			console.error('Error saving availability:', error);
			throw createError({
				statusCode: error.statusCode || 500,
				message: error.message || 'Failed to save availability',
			});
		}
	}

	throw createError({
		statusCode: 405,
		message: 'Method not allowed',
	});
});

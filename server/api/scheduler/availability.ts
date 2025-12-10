// server/api/scheduler/availability.ts
// Get and set user availability

import { createDirectus, rest, staticToken, readItems, createItem, deleteItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const method = getMethod(event);

	const directusUrl = config.public.directusUrl;
	const directusToken = config.directusServerToken as string;

	if (!directusUrl || !directusToken) {
		throw createError({
			statusCode: 500,
			message: 'Directus not configured',
		});
	}

	const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

	if (method === 'GET') {
		// Fetch availability
		try {
			const availability = await directus.request(
				readItems('availability', {
					fields: ['*', 'user_id.id', 'user_id.first_name', 'user_id.last_name'],
					filter: {
						status: { _eq: 'published' },
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
		// Save availability
		try {
			const body = await readBody(event);

			// Delete existing availability for user
			// TODO: Filter by user_id when auth is available
			try {
				await directus.request(
					deleteItems('availability', {
						filter: {
							status: { _eq: 'published' },
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

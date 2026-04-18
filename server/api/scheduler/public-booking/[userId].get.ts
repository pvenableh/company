// server/api/scheduler/public-booking/[userId].get.ts
import { createDirectus, rest, readItems, readUser } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const userId = getRouterParam(event, 'userId');
	
	if (!userId) {
		throw createError({ statusCode: 400, message: 'User ID required' });
	}

	const client = createDirectus(config.public.directusUrl).with(rest());
	const staticToken = config.directusServerToken;
	if (staticToken) client.setToken(staticToken);

	try {
		// Fetch user info
		let user;
		try {
			user = await client.request(
				readUser(userId, { fields: ['id', 'first_name', 'last_name', 'avatar', 'email'] })
			);
		} catch (e) {
			// Try finding by booking slug
			const settings = await client.request(
				readItems('scheduler_settings', {
					fields: ['user_id'],
					filter: { booking_page_slug: { _eq: userId } },
					limit: 1,
				})
			);
			
			if (settings.length > 0) {
				user = await client.request(
					readUser(settings[0].user_id, { fields: ['id', 'first_name', 'last_name', 'avatar', 'email'] })
				);
			} else {
				throw createError({ statusCode: 404, message: 'User not found' });
			}
		}

		// Fetch settings
		const settings = await client.request(
			readItems('scheduler_settings', {
				fields: ['*'],
				filter: { user_id: { _eq: user.id } },
				limit: 1,
			})
		);

		const userSettings = settings[0] || {
			public_booking_enabled: true,
			default_duration: 30,
			booking_page_title: 'Schedule a meeting',
		};

		if (!userSettings.public_booking_enabled) {
			throw createError({ statusCode: 403, message: 'Booking is disabled for this user' });
		}

		// Fetch availability
		const availability = await client.request(
			readItems('availability', {
				fields: ['*'],
				filter: { user_id: { _eq: user.id } },
			})
		);

		// Fetch existing meetings for the next 30 days
		const now = new Date();
		const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

		const existingMeetings = await client.request(
			readItems('video_meetings', {
				fields: ['scheduled_start', 'scheduled_end', 'duration_minutes'],
				filter: {
					_and: [
						{ host_user: { _eq: user.id } },
						{ status: { _in: ['scheduled', 'in_progress'] } },
						{ scheduled_start: { _gte: now.toISOString() } },
						{ scheduled_start: { _lte: thirtyDaysLater.toISOString() } },
					],
				},
			})
		);

		const existingAppointments = await client.request(
			readItems('appointments', {
				fields: ['start_time', 'end_time'],
				filter: {
					_and: [
						{ user_created: { _eq: user.id } },
						{ status: { _neq: 'canceled' } },
						{ start_time: { _gte: now.toISOString() } },
						{ start_time: { _lte: thirtyDaysLater.toISOString() } },
					],
				},
			})
		);

		return {
			user: { id: user.id, first_name: user.first_name, last_name: user.last_name, avatar: user.avatar },
			settings: userSettings,
			availability,
			meetings: [
				...existingMeetings,
				...existingAppointments.map((a: any) => ({ scheduled_start: a.start_time, scheduled_end: a.end_time })),
			],
		};
	} catch (error: any) {
		console.error('Error fetching booking data:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to fetch booking data',
		});
	}
});

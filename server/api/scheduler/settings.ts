// server/api/scheduler/settings.get.ts
import { createDirectus, rest, readItems, staticToken } from '@directus/sdk';
import { getServerSession } from '#auth';

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();

		// Get session to identify current user
		const session = await getServerSession(event);

		if (!session?.user?.id) {
			throw createError({
				statusCode: 401,
				message: 'Unauthorized - Please sign in',
			});
		}

		const userId = session.user.id;

		// Create Directus client with server token
		const directus = createDirectus(config.public.directusUrl)
			.with(rest())
			.with(staticToken(config.directusStaticToken || config.directusServerToken));

		// Fetch scheduler settings for the current user
		const settings = await directus.request(
			readItems('scheduler_settings', {
				filter: {
					user_id: { _eq: userId },
				},
				limit: 1,
			}),
		);

		// If no settings exist, return defaults
		if (!settings || settings.length === 0) {
			return {
				success: true,
				data: {
					user_id: userId,
					default_duration: 30,
					default_meeting_type: 'general',
					buffer_before: 0,
					buffer_after: 0,
					send_confirmations: true,
					send_reminders: true,
					reminder_time: 60,
					public_booking_enabled: false,
					google_calendar_enabled: false,
					outlook_calendar_enabled: false,
					timezone: 'America/New_York',
				},
			};
		}

		return {
			success: true,
			data: settings[0],
		};
	} catch (error) {
		const err = error as any;
		console.error('Error fetching scheduler settings:', err);

		throw createError({
			statusCode: err.statusCode || 500,
			message: err.message || 'Failed to fetch scheduler settings',
		});
	}
});

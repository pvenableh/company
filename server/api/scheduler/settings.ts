// server/api/scheduler/settings.ts
import { createDirectus, rest, readItems, createItem, updateItem, authentication } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const method = event.method;
	
	const client = createDirectus(config.public.directusUrl)
		.with(authentication())
		.with(rest());

	try {
		const session = await getUserSession(event);
		const accessToken = session?.user?.access_token || session?.secure?.access_token;
		const userId = session?.user?.id;

		if (!userId) {
			throw createError({ statusCode: 401, message: 'Unauthorized' });
		}

		if (accessToken) {
			await client.setToken(accessToken);
		}

		if (method === 'GET') {
			const settings = await client.request(
				readItems('scheduler_settings', {
					fields: ['*'],
					filter: { user_id: { _eq: userId } },
					limit: 1,
				})
			);
			return { data: settings[0] || null };
		}

		if (method === 'POST') {
			const body = await readBody(event);
			
			const existing = await client.request(
				readItems('scheduler_settings', {
					fields: ['id'],
					filter: { user_id: { _eq: userId } },
					limit: 1,
				})
			);

			const settingsData = {
				user_id: userId,
				default_duration: body.default_duration,
				default_meeting_type: body.default_meeting_type,
				buffer_before: body.buffer_before,
				buffer_after: body.buffer_after,
				timezone: body.timezone,
				public_booking_enabled: body.public_booking_enabled,
				booking_page_slug: body.booking_page_slug,
				booking_page_title: body.booking_page_title,
				booking_page_description: body.booking_page_description,
				send_confirmations: body.send_confirmations,
				send_reminders: body.send_reminders,
				reminder_time: body.reminder_time,
				google_calendar_enabled: body.google_calendar_enabled,
				google_calendar_id: body.google_calendar_id,
				outlook_calendar_enabled: body.outlook_calendar_enabled,
			};

			let result;
			if (existing.length > 0) {
				result = await client.request(updateItem('scheduler_settings', existing[0].id, settingsData));
			} else {
				result = await client.request(createItem('scheduler_settings', settingsData));
			}

			return { data: result };
		}

		throw createError({ statusCode: 405, message: 'Method not allowed' });
	} catch (error: any) {
		console.error('Error with settings:', error);
		throw createError({
			statusCode: error.status || 500,
			message: error.message || 'Failed to process settings',
		});
	}
});

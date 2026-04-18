// server/api/calendar/google/disconnect.post.ts
import { createDirectus, rest, readItems, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	try {
		const session = await getUserSession(event);
		const userId = session?.user?.id;

		if (!userId) {
			throw createError({
				statusCode: 401,
				message: 'User not authenticated',
			});
		}

		const client = createDirectus(config.public.directusUrl).with(rest());
		const staticToken = config.directusServerToken;
		if (staticToken) {
			client.setToken(staticToken);
		}

		const existing = await client.request(
			readItems('scheduler_settings', {
				fields: ['id'],
				filter: { user_id: { _eq: userId } },
				limit: 1,
			})
		);

		if (existing.length > 0) {
			await client.request(
				updateItem('scheduler_settings', existing[0].id, {
					google_calendar_enabled: false,
					google_refresh_token: null,
					google_calendar_id: null,
				})
			);
		}

		return { success: true };
	} catch (error: any) {
		console.error('Error disconnecting Google Calendar:', error);
		throw createError({
			statusCode: 500,
			message: error.message || 'Failed to disconnect',
		});
	}
});

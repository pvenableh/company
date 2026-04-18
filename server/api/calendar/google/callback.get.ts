// server/api/calendar/google/callback.get.ts
import { createDirectus, rest, readItems, updateItem, createItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const query = getQuery(event);
	const code = query.code as string;

	if (!code) {
		throw createError({ statusCode: 400, message: 'Authorization code required' });
	}

	const clientId = config.googleClientId;
	const clientSecret = config.googleClientSecret;

	try {
		const { google } = await import('googleapis');

		const oauth2Client = new google.auth.OAuth2(
			clientId,
			clientSecret,
			`${config.public.siteUrl}/api/calendar/google/callback`
		);

		const { tokens } = await oauth2Client.getToken(code);
		
		if (!tokens.refresh_token) {
			throw new Error('No refresh token received. Please try again.');
		}

		const session = await getUserSession(event);
		const userId = session?.user?.id;

		if (!userId) {
			throw createError({ statusCode: 401, message: 'User not authenticated' });
		}

		const client = createDirectus(config.public.directusUrl).with(rest());
		const staticToken = config.directusServerToken;
		if (staticToken) client.setToken(staticToken);

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
					google_calendar_enabled: true,
					google_refresh_token: tokens.refresh_token,
					google_calendar_id: 'primary',
				})
			);
		} else {
			await client.request(
				createItem('scheduler_settings', {
					user_id: userId,
					google_calendar_enabled: true,
					google_refresh_token: tokens.refresh_token,
					google_calendar_id: 'primary',
				})
			);
		}

		return sendRedirect(event, '/scheduler/settings?google=connected');
	} catch (error: any) {
		console.error('Google OAuth callback error:', error);
		return sendRedirect(event, `/scheduler/settings?error=${encodeURIComponent(error.message)}`);
	}
});

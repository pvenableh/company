// server/api/calendar/outlook/callback.get.ts
import { createDirectus, rest, readItems, updateItem, createItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const query = getQuery(event);
	const code = query.code as string;

	if (!code) {
		throw createError({
			statusCode: 400,
			message: 'Authorization code required',
		});
	}

	const clientId = config.azureClientId;
	const clientSecret = config.azureClientSecret;

	if (!clientId || !clientSecret) {
		throw createError({
			statusCode: 500,
			message: 'Azure/Outlook OAuth not configured',
		});
	}

	try {
		const redirectUri = `${config.public.siteUrl}/api/calendar/outlook/callback`;

		// Exchange code for tokens
		const tokenResponse = await $fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				code,
				redirect_uri: redirectUri,
				grant_type: 'authorization_code',
				scope: 'openid profile offline_access Calendars.ReadWrite',
			}).toString(),
		});

		const tokens = tokenResponse as any;

		if (!tokens.refresh_token) {
			throw new Error('No refresh token received');
		}

		// Get user session
		const session = await getUserSession(event);
		const userId = session?.user?.id;

		if (!userId) {
			throw createError({
				statusCode: 401,
				message: 'User not authenticated',
			});
		}

		// Save refresh token to settings
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
					outlook_calendar_enabled: true,
					outlook_refresh_token: tokens.refresh_token,
				})
			);
		} else {
			await client.request(
				createItem('scheduler_settings', {
					user_id: userId,
					outlook_calendar_enabled: true,
					outlook_refresh_token: tokens.refresh_token,
				})
			);
		}

		return sendRedirect(event, '/scheduler/settings?outlook=connected');
	} catch (error: any) {
		console.error('Outlook OAuth callback error:', error);
		return sendRedirect(event, `/scheduler/settings?error=${encodeURIComponent(error.message)}`);
	}
});

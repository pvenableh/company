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

		// Resolve the connected Google account email (for multi-account labels).
		let accountEmail: string | null = null;
		try {
			oauth2Client.setCredentials(tokens);
			const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
			const { data: info } = await oauth2.userinfo.get();
			accountEmail = info.email || null;
		} catch {
			accountEmail = (session?.user as any)?.email || null;
		}

		const client = createDirectus(config.public.directusUrl).with(rest());
		const staticToken = config.directusServerToken;
		if (staticToken) client.setToken(staticToken);

		// Multi-calendar: upsert a calendar_connections row (one per account).
		// Non-fatal — the legacy scheduler_settings write below still runs.
		try {
			const existingConn = (await client.request(
				readItems('calendar_connections', {
					fields: ['id'],
					filter: { user: { _eq: userId }, provider: { _eq: 'google' }, account_email: { _eq: accountEmail } },
					limit: 1,
				}),
			)) as any[];
			if (existingConn.length > 0) {
				await client.request(updateItem('calendar_connections', existingConn[0].id, {
					refresh_token: tokens.refresh_token,
					enabled: true,
				} as any));
			} else {
				await client.request(createItem('calendar_connections', {
					user: userId,
					provider: 'google',
					account_email: accountEmail,
					display_name: accountEmail || 'Google Calendar',
					color: '#4285F4',
					calendar_id: 'primary',
					refresh_token: tokens.refresh_token,
					blocks_availability: true,
					show_on_calendar: false,
					is_write_target: true,
					enabled: true,
				} as any));
			}
		} catch (e: any) {
			console.warn('[google/callback] calendar_connections upsert failed (non-fatal):', e?.message);
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

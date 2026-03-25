// server/api/calendar/google/create-event.post.ts
import { createDirectus, rest, readItems, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const body = await readBody(event);

	const {
		meetingId,
		userId,
		title,
		description,
		startTime,
		endTime,
		attendeeEmail,
	} = body;

	if (!userId || !title || !startTime || !endTime) {
		throw createError({
			statusCode: 400,
			message: 'Missing required fields',
		});
	}

	const clientId = config.googleClientId;
	const clientSecret = config.googleClientSecret;

	if (!clientId || !clientSecret) {
		throw createError({
			statusCode: 500,
			message: 'Google Calendar not configured',
		});
	}

	try {
		// Get user settings with refresh token
		const client = createDirectus(config.public.directusUrl).with(rest());
		const staticToken = config.directusStaticToken;
		if (staticToken) {
			client.setToken(staticToken);
		}

		const settings = await client.request(
			readItems('scheduler_settings', {
				fields: ['google_refresh_token', 'google_calendar_id', 'timezone'],
				filter: { user_id: { _eq: userId } },
				limit: 1,
			})
		);

		if (!settings.length || !settings[0].google_refresh_token) {
			throw createError({
				statusCode: 400,
				message: 'Google Calendar not connected',
			});
		}

		const { google } = await import('googleapis');

		const oauth2Client = new google.auth.OAuth2(
			clientId,
			clientSecret,
			`${config.public.siteUrl}/api/calendar/google/callback`
		);

		oauth2Client.setCredentials({
			refresh_token: settings[0].google_refresh_token,
		});

		const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

		// Use timezone from request body, scheduler settings, or fallback
		const tz = body.timezone || (settings[0] as any).timezone || 'America/New_York';

		const eventData: any = {
			summary: title,
			description,
			start: {
				dateTime: new Date(startTime).toISOString(),
				timeZone: tz,
			},
			end: {
				dateTime: new Date(endTime).toISOString(),
				timeZone: tz,
			},
			reminders: {
				useDefault: false,
				overrides: [
					{ method: 'email', minutes: 60 },
					{ method: 'popup', minutes: 15 },
				],
			},
		};

		if (attendeeEmail) {
			eventData.attendees = [{ email: attendeeEmail }];
			eventData.sendUpdates = 'all';
		}

		const calendarId = settings[0].google_calendar_id || 'primary';
		const response = await calendar.events.insert({
			calendarId,
			requestBody: eventData,
		});

		// Update meeting with Google event ID
		if (meetingId && response.data.id) {
			await client.request(
				updateItem('video_meetings', meetingId, {
					google_event_id: response.data.id,
				})
			);
		}

		return {
			success: true,
			eventId: response.data.id,
			htmlLink: response.data.htmlLink,
		};
	} catch (error: any) {
		console.error('Error creating Google Calendar event:', error);
		throw createError({
			statusCode: 500,
			message: error.message || 'Failed to create calendar event',
		});
	}
});

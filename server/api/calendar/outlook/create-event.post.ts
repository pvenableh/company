// server/api/calendar/outlook/create-event.post.ts
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

	const clientId = config.azureClientId;
	const clientSecret = config.azureClientSecret;

	if (!clientId || !clientSecret) {
		throw createError({
			statusCode: 500,
			message: 'Outlook Calendar not configured',
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
				fields: ['outlook_refresh_token'],
				filter: { user_id: { _eq: userId } },
				limit: 1,
			})
		);

		if (!settings.length || !settings[0].outlook_refresh_token) {
			throw createError({
				statusCode: 400,
				message: 'Outlook Calendar not connected',
			});
		}

		// Refresh access token
		const tokenResponse = await $fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				refresh_token: settings[0].outlook_refresh_token,
				grant_type: 'refresh_token',
				scope: 'openid profile offline_access Calendars.ReadWrite',
			}).toString(),
		});

		const tokens = tokenResponse as any;
		const accessToken = tokens.access_token;

		// Create calendar event
		const eventData: any = {
			subject: title,
			body: {
				contentType: 'text',
				content: description || '',
			},
			start: {
				dateTime: new Date(startTime).toISOString(),
				timeZone: 'America/New_York',
			},
			end: {
				dateTime: new Date(endTime).toISOString(),
				timeZone: 'America/New_York',
			},
			isReminderOn: true,
			reminderMinutesBeforeStart: 15,
		};

		if (attendeeEmail) {
			eventData.attendees = [
				{
					emailAddress: {
						address: attendeeEmail,
					},
					type: 'required',
				},
			];
		}

		const response = await $fetch('https://graph.microsoft.com/v1.0/me/calendar/events', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
			body: eventData,
		}) as any;

		// Update meeting with Outlook event ID
		if (meetingId && response.id) {
			await client.request(
				updateItem('video_meetings', meetingId, {
					outlook_event_id: response.id,
				})
			);
		}

		return {
			success: true,
			eventId: response.id,
			webLink: response.webLink,
		};
	} catch (error: any) {
		console.error('Error creating Outlook Calendar event:', error);
		throw createError({
			statusCode: 500,
			message: error.message || 'Failed to create calendar event',
		});
	}
});

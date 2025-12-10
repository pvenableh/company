// server/api/video/meeting-info.get.ts
// Get public meeting info (title, has password, etc.)

import { createDirectus, rest, staticToken, readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const query = getQuery(event);

	const roomName = query.roomName as string;

	if (!roomName) {
		throw createError({
			statusCode: 400,
			message: 'Room name is required',
		});
	}

	const directusUrl = config.public.directusUrl;
	const directusToken = config.directusServerToken as string;

	if (!directusUrl || !directusToken) {
		// Return minimal info if Directus not configured
		return {
			title: 'Video Meeting',
			hasPassword: false,
		};
	}

	const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

	try {
		const meetings = await directus.request(
			readItems('video_meetings', {
				filter: { room_name: { _eq: roomName } },
				fields: ['title', 'description', 'password', 'status', 'host_identity', 'scheduled_start'],
				limit: 1,
			}),
		);

		if (meetings.length === 0) {
			// Meeting doesn't exist in DB yet, might be created on-the-fly
			return {
				title: 'Video Meeting',
				hasPassword: false,
				exists: false,
			};
		}

		const meeting = meetings[0] as any;

		return {
			title: meeting.title || 'Video Meeting',
			description: meeting.description,
			hasPassword: !!meeting.password,
			status: meeting.status,
			host: meeting.host_identity,
			scheduledStart: meeting.scheduled_start,
			exists: true,
		};
	} catch (error: any) {
		console.error('Error fetching meeting info:', error);
		return {
			title: 'Video Meeting',
			hasPassword: false,
			exists: false,
		};
	}
});

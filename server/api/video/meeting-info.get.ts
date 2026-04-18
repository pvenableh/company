// server/api/video/meeting-info.get.ts
// Public endpoint to get meeting info by room name

import { createDirectus, rest, readItems, staticToken } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const query = getQuery(event);
	const roomName = query.roomName as string;

	if (!roomName) {
		throw createError({ statusCode: 400, message: 'roomName is required' });
	}

	try {
		// Use server token to read meeting data with relations
		const directus = createDirectus(config.public.directusUrl)
			.with(rest())
			.with(staticToken(config.directusServerToken));

		const meetings = await directus.request(
			readItems('video_meetings', {
				filter: {
					room_name: { _eq: roomName },
				},
				fields: [
					'id',
					'title',
					'description',
					'room_name',
					'room_sid',
					'meeting_url',
					'status',
					'scheduled_start',
					'scheduled_end',
					'duration_minutes',
					'meeting_type',
					'waiting_room_enabled',
					'host_identity',
					'host_user.id',
					'host_user.first_name',
					'host_user.last_name',
					'host_user.avatar',
					'attendees.id',
					'attendees.attendee_type',
					'attendees.guest_name',
					'attendees.guest_email',
					'attendees.status',
					'attendees.directus_user.id',
					'attendees.directus_user.first_name',
					'attendees.directus_user.last_name',
				],
				limit: 1,
			}),
		);

		if (meetings.length === 0) {
			throw createError({ statusCode: 404, message: 'Meeting not found' });
		}

		return { data: meetings[0] };
	} catch (error: any) {
		console.error('Meeting info error:', error);

		if (error.statusCode === 404) {
			throw error;
		}

		throw createError({
			statusCode: 500,
			message: error.message || 'Failed to fetch meeting info',
		});
	}
});

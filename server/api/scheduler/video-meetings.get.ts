// server/api/scheduler/video-meetings.get.ts
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	try {
		// Get session from nuxt-auth-utils
		const session = await getUserSession(event);

		if (!session?.user?.id) {
			throw createError({
				statusCode: 401,
				message: 'Unauthorized - Please sign in',
			});
		}

		const userId = session.user.id;

		// Get query parameters for filtering
		const query = getQuery(event);
		const limit = parseInt(query.limit as string) || 50;
		const status = query.status as string;

		// Get Directus client with user's session token
		const directus = await getUserDirectus(event);

		// Build filter - get meetings where user is the host or creator
		const filter: any = {
			_or: [{ host_user: { _eq: userId } }, { user_created: { _eq: userId } }],
		};

		// Add status filter if provided
		if (status) {
			filter.status = { _eq: status };
		}

		// Fetch video meetings
		const meetings = await directus.request(
			readItems('video_meetings', {
				filter,
				sort: ['-scheduled_start'],
				limit,
				fields: [
					'id',
					'room_name',
					'room_sid',
					'title',
					'description',
					'meeting_type',
					'duration_minutes',
					'scheduled_start',
					'scheduled_end',
					'actual_start',
					'actual_end',
					'status',
					'host_identity',
					'host_user',
					'meeting_url',
					'invitee_name',
					'invitee_email',
					'invite_sent',
					'recording_enabled',
					'waiting_room_enabled',
					'user_created',
					'date_created',
					'attendees.id',
					'attendees.guest_name',
					'attendees.guest_email',
					'attendees.status',
					'attendees.directus_user.id',
					'attendees.directus_user.first_name',
					'attendees.directus_user.last_name',
				],
			}),
		);

		return {
			success: true,
			data: meetings,
		};
	} catch (error) {
		const err = error as any;
		console.error('Error fetching video meetings:', err);

		throw createError({
			statusCode: err.statusCode || 500,
			message: err.message || 'Failed to fetch video meetings',
		});
	}
});

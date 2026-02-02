// server/api/scheduler/history.get.ts
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
		const offset = parseInt(query.offset as string) || 0;
		const status = query.status as string;
		const startDate = query.start_date as string;
		const endDate = query.end_date as string;

		// Get Directus client with user's session token (auto-refreshes if needed)
		const directus = await getUserDirectus(event);

		// Build filter - get appointments where user is creator or an attendee
		const filter: any = {
			_or: [{ user_created: { _eq: userId } }, { attendees: { directus_users_id: { _eq: userId } } }],
		};

		// Add status filter if provided
		if (status) {
			filter.status = { _eq: status };
		}

		// Add date range filter if provided
		if (startDate) {
			filter.start_time = { ...(filter.start_time || {}), _gte: startDate };
		}
		if (endDate) {
			filter.end_time = { ...(filter.end_time || {}), _lte: endDate };
		}

		// Fetch appointments history
		const appointments = await directus.request(
			readItems('appointments', {
				filter,
				sort: ['-start_time'],
				limit,
				offset,
				fields: [
					'id',
					'title',
					'description',
					'start_time',
					'end_time',
					'status',
					'is_video',
					'meeting_link',
					'room_name',
					'reminder_sent',
					'google_event_id',
					'outlook_event_id',
					'user_created.id',
					'user_created.first_name',
					'user_created.last_name',
					'user_created.email',
					'video_meeting.id',
					'video_meeting.room_name',
					'video_meeting.status',
					'attendees.id',
					'attendees.directus_users_id.id',
					'attendees.directus_users_id.first_name',
					'attendees.directus_users_id.last_name',
					'attendees.directus_users_id.email',
					'attendees.directus_users_id.avatar',
					'date_created',
					'date_updated',
				],
			}),
		);

		return {
			success: true,
			data: appointments,
		};
	} catch (error) {
		const err = error as any;
		console.error('Error fetching scheduler history:', err);

		throw createError({
			statusCode: err.statusCode || 500,
			message: err.message || 'Failed to fetch scheduler history',
		});
	}
});

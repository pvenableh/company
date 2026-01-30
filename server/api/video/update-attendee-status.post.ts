// server/api/video/update-attendee-status.post.ts
// Update attendee status (admit, reject, in_meeting, left)

import { createDirectus, rest, readItem, updateItem, staticToken } from '@directus/sdk';
import { getServerSession } from '#auth';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const body = await readBody(event);

	const { attendeeId, status } = body;

	if (!attendeeId) {
		throw createError({ statusCode: 400, message: 'attendeeId is required' });
	}

	if (!status) {
		throw createError({ statusCode: 400, message: 'status is required' });
	}

	const validStatuses = ['invited', 'waiting', 'admitted', 'rejected', 'in_meeting', 'left'];
	if (!validStatuses.includes(status)) {
		throw createError({ statusCode: 400, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
	}

	try {
		// Try to get user session for authorization (host actions)
		let userId = null;
		try {
			const session = await getServerSession(event);
			userId = session?.user?.id || null;
		} catch {
			// No session - might be a guest updating their own status
		}

		const directus = createDirectus(config.public.directusUrl)
			.with(rest())
			.with(staticToken(config.directusServerToken || config.directusStaticToken));

		// Get the attendee record with meeting info
		const attendee = await directus.request(
			readItem('video_meeting_attendees', attendeeId, {
				fields: ['id', 'status', 'directus_user', 'video_meeting.id', 'video_meeting.host_user'],
			}),
		);

		if (!attendee) {
			throw createError({ statusCode: 404, message: 'Attendee not found' });
		}

		const meeting = attendee.video_meeting as any;
		const isHost = userId && meeting.host_user === userId;

		// Authorization checks
		if (status === 'admitted' || status === 'rejected') {
			// Only host can admit or reject
			if (!isHost) {
				throw createError({ statusCode: 403, message: 'Only the host can admit or reject participants' });
			}
		}
		// For other statuses (in_meeting, left, waiting), we allow updates
		// This enables guests to update their own status

		// Build update data
		const updateData: any = { status };

		// Add timestamps
		if (status === 'in_meeting') {
			updateData.joined_at = new Date().toISOString();
		} else if (status === 'left') {
			updateData.left_at = new Date().toISOString();
		}

		// Update the attendee
		const updated = await directus.request(updateItem('video_meeting_attendees', attendeeId, updateData));

		return {
			success: true,
			data: updated,
		};
	} catch (error: any) {
		console.error('Update attendee status error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to update attendee status',
		});
	}
});

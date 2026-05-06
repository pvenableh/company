// GET /api/video/meetings/:id/notes
// List notes & decisions captured during a meeting.

import { readItems } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

	await requireMeetingAccess(event, meetingId);

	const directus = getTypedDirectus();
	const notes = await directus.request(
		readItems('meeting_notes', {
			filter: { meeting: { _eq: meetingId } },
			fields: [
				'id',
				'note_type',
				'content',
				'meeting_offset_seconds',
				'date_created',
				'author.id',
				'author.first_name',
				'author.last_name',
			] as any,
			sort: ['date_created'],
			limit: 200,
		}),
	);

	return { data: notes };
});

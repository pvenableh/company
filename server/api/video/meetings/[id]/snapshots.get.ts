// GET /api/video/meetings/:id/snapshots
// List frame snapshots captured during a meeting (for the recap gallery).

import { readItems } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

	await requireMeetingAccess(event, meetingId);

	const directus = getTypedDirectus();
	const snapshots = await directus.request(
		readItems('meeting_snapshots', {
			filter: { meeting: { _eq: meetingId } },
			fields: [
				'id',
				'caption',
				'meeting_offset_seconds',
				'date_created',
				'image.id',
				'image.filename_download',
				'author.id',
				'author.first_name',
				'author.last_name',
			] as any,
			sort: ['date_created'],
			limit: 200,
		}),
	);

	return { data: snapshots };
});

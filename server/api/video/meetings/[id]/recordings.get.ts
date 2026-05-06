// GET /api/video/meetings/:id/recordings
// List Daily.co cloud recordings for a meeting. Pulled live from Daily's
// REST API so we always reflect the current state (including in-progress
// recordings). Access-links are minted separately per click since they
// expire within ~1hr.

import { readItem } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';
import { listDailyRecordings } from '~~/server/utils/daily';

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

	await requireMeetingAccess(event, meetingId);

	const directus = getTypedDirectus();
	const meeting = await directus.request(
		readItem('video_meetings', meetingId, { fields: ['room_name'] as any }),
	) as { room_name?: string } | null;

	const roomName = meeting?.room_name;
	if (!roomName) {
		return { data: [] };
	}

	try {
		const recordings = await listDailyRecordings(roomName);
		return { data: recordings };
	} catch (err: any) {
		console.error('[video/meetings/:id/recordings] Daily list failed:', err.message);
		throw createError({
			statusCode: 502,
			message: 'Could not reach Daily.co to list recordings',
		});
	}
});

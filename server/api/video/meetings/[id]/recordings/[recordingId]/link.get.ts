// GET /api/video/meetings/:id/recordings/:recordingId/link
// Mint a short-lived download/playback URL for a single recording.
// We verify the recording actually belongs to this meeting's room so a
// caller can't pluck arbitrary recording IDs from other domains.

import { readItem } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';
import { listDailyRecordings, getDailyRecordingAccessLink } from '~~/server/utils/daily';

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	const recordingId = getRouterParam(event, 'recordingId');
	if (!meetingId || !recordingId) {
		throw createError({ statusCode: 400, message: 'meetingId and recordingId are required' });
	}

	await requireMeetingAccess(event, meetingId);

	const directus = getTypedDirectus();
	const meeting = await directus.request(
		readItem('video_meetings', meetingId, { fields: ['room_name'] as any }),
	) as { room_name?: string } | null;

	const roomName = meeting?.room_name;
	if (!roomName) {
		throw createError({ statusCode: 404, message: 'Meeting has no Daily room' });
	}

	const recordings = await listDailyRecordings(roomName);
	const match = recordings.find((r) => r.id === recordingId);
	if (!match) {
		throw createError({ statusCode: 404, message: 'Recording not found for this meeting' });
	}

	try {
		const url = await getDailyRecordingAccessLink(recordingId);
		return { data: { url } };
	} catch (err: any) {
		console.error('[video/recordings/:id/link] access-link failed:', err.message);
		throw createError({
			statusCode: 502,
			message: 'Could not generate download link',
		});
	}
});

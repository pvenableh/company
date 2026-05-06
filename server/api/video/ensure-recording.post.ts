// server/api/video/ensure-recording.post.ts
// Idempotently turns on cloud recording for a Daily room. Called by the
// meeting page when the host joins so legacy rooms (created before the
// `enable_recording: 'cloud'` default) still expose the record button.
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await getUserSession(event);
	if (!session?.user?.id) {
		throw createError({ statusCode: 401, message: 'Unauthorized' });
	}

	const body = await readBody<{ roomName?: string }>(event);
	if (!body?.roomName) {
		throw createError({ statusCode: 400, message: 'roomName is required' });
	}

	const directus = getTypedDirectus();
	const meetings = await directus.request(
		readItems('video_meetings', {
			filter: { room_name: { _eq: body.roomName } },
			fields: ['host_user'],
			limit: 1,
		}),
	);
	const hostId = (meetings[0] as any)?.host_user;
	if (!hostId || hostId !== session.user.id) {
		throw createError({ statusCode: 403, message: 'Only the host can enable recording' });
	}

	await ensureRoomRecordingEnabled(body.roomName);
	return { success: true };
});

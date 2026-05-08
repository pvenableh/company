// POST /api/video/meetings/:id/toggle-transcription
// Host-only flip of `video_meetings.transcription_enabled`. Mirrors
// toggle-recording — the meeting page consumes the flag and starts/stops
// Deepgram via the wrapped Daily call object. Free tier blocked from
// turning ON; everyone can flip OFF.

import { updateItem } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';

interface Body {
	enabled: boolean;
}

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

	const { isHost, organizationId } = await requireMeetingAccess(event, meetingId);
	if (!isHost) {
		throw createError({ statusCode: 403, message: 'Only the host can change transcription' });
	}

	const body = await readBody<Body>(event);
	const enabled = body?.enabled === true;

	if (enabled && organizationId) {
		const defaults = await fetchOrgMeetingDefaults(organizationId);
		assertFeatureAllowed(defaults, 'transcription', true);
	}

	const directus = getTypedDirectus();
	await directus.request(
		updateItem('video_meetings', meetingId, { transcription_enabled: enabled } as any),
	);

	return { data: { transcription_enabled: enabled } };
});

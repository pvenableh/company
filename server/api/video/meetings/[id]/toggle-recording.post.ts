// POST /api/video/meetings/:id/toggle-recording
// Host-only flip of `video_meetings.recording_enabled`. The meeting page
// reactively starts/stops the live SDK off this same flag — persisting it
// here keeps the row in sync (so a refresh keeps recording on) and gives the
// next host an accurate audit. Free-tier orgs are blocked at the org-plan
// gate; any caller can turn it OFF.

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
		throw createError({ statusCode: 403, message: 'Only the host can change recording' });
	}

	const body = await readBody<Body>(event);
	const enabled = body?.enabled === true;

	if (enabled && organizationId) {
		const defaults = await fetchOrgMeetingDefaults(organizationId);
		assertFeatureAllowed(defaults, 'recording', true);
	}

	const directus = getTypedDirectus();
	await directus.request(
		updateItem('video_meetings', meetingId, { recording_enabled: enabled } as any),
	);

	return { data: { recording_enabled: enabled } };
});

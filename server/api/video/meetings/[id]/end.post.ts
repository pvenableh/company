// POST /api/video/meetings/:id/end
// Host-only manual transition to status='completed'. Daily's webhook normally
// fires this automatically on the `meeting.ended` event, but the webhook can
// miss for several reasons (HMAC unset, room exited via tab-close before
// Daily flushed, or the host left without anyone admitted). This endpoint is
// the manual recovery path so old meetings don't sit stuck in 'in_progress'.
//
// Returns the updated row's status fields. Idempotent: re-calling on an
// already-completed meeting is a no-op success.

import { readItem, updateItem } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

	const { isHost } = await requireMeetingAccess(event, meetingId);
	if (!isHost) {
		throw createError({ statusCode: 403, message: 'Only the host can end the meeting' });
	}

	const directus = getTypedDirectus();
	const row = (await directus.request(
		readItem('video_meetings', meetingId, {
			fields: ['id', 'status', 'actual_start', 'actual_duration_minutes'] as any,
		}),
	)) as any;

	if (!row) {
		throw createError({ statusCode: 404, message: 'Meeting not found' });
	}

	if (row.status === 'completed' || row.status === 'cancelled' || row.status === 'archived') {
		return {
			data: { id: meetingId, status: row.status, already_ended: true },
		};
	}

	const now = new Date();
	const patch: Record<string, any> = {
		status: 'completed',
		actual_end: now.toISOString(),
	};
	if (row.actual_start && !row.actual_duration_minutes) {
		const minutes = Math.max(
			0,
			Math.round((now.getTime() - new Date(row.actual_start).getTime()) / 60000),
		);
		patch.actual_duration_minutes = minutes;
	}

	await directus.request(updateItem('video_meetings', meetingId, patch as any));

	return { data: { id: meetingId, status: 'completed', already_ended: false } };
});

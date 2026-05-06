// POST /api/video/meetings/:id/notes
// Capture a Note or Decision during (or after) a meeting.
//
// Server-routed because Directus 11 doesn't enforce FK-walked filters on
// the create action (see reference_directus11_create_perm_quirk memo) — so
// we gate on org-membership in code and write through the admin token.

import { createItem, readItem } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';

interface Body {
	content?: string;
	note_type?: 'note' | 'decision';
	meeting_offset_seconds?: number | null;
}

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

	const { userId } = await requireMeetingAccess(event, meetingId);

	const body = await readBody<Body>(event);
	const content = (body?.content || '').trim();
	const noteType = body?.note_type === 'decision' ? 'decision' : 'note';

	if (!content) {
		throw createError({ statusCode: 400, message: 'content is required' });
	}
	if (content.length > 5000) {
		throw createError({ statusCode: 400, message: 'content too long (max 5000 chars)' });
	}

	const directus = getTypedDirectus();
	const created = await directus.request(
		createItem('meeting_notes', {
			meeting: meetingId,
			author: userId,
			content,
			note_type: noteType,
			meeting_offset_seconds:
				typeof body?.meeting_offset_seconds === 'number'
					? Math.max(0, Math.floor(body.meeting_offset_seconds))
					: null,
		} as any),
	);

	// Re-read with author expanded so the client can render attribution.
	const note = await directus.request(
		readItem('meeting_notes', (created as any).id, {
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
		}),
	);

	return { data: note };
});

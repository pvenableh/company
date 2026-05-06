// DELETE /api/video/meetings/:id/notes/:noteId
// Authors can delete their own notes; meeting host can delete any note.

import { deleteItem, readItem } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	const noteId = getRouterParam(event, 'noteId');
	if (!meetingId || !noteId) {
		throw createError({ statusCode: 400, message: 'meeting id and note id are required' });
	}

	const { userId, isHost } = await requireMeetingAccess(event, meetingId);

	const directus = getTypedDirectus();
	const note = await directus.request(
		readItem('meeting_notes', noteId, { fields: ['id', 'meeting', 'author'] as any }),
	).catch(() => null) as any;

	if (!note) {
		throw createError({ statusCode: 404, message: 'Note not found' });
	}
	const noteMeetingId = typeof note.meeting === 'object' ? note.meeting?.id : note.meeting;
	if (noteMeetingId !== meetingId) {
		throw createError({ statusCode: 404, message: 'Note not found on this meeting' });
	}

	const noteAuthor = typeof note.author === 'object' ? note.author?.id : note.author;
	if (noteAuthor !== userId && !isHost) {
		throw createError({ statusCode: 403, message: 'You can only delete your own notes' });
	}

	await directus.request(deleteItem('meeting_notes', noteId));
	return { success: true };
});

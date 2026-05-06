// POST /api/video/meetings/:id/promote-action-item
// Promote a single AI-extracted action_item (referenced by its index in the
// meeting.action_items array) into a real tasks row. The JSON entry is
// then marked `promoted: true` so the UI won't offer the button again.

import { createItem, readItem, updateItem } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';

interface Body {
	index?: number;
}

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

	const { userId, organizationId } = await requireMeetingAccess(event, meetingId);

	const body = await readBody<Body>(event);
	const index = typeof body?.index === 'number' ? body.index : -1;
	if (index < 0) {
		throw createError({ statusCode: 400, message: 'index is required' });
	}

	const directus = getTypedDirectus();
	const meeting = await directus.request(
		readItem('video_meetings', meetingId, {
			fields: ['id', 'title', 'action_items', 'project', 'project_event'] as any,
		}),
	) as any;

	const items = Array.isArray(meeting.action_items) ? [...meeting.action_items] : [];
	const item = items[index];
	if (!item) {
		throw createError({ statusCode: 404, message: 'Action item not found' });
	}
	if (item.promoted) {
		throw createError({ statusCode: 409, message: 'Action item already promoted' });
	}

	const description: string = String(item.description || '').trim();
	if (!description) {
		throw createError({ statusCode: 400, message: 'Action item has no description' });
	}

	const projectId = typeof meeting.project === 'object' ? meeting.project?.id : meeting.project;
	const projectEventId = typeof meeting.project_event === 'object'
		? meeting.project_event?.id
		: meeting.project_event;

	const task = await directus.request(
		createItem('tasks', {
			title: description.slice(0, 200),
			description: description.length > 200 ? description : null,
			status: 'new',
			category: projectEventId ? 'event' : projectId ? 'project' : 'quick',
			source_meeting: meetingId,
			project_id: projectId || null,
			project_event_id: projectEventId || null,
			organization_id: organizationId || null,
			due_date: item.due_date || null,
			user_created: userId,
		} as any),
	) as any;

	// Mark the JSON entry promoted so the UI hides the button.
	items[index] = { ...item, promoted: true, task_id: task.id };
	await directus.request(updateItem('video_meetings', meetingId, { action_items: items } as any));

	return { data: { task, action_items: items } };
});

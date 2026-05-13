// DELETE /api/video/meetings/:id
// Cancel a scheduled video meeting and clean up the row chain it owns.
//
// Cascade order (each step is best-effort so a flaky downstream doesn't strand
// the row in a half-deleted state):
//   1. Daily room  — delete via REST (rooms cost nothing live; this is hygiene)
//   2. video_meeting_attendees — FK targets us, must drop before parent
//   3. lead_activities.related_video_meeting — NULL out so the activity row
//      itself survives (history matters, the FK doesn't)
//   4. video_meetings — the actual row
//   5. appointments — only if related_appointment is set; the calendar reads
//      the appointment row, so without this the deleted meeting would still
//      show up until the appointment was reaped manually

import { readItem, readItems, updateItem, deleteItem, deleteItems } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';
import { deleteDailyRoom } from '~~/server/utils/daily';

export default defineEventHandler(async (event) => {
	const meetingId = getRouterParam(event, 'id');
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'Meeting id is required' });
	}

	const { organizationId } = await requireMeetingAccess(event, meetingId);

	const session = await getUserSession(event);
	const hostId = session?.user?.id || '';
	const hostName =
		`${session?.user?.first_name || ''} ${session?.user?.last_name || ''}`.trim() || 'Host';

	const directus = getTypedDirectus();

	const current = await directus.request(
		readItem('video_meetings', meetingId, {
			fields: ['id', 'title', 'room_name', 'scheduled_start', 'duration_minutes', 'related_appointment'] as any,
		}),
	) as any;

	// Collect linked members BEFORE cascade so we can notify them after the
	// row is gone. (We notify post-delete to avoid sending if the delete fails.)
	let cancelledMemberIds: string[] = [];
	if (current.related_appointment) {
		try {
			const rows = (await directus.request(
				readItems('appointments_directus_users', {
					filter: { appointments_id: { _eq: current.related_appointment } } as any,
					fields: ['directus_users_id'] as any,
					limit: -1,
				}),
			)) as any[];
			cancelledMemberIds = rows
				.map((r) => (typeof r.directus_users_id === 'object' ? r.directus_users_id?.id : r.directus_users_id))
				.filter(Boolean);
		} catch (err) {
			console.warn('[meetings.delete] failed to read members for cancel notify:', err);
		}
	}

	if (current.room_name) {
		try {
			await deleteDailyRoom(current.room_name);
		} catch (err) {
			console.warn('[meetings.delete] daily-side delete failed:', err);
		}
	}

	try {
		const attendees = await directus.request(
			readItems('video_meeting_attendees', {
				filter: { video_meeting: { _eq: meetingId } } as any,
				fields: ['id'] as any,
				limit: -1,
			}),
		) as any[];
		const ids = attendees.map((a) => a.id).filter(Boolean);
		if (ids.length > 0) {
			await directus.request(deleteItems('video_meeting_attendees', ids));
		}
	} catch (err) {
		console.warn('[meetings.delete] attendee cleanup failed:', err);
	}

	try {
		const activities = await directus.request(
			readItems('lead_activities', {
				filter: { related_video_meeting: { _eq: meetingId } } as any,
				fields: ['id'] as any,
				limit: -1,
			}),
		) as any[];
		for (const row of activities) {
			try {
				await directus.request(
					updateItem('lead_activities', row.id, { related_video_meeting: null } as any),
				);
			} catch (err) {
				console.warn('[meetings.delete] failed to null lead_activity FK:', row.id, err);
			}
		}
	} catch (err) {
		console.warn('[meetings.delete] lead_activities lookup failed:', err);
	}

	try {
		await directus.request(deleteItem('video_meetings', meetingId));
	} catch (err) {
		console.error('[meetings.delete] failed to delete meeting row:', err);
		throw createError({ statusCode: 500, message: 'Failed to delete meeting' });
	}

	if (current.related_appointment) {
		try {
			await directus.request(deleteItem('appointments', current.related_appointment));
		} catch (err) {
			console.warn('[meetings.delete] appointment cleanup failed:', err);
		}
	}

	// Notify linked teammates that the meeting was cancelled. Cascade-deleting
	// the appointment already dropped the junction rows; the user IDs are
	// captured above.
	if (cancelledMemberIds.length > 0) {
		try {
			await notifyMeetingChange({
				event: { kind: 'cancelled' },
				meeting: {
					id: meetingId,
					title: current.title || 'Meeting',
					meeting_url: null,
					scheduled_start: new Date(current.scheduled_start).toISOString(),
					duration_minutes: current.duration_minutes || 30,
					orgId: organizationId || null,
				},
				recipientIds: cancelledMemberIds,
				hostId,
				hostName,
			});
		} catch (err) {
			console.error('[meetings.delete] cancel notify failed:', err);
		}
	}

	return { success: true };
});

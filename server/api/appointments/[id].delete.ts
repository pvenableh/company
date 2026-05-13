// DELETE /api/appointments/:id
// Cancel a non-video appointment and notify any linked teammates.
// For video meetings, /api/video/meetings/:id (DELETE) is the entry point —
// it deletes the appointment row as part of its cascade.
//
// Auth: creator OR linked member OR active org member of related_lead's org.

import { readItem, readItems, deleteItem } from '@directus/sdk';
import { requireAppointmentAccess } from '~~/server/utils/appointment-perms';

export default defineEventHandler(async (event) => {
	const appointmentId = getRouterParam(event, 'id');
	if (!appointmentId) {
		throw createError({ statusCode: 400, message: 'Appointment id is required' });
	}

	await requireAppointmentAccess(event, appointmentId);

	const session = await getUserSession(event);
	const hostId = session?.user?.id || '';
	const hostName =
		`${session?.user?.first_name || ''} ${session?.user?.last_name || ''}`.trim() || 'Host';

	const directus = getTypedDirectus();

	const current = await directus.request(
		readItem('appointments', appointmentId, {
			fields: ['id', 'title', 'start_time', 'end_time', 'is_video', 'video_meeting', 'related_lead.organization'] as any,
		}),
	) as any;

	const resolvedOrgId: string | null = current?.related_lead && typeof current.related_lead === 'object'
		? (typeof current.related_lead.organization === 'object'
			? current.related_lead.organization?.id
			: current.related_lead.organization) || null
		: null;

	// Reject video-meeting deletes here — the video meeting DELETE route owns
	// the full cascade (Daily room, attendees, lead_activities, etc.).
	if (current.is_video || current.video_meeting) {
		throw createError({
			statusCode: 400,
			message: 'Use /api/video/meetings/:id to delete a video meeting',
		});
	}

	let cancelledMemberIds: string[] = [];
	try {
		const rows = (await directus.request(
			readItems('appointments_directus_users', {
				filter: { appointments_id: { _eq: appointmentId } } as any,
				fields: ['directus_users_id'] as any,
				limit: -1,
			}),
		)) as any[];
		cancelledMemberIds = rows
			.map((r) => (typeof r.directus_users_id === 'object' ? r.directus_users_id?.id : r.directus_users_id))
			.filter(Boolean);
	} catch (err) {
		console.warn('[appointments.delete] failed to read members for cancel notify:', err);
	}

	try {
		await directus.request(deleteItem('appointments', appointmentId));
	} catch (err) {
		console.error('[appointments.delete] failed to delete appointment row:', err);
		throw createError({ statusCode: 500, message: 'Failed to delete appointment' });
	}

	if (cancelledMemberIds.length > 0) {
		const durationMinutes = current.start_time && current.end_time
			? Math.max(15, Math.round((new Date(current.end_time).getTime() - new Date(current.start_time).getTime()) / 60000))
			: 30;
		try {
			await notifyMeetingChange({
				event: { kind: 'cancelled' },
				meeting: {
					id: appointmentId,
					title: current.title || 'Event',
					meeting_url: null,
					scheduled_start: new Date(current.start_time).toISOString(),
					duration_minutes: durationMinutes,
					collection: 'appointments',
					orgId: resolvedOrgId,
				},
				recipientIds: cancelledMemberIds,
				hostId,
				hostName,
			});
		} catch (err) {
			console.error('[appointments.delete] cancel notify failed:', err);
		}
	}

	return { success: true };
});

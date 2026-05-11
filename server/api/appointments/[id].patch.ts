// PATCH /api/appointments/:id
// Edit a non-video appointment in place. Mirrors the video meeting PATCH route
// but for the simpler appointments collection: updates fields, diffs members
// against the existing appointments_directus_users rows, and fans out
// invited/removed/time_changed notifications.
//
// Auth: creator OR linked member OR active org member of related_lead's org
// (see requireAppointmentAccess).

import { createItem, deleteItems, readItem, readItems, updateItem } from '@directus/sdk';
import { requireAppointmentAccess } from '~~/server/utils/appointment-perms';

interface Body {
	title?: string;
	description?: string | null;
	start_time?: string;
	end_time?: string;
	status?: string;
	related_lead?: number | null;
	/** Full replacement set of teammate Directus user IDs. Omit to leave members untouched. */
	members?: string[];
}

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

	const body = await readBody<Body>(event);
	if (!body || typeof body !== 'object') {
		throw createError({ statusCode: 400, message: 'Body is required' });
	}

	const directus = getTypedDirectus();

	const current = await directus.request(
		readItem('appointments', appointmentId, {
			fields: ['id', 'title', 'description', 'start_time', 'end_time', 'related_lead'] as any,
		}),
	) as any;

	// ── Build the appointments patch ──
	const patch: Record<string, any> = {};
	if (typeof body.title === 'string') patch.title = body.title;
	if ('description' in body) patch.description = body.description ?? null;
	if (typeof body.start_time === 'string') patch.start_time = body.start_time;
	if (typeof body.end_time === 'string') patch.end_time = body.end_time;
	if (typeof body.status === 'string') patch.status = body.status;
	if ('related_lead' in body) patch.related_lead = body.related_lead ?? null;

	if (Object.keys(patch).length > 0) {
		await directus.request(updateItem('appointments', appointmentId, patch as any));
	}

	const nextStart = body.start_time || current.start_time;
	const nextEnd = body.end_time || current.end_time;
	const durationMinutes = nextStart && nextEnd
		? Math.max(15, Math.round((new Date(nextEnd).getTime() - new Date(nextStart).getTime()) / 60000))
		: 30;
	const timingChanged = !!body.start_time && new Date(current.start_time).getTime() !== new Date(body.start_time).getTime();

	// ── Member diff + notifications ──
	let addedMemberIds: string[] = [];
	let removedMemberIds: string[] = [];
	let remainingMemberIds: string[] = [];

	if (Array.isArray(body.members)) {
		const desired = Array.from(new Set(body.members.filter(Boolean)));
		try {
			const existingRows = (await directus.request(
				readItems('appointments_directus_users', {
					filter: { appointments_id: { _eq: appointmentId } } as any,
					fields: ['id', 'directus_users_id'] as any,
					limit: -1,
				}),
			)) as any[];

			const existingIds = existingRows
				.map((r) => (typeof r.directus_users_id === 'object' ? r.directus_users_id?.id : r.directus_users_id))
				.filter(Boolean) as string[];

			addedMemberIds = desired.filter((id) => !existingIds.includes(id));
			removedMemberIds = existingIds.filter((id) => !desired.includes(id));
			remainingMemberIds = desired.filter((id) => existingIds.includes(id));

			for (const memberId of addedMemberIds) {
				try {
					await directus.request(
						createItem('appointments_directus_users', {
							appointments_id: appointmentId,
							directus_users_id: memberId,
						} as any),
					);
				} catch (err) {
					console.error('[appointments.patch] failed to link member:', memberId, err);
				}
			}

			const removalRowIds = existingRows
				.filter((r) => {
					const uid = typeof r.directus_users_id === 'object' ? r.directus_users_id?.id : r.directus_users_id;
					return removedMemberIds.includes(uid);
				})
				.map((r) => r.id);
			if (removalRowIds.length > 0) {
				try {
					await directus.request(deleteItems('appointments_directus_users', removalRowIds));
				} catch (err) {
					console.error('[appointments.patch] failed to remove member junction rows:', err);
				}
			}
		} catch (err) {
			console.error('[appointments.patch] member diff failed:', err);
		}
	} else {
		// Members not in body — pull existing set so a time-change notification
		// can still reach everyone who's linked.
		try {
			const existingRows = (await directus.request(
				readItems('appointments_directus_users', {
					filter: { appointments_id: { _eq: appointmentId } } as any,
					fields: ['directus_users_id'] as any,
					limit: -1,
				}),
			)) as any[];
			remainingMemberIds = existingRows
				.map((r) => (typeof r.directus_users_id === 'object' ? r.directus_users_id?.id : r.directus_users_id))
				.filter(Boolean);
		} catch (err) {
			console.error('[appointments.patch] failed to read existing members for notify:', err);
		}
	}

	const meetingRef = {
		id: appointmentId,
		title: (patch.title as string) || current.title || 'Event',
		meeting_url: null,
		scheduled_start: new Date(nextStart).toISOString(),
		duration_minutes: durationMinutes,
		collection: 'appointments' as const,
	};

	if (addedMemberIds.length > 0) {
		try {
			await notifyMeetingChange({
				event: { kind: 'invited' },
				meeting: meetingRef,
				recipientIds: addedMemberIds,
				hostId,
				hostName,
			});
		} catch (err) {
			console.error('[appointments.patch] notify(invited) failed:', err);
		}
	}

	if (removedMemberIds.length > 0) {
		try {
			await notifyMeetingChange({
				event: { kind: 'removed' },
				meeting: {
					...meetingRef,
					scheduled_start: new Date(current.start_time).toISOString(),
				},
				recipientIds: removedMemberIds,
				hostId,
				hostName,
			});
		} catch (err) {
			console.error('[appointments.patch] notify(removed) failed:', err);
		}
	}

	if (timingChanged && remainingMemberIds.length > 0) {
		try {
			await notifyMeetingChange({
				event: { kind: 'time_changed', previousStart: new Date(current.start_time) },
				meeting: meetingRef,
				recipientIds: remainingMemberIds,
				hostId,
				hostName,
			});
		} catch (err) {
			console.error('[appointments.patch] notify(time_changed) failed:', err);
		}
	}

	return { success: true, data: { id: appointmentId } };
});

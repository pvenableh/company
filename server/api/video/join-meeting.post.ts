// server/api/video/join-meeting.post.ts
// Public endpoint for guests to join a meeting (creates attendee record)

import { readItems, createItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const body = await readBody(event);

	const { roomName, guestName, guestEmail, guestPhone } = body;

	if (!roomName) {
		throw createError({ statusCode: 400, message: 'roomName is required' });
	}

	// Try to get authenticated user (optional - guests won't have this)
	let userId = null;
	try {
		const session = await getUserSession(event);
		userId = session?.user?.id || null;
	} catch {
		// No session - that's fine for guests
	}

	if (!guestName && !userId) {
		throw createError({ statusCode: 400, message: 'guestName or login is required' });
	}

	try {
		// Use admin client since guests may not be authenticated
		const directus = getServerDirectus();

		// Get the meeting
		const meetings = await directus.request(
			readItems('video_meetings', {
				filter: { room_name: { _eq: roomName } },
				fields: ['id', 'host_user', 'waiting_room_enabled', 'status', 'related_organization'],
				limit: 1,
			}),
		);

		if (meetings.length === 0) {
			throw createError({ statusCode: 404, message: 'Meeting not found' });
		}

		const meeting = meetings[0];

		// Check if meeting is still valid
		if (meeting?.status === 'completed' || meeting?.status === 'cancelled') {
			throw createError({ statusCode: 400, message: 'This meeting has ended' });
		}

		// Check if user is the host - auto admit
		const isHost = userId && meeting?.host_user === userId;

		// Check if attendee already exists
		const filterConditions: any[] = [];
		if (userId) {
			filterConditions.push({ directus_user: { _eq: userId } });
		}
		if (guestEmail) {
			filterConditions.push({ guest_email: { _eq: guestEmail } });
		}

		let existingAttendees: any[] = [];
		if (filterConditions.length > 0) {
			existingAttendees = await directus.request(
				readItems('video_meeting_attendees', {
					filter: {
						video_meeting: { _eq: meeting?.id },
						_or: filterConditions,
					},
					limit: 1,
				}),
			);
		}

		let attendee;
		let status;

		if (existingAttendees.length > 0) {
			// Always admit at our layer — Daily's prebuilt owns the knock/admit
			// flow inside the iframe when waiting_room_enabled is on. Older rows
			// from the defunct in-app waiting room (status='waiting'/'rejected')
			// get normalized to 'admitted' on touch so a returning user isn't
			// trapped on a screen we no longer render.
			status = 'admitted';
			attendee = existingAttendees[0];
			if (attendee.status !== 'admitted' && attendee.status !== 'in_meeting') {
				await directus.request(
					updateItem('video_meeting_attendees', attendee.id, {
						status,
						guest_name: guestName || attendee.guest_name,
					}),
				);
			}
		} else {
			// Create new attendee. Same rationale as above — let Daily's prebuilt
			// own the knock/admit flow, always admit at our layer.
			status = 'admitted';

			attendee = await directus.request(
				createItem('video_meeting_attendees', {
					video_meeting: meeting?.id,
					attendee_type: userId ? 'user' : 'guest',
					directus_user: userId || null,
					guest_name: guestName,
					guest_email: guestEmail || null,
					guest_phone: guestPhone || null,
					status,
				}),
			);

			// Bump last_contacted_at for the joined participant — best-effort
			// analytics, scoped to the meeting's tenant org if known.
			const orgId = (typeof meeting?.related_organization === 'string'
				? meeting.related_organization
				: (meeting?.related_organization as any)?.id) || null;
			const participantEmail = guestEmail || null;
			if (participantEmail) {
				await touchContacts([participantEmail], 'meeting', orgId);
			}
		}

		return {
			success: true,
			attendeeId: attendee.id,
			status,
			isHost,
			waitingRoomEnabled: meeting?.waiting_room_enabled,
		};
	} catch (error: any) {
		console.error('Join meeting error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to join meeting',
		});
	}
});

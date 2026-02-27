// server/api/scheduler/meeting-requests.ts
import { readItems, createItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const method = getMethod(event);

	if (method === 'GET') return handleGet(event);
	if (method === 'POST') return handlePost(event);
	if (method === 'PATCH') return handlePatch(event);

	throw createError({ statusCode: 405, message: 'Method not allowed' });
});

// GET - List meeting requests (admins see requests to them, clients see their own)
async function handleGet(event: any) {
	const session = await getUserSession(event);
	if (!session?.user?.id) {
		throw createError({ statusCode: 401, message: 'Unauthorized' });
	}

	const directus = await getUserDirectus(event);
	const query = getQuery(event);
	const statusFilter = query.status as string | undefined;

	// Build filter - users see requests they created OR requests where they are the host
	const filter: any = {
		_or: [
			{ requester_id: { _eq: session.user.id } },
			{ host_user: { _eq: session.user.id } },
		],
	};

	if (statusFilter) {
		filter.status = { _eq: statusFilter };
	}

	const requests = await directus.request(
		readItems('meeting_requests', {
			fields: [
				'*',
				'requester_id.id',
				'requester_id.first_name',
				'requester_id.last_name',
				'requester_id.email',
				'requester_id.avatar',
				'host_user.id',
				'host_user.first_name',
				'host_user.last_name',
				'host_user.email',
				'linked_appointment.*',
			],
			filter,
			sort: ['-date_created'],
		}),
	);

	return { success: true, data: requests };
}

// POST - Create a new meeting request (client requests a meeting with an admin)
async function handlePost(event: any) {
	const session = await getUserSession(event);
	if (!session?.user?.id) {
		throw createError({ statusCode: 401, message: 'Unauthorized' });
	}

	const body = await readBody(event);
	const { host_user_id, requested_date, preferred_time, duration_minutes, meeting_type, notes } = body;

	if (!host_user_id || !requested_date) {
		throw createError({
			statusCode: 400,
			message: 'Missing required fields: host_user_id, requested_date',
		});
	}

	const directus = await getUserDirectus(event);

	const request = await directus.request(
		createItem('meeting_requests', {
			status: 'published',
			requester_id: session.user.id,
			host_user: host_user_id,
			requested_date,
			preferred_time: preferred_time || null,
			duration_minutes: duration_minutes || 30,
			meeting_type: meeting_type || 'consultation',
			request_status: 'pending',
			notes: notes || null,
		}),
	);

	return { success: true, data: request };
}

// PATCH - Update meeting request status (admin approves/rejects)
async function handlePatch(event: any) {
	const session = await getUserSession(event);
	if (!session?.user?.id) {
		throw createError({ statusCode: 401, message: 'Unauthorized' });
	}

	const body = await readBody(event);
	const { request_id, request_status, admin_notes } = body;

	if (!request_id || !request_status) {
		throw createError({
			statusCode: 400,
			message: 'Missing required fields: request_id, request_status',
		});
	}

	if (!['approved', 'rejected', 'pending'].includes(request_status)) {
		throw createError({
			statusCode: 400,
			message: 'Invalid request_status. Must be: approved, rejected, or pending',
		});
	}

	const directus = await getUserDirectus(event);

	// Verify the current user is the host of this request
	const existing = await directus.request(
		readItems('meeting_requests', {
			filter: { id: { _eq: request_id } },
			fields: ['id', 'host_user', 'requester_id', 'requested_date', 'preferred_time', 'duration_minutes', 'meeting_type', 'notes'],
			limit: 1,
		}),
	);

	if (!existing.length) {
		throw createError({ statusCode: 404, message: 'Meeting request not found' });
	}

	const meetingRequest = existing[0];

	// Only the host can approve/reject
	const hostId = typeof meetingRequest.host_user === 'object' ? meetingRequest.host_user?.id : meetingRequest.host_user;
	if (hostId !== session.user.id) {
		throw createError({ statusCode: 403, message: 'Only the host can update this request' });
	}

	const updateData: any = {
		request_status,
		admin_notes: admin_notes || null,
	};

	// If approved, create a meeting via the book endpoint
	let meeting = null;
	if (request_status === 'approved' && meetingRequest.requested_date) {
		try {
			const startTime = meetingRequest.preferred_time
				? new Date(`${meetingRequest.requested_date}T${meetingRequest.preferred_time}`)
				: new Date(meetingRequest.requested_date);
			const durationMs = (meetingRequest.duration_minutes || 30) * 60000;
			const endTime = new Date(startTime.getTime() + durationMs);

			const requesterId = typeof meetingRequest.requester_id === 'object'
				? meetingRequest.requester_id?.id
				: meetingRequest.requester_id;

			// Fetch requester details to get their email
			const requesterData = await directus.request(
				readItems('directus_users', {
					filter: { id: { _eq: requesterId } },
					fields: ['id', 'first_name', 'last_name', 'email'],
					limit: 1,
				}),
			);

			const requester = requesterData[0];
			if (requester) {
				const bookingResponse = await $fetch('/api/scheduler/book', {
					method: 'POST',
					body: {
						hostUserId: session.user.id,
						title: `Meeting with ${requester.first_name} ${requester.last_name}`,
						meetingType: meetingRequest.meeting_type || 'consultation',
						scheduledStart: startTime.toISOString(),
						scheduledEnd: endTime.toISOString(),
						durationMinutes: meetingRequest.duration_minutes || 30,
						inviteeName: `${requester.first_name} ${requester.last_name}`,
						inviteeEmail: requester.email,
						bookingNotes: meetingRequest.notes,
					},
				});

				meeting = (bookingResponse as any).meeting;
				if (meeting) {
					updateData.linked_appointment = meeting.id;
				}
			}
		} catch (e) {
			console.error('Failed to auto-create meeting on approval:', e);
			// Still approve the request even if meeting creation fails
		}
	}

	const updated = await directus.request(
		updateItem('meeting_requests', request_id, updateData),
	);

	return { success: true, data: updated, meeting };
}

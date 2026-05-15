// server/api/scheduler/book.post.ts
import { createDirectus, rest, staticToken as staticTokenAuth, createItem, readItem, readItems, readUser, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const body = await readBody(event);

	const {
		hostUserId,
		eventTypeId,
		title,
		meetingType,
		scheduledStart,
		scheduledEnd,
		durationMinutes,
		inviteeName,
		inviteeEmail,
		inviteePhone,
		bookingNotes,
		intakeResponses,
	} = body;

	if (!hostUserId || !scheduledStart || !inviteeEmail) {
		throw createError({
			statusCode: 400,
			message: 'Missing required fields: hostUserId, scheduledStart, inviteeEmail',
		});
	}

	const serverToken = config.directusServerToken as string;
	const client = serverToken
		? createDirectus(config.public.directusUrl).with(rest()).with(staticTokenAuth(serverToken))
		: createDirectus(config.public.directusUrl).with(rest());

	try {
		// Get host user info
		const hostUser = await client.request(
			readUser(hostUserId, { fields: ['id', 'first_name', 'last_name', 'email'] })
		);

		// Get host settings
		const settings = await client.request(
			readItems('scheduler_settings', {
				fields: ['*'],
				filter: { user_id: { _eq: hostUserId } },
				limit: 1,
			})
		);
		const hostSettings = settings[0];

		// Resolve event type (also tells us which org to scope the contact lookup to).
		// Falls back to null if Stage-4 schema isn't in place yet.
		let eventType: any | null = null;
		if (eventTypeId) {
			try {
				eventType = await client.request(
					readItem('event_types', eventTypeId, {
						fields: ['id', 'title', 'slug', 'organization', 'host_user'],
					}),
				);
			} catch (e: any) {
				console.warn('[book] event_types lookup failed:', e.message);
			}
		}

		// Generate room name
		const timestamp = Date.now().toString(36);
		const randomStr = Math.random().toString(36).substring(2, 8);
		const roomName = `hue-${timestamp}-${randomStr}`;

		// Calculate times
		const startTime = new Date(scheduledStart);
		const endTime = scheduledEnd
			? new Date(scheduledEnd)
			: new Date(startTime.getTime() + (durationMinutes || 30) * 60000);

		// Create video meeting
		const meeting = await client.request(
			createItem('video_meetings', {
				room_name: roomName,
				title: title || `Meeting with ${inviteeName}`,
				description: bookingNotes,
				meeting_type: meetingType || 'consultation',
				status: 'scheduled',
				scheduled_start: startTime.toISOString(),
				scheduled_end: endTime.toISOString(),
				duration_minutes: durationMinutes || 30,
				host_user: hostUserId,
				host_identity: `${hostUser.first_name} ${hostUser.last_name}`,
				invitee_name: inviteeName,
				invitee_email: inviteeEmail,
				invitee_phone: inviteePhone || null,
				invite_method: 'email',
				booked_via: 'public',
				booking_notes: bookingNotes,
				meeting_url: `${config.public.siteUrl}/meeting/${roomName}`,
				reminder_minutes_before: hostSettings?.reminder_time || 60,
			})
		);

		// Create linked appointment (with Stage-4 event_type + intake_responses if present).
		const appointmentPayload: Record<string, any> = {
			title: title || `Meeting with ${inviteeName}`,
			description: bookingNotes,
			start_time: startTime.toISOString(),
			end_time: endTime.toISOString(),
			status: 'confirmed',
			is_video: true,
			video_meeting: meeting.id,
		};
		if (eventType?.id) appointmentPayload.event_type = eventType.id;
		if (intakeResponses && typeof intakeResponses === 'object') {
			appointmentPayload.intake_responses = intakeResponses;
		}

		const appointment = await client.request(createItem('appointments', appointmentPayload));

		// Update meeting with appointment link
		await client.request(
			updateItem('video_meetings', meeting.id, { related_appointment: appointment.id })
		);

		// Send confirmation emails
		if (hostSettings?.send_confirmations !== false) {
			try {
				await $fetch('/api/video/send-email-invite', {
					method: 'POST',
					body: {
						meetingId: meeting.id,
						roomName,
						toEmail: inviteeEmail,
						toName: inviteeName,
						scheduledStart: startTime.toISOString(),
						hostName: `${hostUser.first_name} ${hostUser.last_name}`,
						isConfirmation: true,
					},
				});
			} catch (e) {
				console.error('Failed to send invitee confirmation:', e);
			}

			try {
				await $fetch('/api/video/send-email-invite', {
					method: 'POST',
					body: {
						meetingId: meeting.id,
						roomName,
						toEmail: hostUser.email,
						toName: `${hostUser.first_name}`,
						scheduledStart: startTime.toISOString(),
						hostName: inviteeName,
						isHostNotification: true,
					},
				});
			} catch (e) {
				console.error('Failed to send host notification:', e);
			}
		}

		// Sync to calendars if enabled
		if (hostSettings?.google_calendar_enabled && hostSettings?.google_refresh_token) {
			try {
				await $fetch('/api/calendar/google/create-event', {
					method: 'POST',
					body: {
						meetingId: meeting.id,
						userId: hostUserId,
						title: title || `Meeting with ${inviteeName}`,
						description: `Video meeting: ${config.public.siteUrl}/meeting/${roomName}\n\n${bookingNotes || ''}`,
						startTime: startTime.toISOString(),
						endTime: endTime.toISOString(),
						attendeeEmail: inviteeEmail,
					},
				});
			} catch (e) {
				console.error('Failed to sync to Google Calendar:', e);
			}
		}

		if (hostSettings?.outlook_calendar_enabled && hostSettings?.outlook_refresh_token) {
			try {
				await $fetch('/api/calendar/outlook/create-event', {
					method: 'POST',
					body: {
						meetingId: meeting.id,
						userId: hostUserId,
						title: title || `Meeting with ${inviteeName}`,
						description: `Video meeting: ${config.public.siteUrl}/meeting/${roomName}\n\n${bookingNotes || ''}`,
						startTime: startTime.toISOString(),
						endTime: endTime.toISOString(),
						attendeeEmail: inviteeEmail,
					},
				});
			} catch (e) {
				console.error('Failed to sync to Outlook Calendar:', e);
			}
		}

		// Bump last_contacted_at for the invitee (and the host, if they're a
		// contact in the same org). Best-effort — never blocks the booking.
		await touchContacts([inviteeEmail], 'meeting');

		// Stage 4 wedge: if the inviteeEmail resolves to a Contact in the host's
		// org, auto-write a LeadActivity so the booking shows up in the pipeline.
		// Falls back to null org if the event type lookup failed — we still try
		// the match but won't auto-create contacts in either case.
		let contactMatched = false;
		try {
			contactMatched = await logBookingToPipeline({
				inviteeEmail,
				inviteeName,
				bookingNotes,
				intakeResponses,
				eventTypeTitle: eventType?.title || title || 'Meeting',
				scheduledStart: startTime.toISOString(),
				durationMinutes: durationMinutes || 30,
				organizationId: typeof eventType?.organization === 'string'
					? eventType.organization
					: (eventType?.organization?.id ?? null),
			});
		} catch (e: any) {
			console.warn('[book] auto-log to pipeline failed:', e.message);
		}

		return {
			success: true,
			meeting: {
				id: meeting.id,
				roomName,
				title: meeting.title,
				scheduledStart: meeting.scheduled_start,
				meetingUrl: meeting.meeting_url,
			},
			appointmentId: appointment.id,
			contactMatched,
		};
	} catch (error: any) {
		console.error('Error creating booking:', error);
		throw createError({
			statusCode: error.status || 500,
			message: error.message || 'Failed to create booking',
		});
	}
});

/**
 * Resolve the invitee's email to an existing Contact in the host's org and,
 * if found, write a LeadActivity row tying the booking to the pipeline.
 *
 * Returns true if a contact was matched + activity row written; false if no
 * matching contact (Stage-4 explicitly does NOT auto-create contacts here).
 */
async function logBookingToPipeline(opts: {
	inviteeEmail: string;
	inviteeName?: string | null;
	bookingNotes?: string | null;
	intakeResponses?: Record<string, any> | null;
	eventTypeTitle: string;
	scheduledStart: string;
	durationMinutes: number;
	organizationId: string | null;
}): Promise<boolean> {
	const admin = getTypedDirectus();
	const email = (opts.inviteeEmail || '').trim().toLowerCase();
	if (!email) return false;

	// Lookup contact by email. If we have an org, scope to it via the
	// contacts_organizations junction; otherwise match globally (best-effort).
	const filter: any = { email: { _eq: email } };
	if (opts.organizationId) {
		filter._and = [
			{ email: { _eq: email } },
			{ organizations: { organizations_id: { _eq: opts.organizationId } } },
		];
		delete filter.email;
	}

	const rows = (await admin.request(
		readItems('contacts' as any, {
			filter,
			fields: ['id', 'email', 'leads.id'],
			limit: 1,
		} as any),
	)) as Array<{ id: string; email: string; leads?: Array<{ id: number }> }>;

	const contact = rows && rows[0];
	if (!contact) return false;

	// Pick the first related lead, if any. We don't try to be clever — the host
	// can clean up the pipeline after the meeting.
	const leadId = contact.leads && contact.leads.length > 0 ? contact.leads[0]!.id : null;

	// Format the intake answers into the activity description.
	const intakeBlock = (() => {
		if (!opts.intakeResponses || typeof opts.intakeResponses !== 'object') return '';
		const entries = Object.entries(opts.intakeResponses)
			.filter(([, v]) => v !== undefined && v !== null && v !== '')
			.map(([k, v]) => `${k}: ${typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v}`);
		return entries.length > 0 ? `\n\nIntake:\n${entries.join('\n')}` : '';
	})();

	const description = `Booked via public scheduler.${opts.bookingNotes ? '\n\n' + opts.bookingNotes : ''}${intakeBlock}`;

	await admin.request(
		createItem('lead_activities' as any, {
			activity_type: 'meeting',
			activity_date: opts.scheduledStart,
			subject: `${opts.eventTypeTitle} with ${opts.inviteeName || email}`,
			description,
			duration_minutes: opts.durationMinutes,
			contact: contact.id,
			lead: leadId,
		} as any),
	);

	return true;
}

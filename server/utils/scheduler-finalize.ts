// server/utils/scheduler-finalize.ts
//
// Shared booking finalization for both free (`/api/scheduler/book`) and paid
// (`/api/scheduler/checkout-success` + `connect-webhook`) flows.
//
// Idempotency: when paymentSessionId is supplied, finalizeBooking first looks
// for an existing appointment row tagged with that id and returns it. Both the
// success-URL handler and the connect webhook can race; the loser no-ops.
import {
	createDirectus,
	rest,
	staticToken as staticTokenAuth,
	createItem,
	readItem,
	readItems,
	readUser,
	updateItem,
} from '@directus/sdk';

export interface FinalizeBookingInput {
	hostUserId: string;
	eventTypeId?: number | null;
	title?: string | null;
	meetingType?: string | null;
	scheduledStart: string;          // ISO
	scheduledEnd?: string | null;    // ISO
	durationMinutes?: number | null;
	inviteeName?: string | null;
	inviteeEmail: string;
	inviteePhone?: string | null;
	bookingNotes?: string | null;
	intakeResponses?: Record<string, any> | null;
	/** Set on the appointment row + drives idempotent reuse. */
	paymentSessionId?: string | null;
}

export interface FinalizeBookingResult {
	meeting: {
		id: string;
		roomName: string;
		title: string;
		scheduledStart: string;
		meetingUrl: string;
	};
	appointmentId: string;
	contactMatched: boolean;
	/** True when an existing row was reused (idempotent path). */
	reused: boolean;
}

export async function finalizeBooking(input: FinalizeBookingInput): Promise<FinalizeBookingResult> {
	const config = useRuntimeConfig();
	const serverToken = config.directusServerToken as string;
	const client = serverToken
		? createDirectus(config.public.directusUrl).with(rest()).with(staticTokenAuth(serverToken))
		: createDirectus(config.public.directusUrl).with(rest());

	// ── Idempotency: paid path may race the webhook + success URL ─────────────
	if (input.paymentSessionId) {
		const existing = (await client
			.request(
				readItems('appointments', {
					filter: { payment_session_id: { _eq: input.paymentSessionId } },
					fields: [
						'id',
						'title',
						'start_time',
						'video_meeting.id',
						'video_meeting.room_name',
						'video_meeting.title',
						'video_meeting.scheduled_start',
						'video_meeting.meeting_url',
					],
					limit: 1,
				}),
			)
			.catch(() => [])) as any[];

		if (existing.length > 0) {
			const a = existing[0];
			const m = a.video_meeting || {};
			return {
				meeting: {
					id: m.id || '',
					roomName: m.room_name || '',
					title: m.title || a.title || '',
					scheduledStart: m.scheduled_start || a.start_time || input.scheduledStart,
					meetingUrl: m.meeting_url || '',
				},
				appointmentId: a.id,
				contactMatched: false,
				reused: true,
			};
		}
	}

	// ── Resolve host + settings + event type ──────────────────────────────────
	const hostUser = (await client.request(
		readUser(input.hostUserId, { fields: ['id', 'first_name', 'last_name', 'email'] }),
	)) as { id: string; first_name?: string; last_name?: string; email?: string };

	const settings = (await client.request(
		readItems('scheduler_settings', {
			fields: ['*'],
			filter: { user_id: { _eq: input.hostUserId } },
			limit: 1,
		}),
	)) as any[];
	const hostSettings = settings[0];

	let eventType: any | null = null;
	if (input.eventTypeId) {
		try {
			eventType = await client.request(
				readItem('event_types', input.eventTypeId, {
					fields: ['id', 'title', 'slug', 'organization', 'host_user'],
				}),
			);
		} catch (e: any) {
			console.warn('[finalize] event_types lookup failed:', e.message);
		}
	}

	// ── Generate room + compute times ─────────────────────────────────────────
	const timestamp = Date.now().toString(36);
	const randomStr = Math.random().toString(36).substring(2, 8);
	const roomName = `hue-${timestamp}-${randomStr}`;

	const startTime = new Date(input.scheduledStart);
	const endTime = input.scheduledEnd
		? new Date(input.scheduledEnd)
		: new Date(startTime.getTime() + (input.durationMinutes || 30) * 60000);

	// ── Create video_meeting ──────────────────────────────────────────────────
	const meeting = (await client.request(
		createItem('video_meetings', {
			room_name: roomName,
			title: input.title || `Meeting with ${input.inviteeName || input.inviteeEmail}`,
			description: input.bookingNotes,
			meeting_type: input.meetingType || 'consultation',
			status: 'scheduled',
			scheduled_start: startTime.toISOString(),
			scheduled_end: endTime.toISOString(),
			duration_minutes: input.durationMinutes || 30,
			host_user: input.hostUserId,
			host_identity: `${hostUser.first_name || ''} ${hostUser.last_name || ''}`.trim(),
			invitee_name: input.inviteeName,
			invitee_email: input.inviteeEmail,
			invitee_phone: input.inviteePhone || null,
			invite_method: 'email',
			booked_via: 'public',
			booking_notes: input.bookingNotes,
			meeting_url: `${config.public.siteUrl}/meeting/${roomName}`,
			reminder_minutes_before: hostSettings?.reminder_time || 60,
		}),
	)) as { id: string };

	// ── Create appointment ────────────────────────────────────────────────────
	const appointmentPayload: Record<string, any> = {
		title: input.title || `Meeting with ${input.inviteeName || input.inviteeEmail}`,
		description: input.bookingNotes,
		start_time: startTime.toISOString(),
		end_time: endTime.toISOString(),
		status: 'confirmed',
		is_video: true,
		video_meeting: meeting.id,
	};
	if (eventType?.id) appointmentPayload.event_type = eventType.id;
	if (input.intakeResponses && typeof input.intakeResponses === 'object') {
		appointmentPayload.intake_responses = input.intakeResponses;
	}
	if (input.paymentSessionId) {
		appointmentPayload.payment_session_id = input.paymentSessionId;
	}

	const appointment = (await client.request(createItem('appointments', appointmentPayload))) as { id: string };

	await client.request(
		updateItem('video_meetings', meeting.id, { related_appointment: appointment.id }),
	);

	// ── Confirmation emails ───────────────────────────────────────────────────
	if (hostSettings?.send_confirmations !== false) {
		try {
			await $fetch('/api/video/send-email-invite', {
				method: 'POST',
				body: {
					meetingId: meeting.id,
					roomName,
					toEmail: input.inviteeEmail,
					toName: input.inviteeName,
					scheduledStart: startTime.toISOString(),
					hostName: `${hostUser.first_name || ''} ${hostUser.last_name || ''}`.trim(),
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
					toName: hostUser.first_name,
					scheduledStart: startTime.toISOString(),
					hostName: input.inviteeName,
					isHostNotification: true,
				},
			});
		} catch (e) {
			console.error('Failed to send host notification:', e);
		}
	}

	// ── Calendar sync (best-effort) ───────────────────────────────────────────
	if (hostSettings?.google_calendar_enabled && hostSettings?.google_refresh_token) {
		try {
			await $fetch('/api/calendar/google/create-event', {
				method: 'POST',
				body: {
					meetingId: meeting.id,
					userId: input.hostUserId,
					title: input.title || `Meeting with ${input.inviteeName || input.inviteeEmail}`,
					description: `Video meeting: ${config.public.siteUrl}/meeting/${roomName}\n\n${input.bookingNotes || ''}`,
					startTime: startTime.toISOString(),
					endTime: endTime.toISOString(),
					attendeeEmail: input.inviteeEmail,
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
					userId: input.hostUserId,
					title: input.title || `Meeting with ${input.inviteeName || input.inviteeEmail}`,
					description: `Video meeting: ${config.public.siteUrl}/meeting/${roomName}\n\n${input.bookingNotes || ''}`,
					startTime: startTime.toISOString(),
					endTime: endTime.toISOString(),
					attendeeEmail: input.inviteeEmail,
				},
			});
		} catch (e) {
			console.error('Failed to sync to Outlook Calendar:', e);
		}
	}

	// ── Touch contacts + log to pipeline ──────────────────────────────────────
	const finalizeOrgId =
		typeof eventType?.organization === 'string'
			? eventType.organization
			: (eventType?.organization?.id ?? null);
	try {
		// Scope the touch update to the booking's org so identical emails
		// across tenants don't all get bumped from one public booking.
		await touchContacts([input.inviteeEmail], 'meeting', finalizeOrgId);
	} catch (e) {
		console.warn('[finalize] touchContacts failed:', e);
	}

	let contactMatched = false;
	try {
		contactMatched = await logBookingToPipeline({
			inviteeEmail: input.inviteeEmail,
			inviteeName: input.inviteeName,
			bookingNotes: input.bookingNotes,
			intakeResponses: input.intakeResponses,
			eventTypeTitle: eventType?.title || input.title || 'Meeting',
			scheduledStart: startTime.toISOString(),
			durationMinutes: input.durationMinutes || 30,
			organizationId: finalizeOrgId,
		});
	} catch (e: any) {
		console.warn('[finalize] auto-log to pipeline failed:', e.message);
	}

	return {
		meeting: {
			id: meeting.id,
			roomName,
			title: appointmentPayload.title,
			scheduledStart: startTime.toISOString(),
			meetingUrl: `${config.public.siteUrl}/meeting/${roomName}`,
		},
		appointmentId: appointment.id,
		contactMatched,
		reused: false,
	};
}

/**
 * Resolve invitee email to an existing Contact in the host's org and write a
 * LeadActivity row. Does NOT auto-create contacts (Stage-4 explicit decision).
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

	const leadId = contact.leads && contact.leads.length > 0 ? contact.leads[0]!.id : null;

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

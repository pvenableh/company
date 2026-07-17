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
	let bookingHostId = input.hostUserId;

	let eventType: any | null = null;
	if (input.eventTypeId) {
		try {
			eventType = await client.request(
				readItem('event_types', input.eventTypeId, {
					fields: ['id', 'title', 'slug', 'organization', 'host_user', 'scheduling_type'],
				}),
			);
		} catch (e: any) {
			console.warn('[finalize] event_types lookup failed:', e.message);
		}
	}

	// Round-robin: re-resolve the actual host at booking time (a free pooled host,
	// least-loaded first). Closes the gap between slot-listing and submit. Falls
	// back to the requested host if none of the pool is free.
	if (eventType && eventType.scheduling_type === 'round_robin') {
		const startForRr = new Date(input.scheduledStart);
		const endForRr = input.scheduledEnd
			? new Date(input.scheduledEnd)
			: new Date(startForRr.getTime() + (input.durationMinutes || 30) * 60000);
		const picked = await resolveRoundRobinHost(client, eventType, startForRr, endForRr);
		if (picked) bookingHostId = picked;
		else console.warn('[finalize] round-robin: no pooled host free; using requested host', input.hostUserId);
	}

	const hostUser = (await client.request(
		readUser(bookingHostId, { fields: ['id', 'first_name', 'last_name', 'email'] }),
	)) as { id: string; first_name?: string; last_name?: string; email?: string };

	const settings = (await client.request(
		readItems('scheduler_settings', {
			fields: ['*'],
			filter: { user_id: { _eq: bookingHostId } },
			limit: 1,
		}),
	)) as any[];
	const hostSettings = settings[0];

	// ── Generate room + compute times ─────────────────────────────────────────
	const timestamp = Date.now().toString(36);
	const randomStr = Math.random().toString(36).substring(2, 8);
	const roomName = `hue-${timestamp}-${randomStr}`;

	const startTime = new Date(input.scheduledStart);
	const endTime = input.scheduledEnd
		? new Date(input.scheduledEnd)
		: new Date(startTime.getTime() + (input.durationMinutes || 30) * 60000);

	// ── Double-book guard (Phase 2, log-only) ─────────────────────────────────
	// Re-check the slot against internal + external busy right before writing, to
	// close the window where the client computed slots against stale data. Shipped
	// LOG-ONLY first: we log a "would-reject" so we can confirm the engine agrees
	// with reality before it can block a real booking. Flip ENFORCE to enable 409s.
	// NB: the idempotent-reuse path already returned above, so this only runs for
	// genuinely new bookings — but enforcement should still be gated to the
	// interactive (free/direct) path, not payment webhooks, when turned on.
	const ENFORCE_DOUBLE_BOOK_GUARD = false;
	try {
		const conflict = await hasSlotConflict(client, bookingHostId, startTime, endTime, hostSettings);
		if (conflict) {
			if (ENFORCE_DOUBLE_BOOK_GUARD) {
				throw createError({ statusCode: 409, message: 'That time was just taken. Please choose another slot.' });
			}
			console.warn(
				`[finalize] DOUBLE-BOOK GUARD (log-only): ${startTime.toISOString()} for host ${input.hostUserId} ` +
					`conflicts with an existing internal/external event. Would have returned 409.`,
			);
		}
	} catch (e: any) {
		if (e?.statusCode === 409) throw e;
		console.warn('[finalize] conflict check failed (continuing):', e?.message);
	}

	// ── Provision the Daily room at booking time (was lazy) ───────────────────
	// The room name is freshly random so this won't collide. Non-fatal: if Daily
	// is down we fall back to lazy provisioning at join time.
	let dailyRoomId: string | null = null;
	try {
		const room = await createDailyRoom({
			name: roomName,
			expiresAt: new Date(endTime.getTime() + 60 * 60 * 1000),
			enableTranscription: true,
		});
		dailyRoomId = room?.id || null;
	} catch (e: any) {
		console.warn('[finalize] Daily room provisioning failed (lazy fallback at join):', e?.message);
	}

	// ── Create video_meeting ──────────────────────────────────────────────────
	const meeting = (await client.request(
		createItem('video_meetings', {
			room_name: roomName,
			room_sid: dailyRoomId,
			title: input.title || `Meeting with ${input.inviteeName || input.inviteeEmail}`,
			description: input.bookingNotes,
			meeting_type: input.meetingType || 'consultation',
			status: 'scheduled',
			scheduled_start: startTime.toISOString(),
			scheduled_end: endTime.toISOString(),
			duration_minutes: input.durationMinutes || 30,
			host_user: bookingHostId,
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
					userId: bookingHostId,
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
					userId: bookingHostId,
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
	let resolvedClientId: string | null = null;
	try {
		const pipe = await logBookingToPipeline({
			inviteeEmail: input.inviteeEmail,
			inviteeName: input.inviteeName,
			bookingNotes: input.bookingNotes,
			intakeResponses: input.intakeResponses,
			eventTypeTitle: eventType?.title || input.title || 'Meeting',
			scheduledStart: startTime.toISOString(),
			durationMinutes: input.durationMinutes || 30,
			organizationId: finalizeOrgId,
		});
		contactMatched = pipe.matched;
		resolvedClientId = pipe.clientId;
	} catch (e: any) {
		console.warn('[finalize] auto-log to pipeline failed:', e.message);
	}

	// ── Cross-app wiring (Phase 2): make the booking visible across Earnest ────
	// Staff bell/email for the host. Actor is the external invitee (no directus
	// user), so userId='' means the host is NOT filtered out of recipients.
	try {
		await notifyEvent({
			collection: 'video_meetings',
			action: 'create',
			itemId: meeting.id,
			item: {
				host_user: bookingHostId,
				title: appointmentPayload.title,
				invitee_name: input.inviteeName,
				invitee_email: input.inviteeEmail,
			},
			userId: '',
			orgId: finalizeOrgId,
			staffOnly: true,
			actorName: input.inviteeName || input.inviteeEmail,
		});
	} catch (e: any) {
		console.warn('[finalize] notifyEvent failed (non-fatal):', e?.message);
	}

	// Client CRM timeline — only when the invitee maps to a client company.
	if (resolvedClientId) {
		void writeClientTimeline({
			organizationId: finalizeOrgId,
			clientId: resolvedClientId,
			verb: 'meeting.booked',
			title: `${eventType?.title || input.title || 'Meeting'} booked`,
			subtitle: `${input.inviteeName || input.inviteeEmail} · ${startTime.toISOString()}`,
			actorType: 'client',
			actorName: input.inviteeName || input.inviteeEmail,
			sourceCollection: 'video_meetings',
			sourceId: meeting.id,
			href: `/meetings/${meeting.id}`,
			icon: 'calendar-check',
		});
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
}): Promise<{ matched: boolean; clientId: string | null }> {
	const admin = getTypedDirectus();
	const email = (opts.inviteeEmail || '').trim().toLowerCase();
	if (!email) return { matched: false, clientId: null };

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
			fields: ['id', 'email', 'client', 'leads.id'],
			limit: 1,
		} as any),
	)) as Array<{ id: string; email: string; client?: string | { id: string } | null; leads?: Array<{ id: number }> }>;

	const contact = rows && rows[0];
	if (!contact) return { matched: false, clientId: null };

	const clientId = contact.client
		? typeof contact.client === 'object'
			? contact.client.id
			: contact.client
		: null;
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

	return { matched: true, clientId };
}

/**
 * Round-robin host selection at booking time. Returns the pooled host who is
 * free for [start,end], least-loaded first (fewest upcoming meetings), or null
 * if the pool is empty or nobody is free.
 */
async function resolveRoundRobinHost(
	client: any,
	eventType: any,
	start: Date,
	end: Date,
): Promise<string | null> {
	// Query the pool directly (the `hosts` o2m alias may not be registered).
	const poolRows = (await client.request(
		(readItems as any)('event_type_hosts', {
			fields: ['host_user', 'enabled'],
			filter: { event_type: { _eq: eventType.id }, enabled: { _eq: true } },
		}),
	).catch(() => [])) as any[];
	const pool: string[] = poolRows
		.map((h: any) => (typeof h.host_user === 'object' ? h.host_user?.id : h.host_user))
		.filter(Boolean);
	if (!pool.length) return null;

	const free: string[] = [];
	for (const hid of pool) {
		const s = ((await client.request(
			(readItems as any)('scheduler_settings', { fields: ['buffer_before', 'buffer_after'], filter: { user_id: { _eq: hid } }, limit: 1 }),
		)) as any[])[0] || {};
		const conflict = await hasSlotConflict(client, hid, start, end, s);
		if (!conflict) free.push(hid);
	}
	if (!free.length) return null;

	const counts: Record<string, number> = {};
	for (const hid of free) {
		const rows = (await client.request(
			(readItems as any)('video_meetings', {
				fields: ['id'],
				filter: { _and: [{ host_user: { _eq: hid } }, { status: { _in: ['scheduled', 'in_progress'] } }, { scheduled_start: { _gte: new Date().toISOString() } }] },
				limit: 300,
			}),
		)) as any[];
		counts[hid] = rows.length;
	}
	free.sort((a, b) => (counts[a]! - counts[b]!) || a.localeCompare(b));
	return free[0]!;
}

/**
 * Booking-time double-book guard. Returns true if [start,end] collides with the
 * host's internal (video_meetings + appointments) or external (Google/Outlook)
 * busy, with the host's buffers applied. Best-effort: any lookup error is logged
 * and treated as "no conflict" so a transient failure can't block bookings.
 */
async function hasSlotConflict(
	client: any,
	hostUserId: string,
	start: Date,
	end: Date,
	hostSettings: any,
): Promise<boolean> {
	const bufferBefore = Number(hostSettings?.buffer_before) || 0;
	const bufferAfter = Number(hostSettings?.buffer_after) || 0;
	const pad = 2 * 60 * 60 * 1000; // widen the fetch window for buffer math
	const from = new Date(start.getTime() - pad);
	const to = new Date(end.getTime() + pad);

	const busy: Array<{ start: Date; end: Date }> = [];

	const meetings = (await client.request(
		(readItems as any)('video_meetings', {
			fields: ['scheduled_start', 'scheduled_end', 'duration_minutes'],
			filter: {
				_and: [
					{ host_user: { _eq: hostUserId } },
					{ status: { _in: ['scheduled', 'in_progress'] } },
					{ scheduled_start: { _gte: from.toISOString() } },
					{ scheduled_start: { _lte: to.toISOString() } },
				],
			},
		}),
	)) as any[];
	for (const m of meetings) {
		if (!m.scheduled_start) continue;
		const s = new Date(m.scheduled_start);
		const e = m.scheduled_end ? new Date(m.scheduled_end) : new Date(s.getTime() + (Number(m.duration_minutes) || 30) * 60000);
		busy.push({ start: s, end: e });
	}

	const appts = (await client.request(
		(readItems as any)('appointments', {
			fields: ['start_time', 'end_time'],
			filter: {
				_and: [
					{ user_created: { _eq: hostUserId } },
					{ status: { _neq: 'canceled' } },
					{ start_time: { _gte: from.toISOString() } },
					{ start_time: { _lte: to.toISOString() } },
				],
			},
		}),
	)) as any[];
	for (const a of appts) {
		if (!a.start_time) continue;
		busy.push({ start: new Date(a.start_time), end: a.end_time ? new Date(a.end_time) : end });
	}

	try {
		const external = await getBusyForHosts([hostUserId], from, to);
		busy.push(...(external[hostUserId] || []));
	} catch {
		// fail-open on external provider
	}

	return !isIntervalFree(start, end, busy, bufferBefore, bufferAfter);
}

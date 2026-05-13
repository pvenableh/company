// PATCH /api/video/meetings/:id
// Edit a scheduled video meeting in place. Updates the `video_meetings` row,
// the linked `appointments` row (so the calendar reflects the change), and —
// when waiting-room or timing changes — also patches the underlying Daily
// room so the live experience stays in sync with what the host scheduled.
//
// Auth: host (or anyone in the meeting's owning org) via requireMeetingAccess.
// Plan gate: turning recording/transcription ON re-asserts the org plan, the
// same way create-room does. Toggling OFF is unrestricted.

import { createItem, deleteItems, readItem, readItems, updateItem } from '@directus/sdk';
import { requireMeetingAccess } from '~~/server/utils/meeting-perms';
import { updateDailyRoom } from '~~/server/utils/daily';

interface Body {
	title?: string;
	description?: string | null;
	meeting_type?: string;
	scheduled_start?: string;
	duration?: number;
	related_lead?: number | string | null;
	project?: string | null;
	project_event?: string | null;
	client?: string | null;
	waiting_room_enabled?: boolean;
	recording_enabled?: boolean;
	transcription_enabled?: boolean;
	/** Full replacement set of teammate Directus user IDs. Omit to leave members untouched. */
	members?: string[];
	/** Full replacement set of picker-added contacts. Omit to leave contacts untouched. */
	contacts?: Array<{ contact_id: string; name?: string; email?: string; phone?: string; invite_method?: 'email' | 'sms' | 'both' | 'none' }>;
	/** Full replacement set of manually-typed external guests. Omit to leave guests untouched. */
	attendees?: Array<{ name?: string; email?: string; phone?: string; invite_method?: 'email' | 'sms' | 'both' | 'none' }>;
}

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

	const body = await readBody<Body>(event);
	if (!body || typeof body !== 'object') {
		throw createError({ statusCode: 400, message: 'Body is required' });
	}

	const directus = getTypedDirectus();

	// Pull the current row — we need room_name + waiting_room_enabled +
	// scheduled times to decide which Daily-side updates to push.
	const current = await directus.request(
		readItem('video_meetings', meetingId, {
			fields: [
				'id',
				'title',
				'room_name',
				'meeting_url',
				'scheduled_start',
				'scheduled_end',
				'duration_minutes',
				'waiting_room_enabled',
				'recording_enabled',
				'transcription_enabled',
				'related_appointment',
			] as any,
		}),
	) as any;

	// Plan-gate any feature being flipped ON. Already-on flags pass through.
	if (organizationId) {
		const defaults = await fetchOrgMeetingDefaults(organizationId);
		if (body.recording_enabled === true && !current.recording_enabled) {
			assertFeatureAllowed(defaults, 'recording', true);
		}
		if (body.transcription_enabled === true && !current.transcription_enabled) {
			assertFeatureAllowed(defaults, 'transcription', true);
		}
	}

	// Resolve effective timing for both the row and the Daily room update.
	const nextStart = body.scheduled_start
		? new Date(body.scheduled_start)
		: new Date(current.scheduled_start);
	if (isNaN(nextStart.getTime())) {
		throw createError({ statusCode: 400, message: 'Invalid scheduled_start' });
	}
	const nextDuration = typeof body.duration === 'number' && body.duration > 0
		? body.duration
		: (current.duration_minutes || 30);
	const nextEnd = new Date(nextStart.getTime() + nextDuration * 60 * 1000);

	const timingChanged =
		!!body.scheduled_start && new Date(current.scheduled_start).getTime() !== nextStart.getTime()
		|| (typeof body.duration === 'number' && body.duration !== current.duration_minutes);

	const nextWaitingRoom = typeof body.waiting_room_enabled === 'boolean'
		? body.waiting_room_enabled
		: !!current.waiting_room_enabled;
	const waitingRoomChanged = typeof body.waiting_room_enabled === 'boolean'
		&& body.waiting_room_enabled !== !!current.waiting_room_enabled;

	// ── Build the video_meetings patch ──
	const meetingPatch: Record<string, any> = {};
	if (typeof body.title === 'string') meetingPatch.title = body.title;
	if ('description' in body) meetingPatch.description = body.description ?? null;
	if (typeof body.meeting_type === 'string') meetingPatch.meeting_type = body.meeting_type;
	if (body.scheduled_start) {
		meetingPatch.scheduled_start = nextStart.toISOString();
		meetingPatch.scheduled_end = nextEnd.toISOString();
	} else if (typeof body.duration === 'number') {
		meetingPatch.scheduled_end = nextEnd.toISOString();
	}
	if (typeof body.duration === 'number') meetingPatch.duration_minutes = nextDuration;
	if ('related_lead' in body) meetingPatch.related_lead = body.related_lead ?? null;
	if ('project' in body) meetingPatch.project = body.project ?? null;
	if ('project_event' in body) meetingPatch.project_event = body.project_event ?? null;

	// Keep `client` in sync with the project. Explicit body.client always wins.
	// When the project changes and the caller didn't send `client`, re-resolve
	// from the new project. A cleared project leaves the existing client alone
	// (unless the caller explicitly nulls it) — manual edits are still possible.
	if ('client' in body) {
		meetingPatch.client = body.client ?? null;
	} else if ('project' in body && body.project) {
		try {
			const proj = (await directus.request(
				readItem('projects', body.project, { fields: ['client'] as any }),
			)) as any;
			const projClient = typeof proj?.client === 'object' ? proj.client?.id : proj?.client;
			if (projClient) meetingPatch.client = projClient;
		} catch (err) {
			console.warn('[meetings.patch] failed to resolve project client:', err);
		}
	}
	if (typeof body.waiting_room_enabled === 'boolean') meetingPatch.waiting_room_enabled = body.waiting_room_enabled;
	if (typeof body.recording_enabled === 'boolean') meetingPatch.recording_enabled = body.recording_enabled;
	if (typeof body.transcription_enabled === 'boolean') meetingPatch.transcription_enabled = body.transcription_enabled;

	if (Object.keys(meetingPatch).length > 0) {
		await directus.request(updateItem('video_meetings', meetingId, meetingPatch as any));
	}

	// ── Mirror the relevant pieces onto the linked appointment ──
	const appointmentPatch: Record<string, any> = {};
	if (typeof body.title === 'string') appointmentPatch.title = body.title;
	if ('description' in body) appointmentPatch.description = body.description ?? null;
	if (body.scheduled_start || typeof body.duration === 'number') {
		appointmentPatch.start_time = nextStart.toISOString();
		appointmentPatch.end_time = nextEnd.toISOString();
	}
	if ('related_lead' in body) appointmentPatch.related_lead = body.related_lead ?? null;

	if (current.related_appointment && Object.keys(appointmentPatch).length > 0) {
		try {
			await directus.request(
				updateItem('appointments', current.related_appointment, appointmentPatch as any),
			);
		} catch (err) {
			console.error('[meetings.patch] failed to mirror appointment update:', err);
		}
	}

	// ── Member diff + notifications ──
	// `members` is a full replacement set when present. We diff against the
	// current appointments_directus_users rows for the linked appointment,
	// apply the delta, and fan out invited/removed notifications. Time changes
	// also notify members who remain on the meeting.
	const appointmentId = current.related_appointment as string | null;
	let addedMemberIds: string[] = [];
	let removedMemberIds: string[] = [];
	let remainingMemberIds: string[] = [];

	if (appointmentId && Array.isArray(body.members)) {
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

			// Apply additions
			for (const memberId of addedMemberIds) {
				try {
					await directus.request(
						createItem('appointments_directus_users', {
							appointments_id: appointmentId,
							directus_users_id: memberId,
						} as any),
					);
				} catch (err) {
					console.error('[meetings.patch] failed to link member:', memberId, err);
				}
			}

			// Apply removals
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
					console.error('[meetings.patch] failed to remove member junction rows:', err);
				}
			}
		} catch (err) {
			console.error('[meetings.patch] member diff failed:', err);
		}
	} else if (appointmentId) {
		// Members not in body — pull current set so a time-change notification
		// can still reach everyone who's already linked.
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
			console.error('[meetings.patch] failed to read existing members for notify:', err);
		}
	}

	const meetingRef = {
		id: meetingId,
		title: (meetingPatch.title as string) || current.title || 'Meeting',
		meeting_url: (current.meeting_url as string | null) || null,
		scheduled_start: nextStart.toISOString(),
		duration_minutes: nextDuration,
		orgId: organizationId || null,
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
			console.error('[meetings.patch] notify(invited) failed:', err);
		}
	}

	if (removedMemberIds.length > 0) {
		try {
			await notifyMeetingChange({
				event: { kind: 'removed' },
				meeting: {
					...meetingRef,
					scheduled_start: new Date(current.scheduled_start).toISOString(),
				},
				recipientIds: removedMemberIds,
				hostId,
				hostName,
			});
		} catch (err) {
			console.error('[meetings.patch] notify(removed) failed:', err);
		}
	}

	// Notify still-linked members of date/time shifts. Skip title/description
	// changes — per spec we only notify on schedule changes.
	if (timingChanged && remainingMemberIds.length > 0) {
		try {
			await notifyMeetingChange({
				event: { kind: 'time_changed', previousStart: new Date(current.scheduled_start) },
				meeting: meetingRef,
				recipientIds: remainingMemberIds,
				hostId,
				hostName,
			});
		} catch (err) {
			console.error('[meetings.patch] notify(time_changed) failed:', err);
		}
	}

	// ── Attendee diff (contacts + manual guests) ──
	// `contacts` and `attendees` are both full replacement sets when present.
	// We diff against the meeting's current video_meeting_attendees rows and
	// apply create/delete deltas. `attendee_type: 'user'` rows (teammates) are
	// left alone — those ride on appointments_directus_users.
	if (Array.isArray(body.contacts) || Array.isArray(body.attendees)) {
		try {
			const existing = (await directus.request(
				readItems('video_meeting_attendees', {
					filter: { video_meeting: { _eq: meetingId } } as any,
					fields: ['id', 'attendee_type', 'contact', 'guest_email', 'guest_name'] as any,
					limit: -1,
				}),
			)) as any[];

			const desiredContacts = Array.isArray(body.contacts) ? body.contacts.filter(c => c?.contact_id) : null;
			const desiredGuests = Array.isArray(body.attendees) ? body.attendees.filter(a => a?.name || a?.email) : null;

			// Contact diff — only run when body.contacts is present.
			if (desiredContacts) {
				const desiredIds = new Set(desiredContacts.map(c => c.contact_id));
				const existingContactRows = existing.filter(r => r.attendee_type === 'guest' && r.contact);
				const existingContactIds = new Set(
					existingContactRows.map(r => (typeof r.contact === 'object' ? r.contact?.id : r.contact)).filter(Boolean),
				);

				// Add new contacts
				for (const c of desiredContacts) {
					if (existingContactIds.has(c.contact_id)) continue;
					try {
						await directus.request(
							createItem('video_meeting_attendees', {
								video_meeting: meetingId,
								attendee_type: 'guest',
								contact: c.contact_id,
								guest_name: c.name || null,
								guest_email: c.email || null,
								guest_phone: c.phone || null,
								invite_method: c.invite_method || (c.email ? 'email' : 'none'),
								status: 'invited',
							} as any),
						);
					} catch (err) {
						console.error('[meetings.patch] failed to add contact attendee:', c.contact_id, err);
					}
				}

				// Remove contact rows that are no longer in the set
				const removalRowIds = existingContactRows
					.filter(r => {
						const cid = typeof r.contact === 'object' ? r.contact?.id : r.contact;
						return cid && !desiredIds.has(cid);
					})
					.map(r => r.id);
				if (removalRowIds.length > 0) {
					try {
						await directus.request(deleteItems('video_meeting_attendees', removalRowIds));
					} catch (err) {
						console.error('[meetings.patch] failed to remove contact attendee rows:', err);
					}
				}
			}

			// Manual-guest diff — only run when body.attendees is present.
			// Matches by lowercased email; rows missing email fall back to name.
			if (desiredGuests) {
				const keyOf = (e?: string | null, n?: string | null) => `${(e || '').toLowerCase()}|${(n || '').toLowerCase()}`;
				const desiredKeys = new Set(desiredGuests.map(g => keyOf(g.email, g.name)));
				const existingGuestRows = existing.filter(r => r.attendee_type === 'guest' && !r.contact);
				const existingKeys = new Set(existingGuestRows.map(r => keyOf(r.guest_email, r.guest_name)));

				for (const g of desiredGuests) {
					if (existingKeys.has(keyOf(g.email, g.name))) continue;
					try {
						await directus.request(
							createItem('video_meeting_attendees', {
								video_meeting: meetingId,
								attendee_type: 'guest',
								guest_name: g.name || null,
								guest_email: g.email || null,
								guest_phone: g.phone || null,
								invite_method: g.invite_method || 'none',
								status: 'invited',
							} as any),
						);
					} catch (err) {
						console.error('[meetings.patch] failed to add guest attendee:', g.email, err);
					}
				}

				const removalRowIds = existingGuestRows
					.filter(r => !desiredKeys.has(keyOf(r.guest_email, r.guest_name)))
					.map(r => r.id);
				if (removalRowIds.length > 0) {
					try {
						await directus.request(deleteItems('video_meeting_attendees', removalRowIds));
					} catch (err) {
						console.error('[meetings.patch] failed to remove guest attendee rows:', err);
					}
				}
			}
		} catch (err) {
			console.error('[meetings.patch] attendee diff failed:', err);
		}
	}

	// ── Push waiting-room + expiry changes to the live Daily room ──
	if (current.room_name && (waitingRoomChanged || timingChanged)) {
		const dailyProps: Record<string, any> = {};
		if (waitingRoomChanged) {
			dailyProps.enable_knocking = nextWaitingRoom;
			dailyProps.enable_prejoin_ui = nextWaitingRoom;
		}
		if (timingChanged) {
			// Match create-room's 1hr post-meeting buffer so the room stays open
			// for late-runs and the recap/recording flow.
			dailyProps.exp = Math.floor((nextEnd.getTime() + 60 * 60 * 1000) / 1000);
		}
		try {
			await updateDailyRoom(current.room_name, dailyProps);
		} catch (err) {
			// Don't fail the whole edit if Daily is flaky — the DB row is already
			// updated, and a stale waiting-room flag in the room only matters
			// once the meeting actually starts.
			console.warn('[meetings.patch] daily-side update failed:', err);
		}
	}

	return { success: true, data: { id: meetingId } };
});

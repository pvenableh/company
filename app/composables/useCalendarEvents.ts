/**
 * useCalendarEvents - Unified calendar event stream
 *
 * Merges appointments, video meetings, and lead follow-ups
 * into a single CalendarEvent[] for the scheduler CRM hub.
 */

import type { LeadStage } from '~~/shared/leads';

export interface CalendarEvent {
	id: string;
	type: 'appointment' | 'video_meeting' | 'follow_up' | 'external';
	title: string;
	start_time: string;
	end_time?: string | null;
	is_video: boolean;
	meeting_link?: string | null;
	room_name?: string | null;
	lead?: { id: number | string; stage: LeadStage; contact_name: string } | null;
	contact?: { id: string; name: string } | null;
	status: string;
	description?: string | null;
	invitee_name?: string | null;
	invitee_email?: string | null;
	invitee_phone?: string | null;
	meeting_type?: string | null;
	duration_minutes?: number | null;
	// Video-meeting extras surfaced to the day-timeline cards.
	video_meeting_id?: string | null;
	meeting_status?: string | null;
	recording_enabled?: boolean;
	transcription_enabled?: boolean;
	waiting_room_enabled?: boolean;
	host_name?: string | null;
	attendee_count?: number;
	// Compact roster surfaced to the row-action popover so it can render
	// "Members" without a second fetch. Host first, then internal attendees
	// (org teammates), then the external invitee.
	members?: Array<{ name: string; role: 'host' | 'attendee' | 'invitee'; email?: string | null }>;
	// Resolved client from the linked video_meeting (auto-filled from
	// project.client server-side). Used by the contact picker to rank the
	// meeting's-client contacts to the top.
	client_id?: string | null;
	client_name?: string | null;
	// Org-wide event view: surface who created the appointment so the UI can
	// flag teammates' events with a host-keyed accent color. `is_mine` is the
	// quick check for "Mine only" filtering and for skipping the accent stripe
	// on the current user's own events.
	creator_id?: string | null;
	creator_name?: string | null;
	creator_avatar?: string | null;
	is_mine?: boolean;
	// External-calendar overlay (type='external'): events read back from a
	// connected Google/Outlook calendar the host flagged `show_on_calendar`.
	// `external_color` is the connection's own colour (drives the chip stripe +
	// tint); `external_calendar_name` labels the source calendar in the tooltip.
	external_color?: string | null;
	external_calendar_name?: string | null;
	external_link?: string | null;
	source_record: any;
}

import { TAG_RAMP_LENGTH } from '~/composables/useAppAccent';

/**
 * Deterministic palette-coherent color from a string id. Used to color-key
 * a host across the calendar + day-timeline.
 *
 * Identity contract: same `id` → same `--tag-N` slot, every render. The
 * actual hue at that slot is palette-driven (`applyPaletteToDocument`),
 * so a busy calendar day reads as 5–8 cool aquas on Sea Mist, 5–8 neon
 * sapphires on Aurora, 5–8 monochromatic blues on Neutral — coherent
 * with the rest of the app's chrome, not a clown palette.
 *
 * Trade-off vs the previous 360-hue hash: collisions are higher (1/8
 * within a slot vs 1/360 within a hue). Fine for the typical 1–5 hosts
 * visible at once; bump `TAG_RAMP_LENGTH` if collisions become a problem
 * (lockstep with the safelist + themes.css defaults + tailwind.css).
 */
export function hostAccentColor(id: string | null | undefined): string {
	if (!id) return 'hsl(var(--muted-foreground))';
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
	}
	const slot = (hash % TAG_RAMP_LENGTH) + 1;
	return `hsl(var(--tag-${slot}))`;
}

export function useCalendarEvents() {
	const { user } = useDirectusAuth();
	const { selectedOrg } = useOrganization();
	const { filteredUsers, fetchFilteredUsers } = useFilteredUsers();

	// Build the realtime appointments filter. The base clause is "events I
	// created or attend"; the optional third clause widens to "anything created
	// by an org-mate" once we've resolved the org's user list. We rebuild + push
	// via `updateFilter` whenever the org changes or its member set lands.
	const buildAppointmentFilter = (uid: string | undefined, orgUserIds: string[]) => {
		const clauses: any[] = [
			{ user_created: { id: { _eq: uid } } },
			{ attendees: { directus_users_id: { _eq: uid } } },
		];
		if (orgUserIds.length > 0) {
			clauses.push({ user_created: { id: { _in: orgUserIds } } });
		}
		return { _or: clauses };
	};

	// ── Appointments (realtime) ──
	const {
		data: realtimeAppointments,
		refresh: refreshAppointments,
		updateFilter: updateAppointmentFilter,
	} = useRealtimeSubscription(
		'appointments',
		[
			'id', 'title', 'description', 'start_time', 'end_time', 'status',
			'is_video', 'meeting_link', 'room_name',
			'video_meeting.id', 'video_meeting.room_name', 'video_meeting.title',
			'video_meeting.description', 'video_meeting.meeting_type',
			'video_meeting.duration_minutes', 'video_meeting.scheduled_start',
			'video_meeting.scheduled_end', 'video_meeting.status',
			'video_meeting.host_identity', 'video_meeting.host_user',
			'video_meeting.recording_enabled', 'video_meeting.transcription_enabled',
			'video_meeting.waiting_room_enabled',
			'video_meeting.invitee_name', 'video_meeting.invitee_email', 'video_meeting.invitee_phone',
			// Rich attendees from `video_meeting_attendees` — the contact picker
			// and the manual-guest cards write here, NOT to the legacy
			// invitee_name/email scalars. Without this join the popover roster
			// only shows the first manual guest, which is why "two people" on
			// a picked-contact meeting was reading as "1 person".
			'video_meeting.attendees.id',
			'video_meeting.attendees.attendee_type',
			'video_meeting.attendees.guest_name',
			'video_meeting.attendees.guest_email',
			'video_meeting.attendees.directus_user.id',
			'video_meeting.attendees.directus_user.first_name',
			'video_meeting.attendees.directus_user.last_name',
			'video_meeting.attendees.directus_user.email',
			'video_meeting.attendees.contact.id',
			'video_meeting.attendees.contact.first_name',
			'video_meeting.attendees.contact.last_name',
			'video_meeting.attendees.contact.email',
			'video_meeting.client.id', 'video_meeting.client.name',
			'video_meeting.project.id', 'video_meeting.project.title',
			'video_meeting.project.client.id', 'video_meeting.project.client.name',
			'video_meeting.related_lead.id', 'video_meeting.related_lead.stage',
			'video_meeting.related_lead.related_contact.first_name',
			'video_meeting.related_lead.related_contact.last_name',
			'video_meeting.related_lead.related_contact.email',
			'related_lead.id', 'related_lead.stage',
			'related_lead.related_contact.first_name', 'related_lead.related_contact.last_name',
			'attendees.id',
			'attendees.directus_users_id.id',
			'attendees.directus_users_id.first_name',
			'attendees.directus_users_id.last_name',
			'user_created.*',
		],
		buildAppointmentFilter(user.value?.id, []),
	);

	// Org-member lookup, indexed for fast creator hydration. `fetchFilteredUsers`
	// is the same source the meeting modal already uses, so the user list stays
	// consistent across the scheduler.
	const orgUserMap = computed<Record<string, { id: string; name: string; avatar: string | null }>>(() => {
		const map: Record<string, { id: string; name: string; avatar: string | null }> = {};
		for (const u of filteredUsers.value || []) {
			const name = `${(u as any).first_name || ''} ${(u as any).last_name || ''}`.trim()
				|| (u as any).email
				|| 'Teammate';
			map[u.id] = { id: u.id, name, avatar: (u as any).avatar || null };
		}
		return map;
	});

	const refreshOrgUsers = async () => {
		if (!selectedOrg.value) return;
		await fetchFilteredUsers(selectedOrg.value);
	};

	// Initial pull on mount.
	onMounted(() => {
		refreshOrgUsers();
	});

	// Re-pull when the active org switches, and push the new member list into
	// the appointments filter (only after the org users have actually loaded —
	// pushing an empty `_in: []` would match nothing and hide the new clause).
	watch(selectedOrg, async () => {
		await refreshOrgUsers();
	});

	watch([() => Object.keys(orgUserMap.value), () => user.value?.id], () => {
		const ids = Object.keys(orgUserMap.value);
		updateAppointmentFilter(buildAppointmentFilter(user.value?.id, ids));
	});

	// ── Lead follow-ups (periodic fetch) ──
	const leadItems = useDirectusItems('leads');
	const followUpLeads = ref<any[]>([]);
	const followUpLoading = ref(false);

	const fetchFollowUps = async () => {
		if (!user.value) return;
		followUpLoading.value = true;
		try {
			const results = await leadItems.list({
				fields: [
					'id', 'stage', 'priority', 'estimated_value', 'next_follow_up', 'notes',
					'related_contact.id', 'related_contact.first_name', 'related_contact.last_name',
					'related_contact.email', 'related_contact.company',
					'assigned_to.id',
				],
				filter: {
					next_follow_up: { _nnull: true },
					stage: { _nin: ['won', 'lost'] },
					_or: [
						{ assigned_to: { _eq: user.value?.id } },
						{ user_created: { _eq: user.value?.id } },
					],
				},
				sort: ['next_follow_up'],
				limit: 200,
			});
			followUpLeads.value = results || [];
		} catch (e) {
			console.error('Failed to fetch follow-up leads:', e);
		} finally {
			followUpLoading.value = false;
		}
	};

	// ── External-calendar overlay (connections flagged show_on_calendar) ──
	// Read-only feed of the host's real Google/Outlook events, surfaced as
	// colour-coded 'external' chips. Fail-open: an errored overlay returns [].
	const externalOverlayEvents = ref<any[]>([]);
	const fetchExternalOverlay = async () => {
		if (!user.value) return;
		try {
			const res = await $fetch('/api/scheduler/external-events');
			externalOverlayEvents.value = (res as any)?.data || [];
		} catch {
			externalOverlayEvents.value = [];
		}
	};

	// Initial fetch + periodic refresh
	let followUpInterval: ReturnType<typeof setInterval> | null = null;
	let overlayInterval: ReturnType<typeof setInterval> | null = null;

	onMounted(() => {
		fetchFollowUps();
		fetchExternalOverlay();
		followUpInterval = setInterval(fetchFollowUps, 120_000);
		// Overlay is an external round-trip per provider — refresh less often.
		overlayInterval = setInterval(fetchExternalOverlay, 300_000);
	});

	onUnmounted(() => {
		if (followUpInterval) clearInterval(followUpInterval);
		if (overlayInterval) clearInterval(overlayInterval);
	});

	// ── Unified events ──
	const events = computed<CalendarEvent[]>(() => {
		const result: CalendarEvent[] = [];

		// Appointments → CalendarEvent
		const meId = user.value?.id;
		for (const apt of (realtimeAppointments.value || []) as any[]) {
			const lead = apt.related_lead || apt.video_meeting?.related_lead;
			const contactName = lead?.related_contact
				? `${lead.related_contact.first_name || ''} ${lead.related_contact.last_name || ''}`.trim()
				: null;

			const vm = apt.video_meeting || null;
			const attendeesArr = Array.isArray(apt.attendees) ? apt.attendees : [];
			const attendeeCount = attendeesArr.length;
			const members: Array<{ name: string; role: 'host' | 'attendee' | 'invitee'; email?: string | null }> = [];
			const creatorId = typeof apt.user_created === 'object'
				? apt.user_created?.id
				: apt.user_created;
			const creatorFromMap = creatorId ? orgUserMap.value[creatorId] : null;
			const creatorName = creatorFromMap?.name
				|| (apt.user_created && typeof apt.user_created === 'object'
					? `${apt.user_created.first_name || ''} ${apt.user_created.last_name || ''}`.trim() || apt.user_created.email
					: null);
			const creatorAvatar = creatorFromMap?.avatar
				|| (apt.user_created && typeof apt.user_created === 'object' ? apt.user_created.avatar : null)
				|| null;

			// Host row resolution. We previously pushed the host first from
			// `host_identity || creatorName` and then skipped the creator in
			// the attendees loop. That dropped the host entirely when both
			// strings were empty (orgUserMap not loaded yet + `user_created`
			// returned as a bare ID due to read perms) — leaving only the
			// non-host attendee in `members[]`. Resolve the host name from
			// the richer attendees join when possible so the host always
			// shows up, even if name lookup elsewhere fails.
			const attendeeUser = (a: any) => a?.directus_users_id;
			const attendeeUserId = (a: any) => {
				const u = attendeeUser(a);
				return typeof u === 'object' ? u?.id : u;
			};
			const attendeeUserName = (a: any) => {
				const u = attendeeUser(a);
				if (!u) return '';
				if (typeof u === 'object') {
					return `${u.first_name || ''} ${u.last_name || ''}`.trim() || (u.email ?? '');
				}
				return orgUserMap.value[u]?.name || '';
			};
			const hostFromAttendees = creatorId
				? attendeesArr.find((a: any) => attendeeUserId(a) === creatorId)
				: null;
			const hostDisplayName = (hostFromAttendees ? attendeeUserName(hostFromAttendees) : '')
				|| vm?.host_identity
				|| creatorName
				|| '';

			if (hostDisplayName || creatorId) {
				members.push({ name: hostDisplayName || 'Host', role: 'host' });
			}
			for (const a of attendeesArr) {
				const userId = attendeeUserId(a);
				if (!userId) continue;
				// Skip the host row — they already lead the list.
				if (creatorId && userId === creatorId) continue;
				const fullName = attendeeUserName(a);
				if (!fullName) continue;
				members.push({ name: fullName, role: 'attendee' });
			}

			// `video_meeting.attendees` (the rich VideoMeetingAttendee rows) hold
			// picker-added contacts AND manual external guests. Without folding
			// these in, the popover roster collapsed back to "host only" for any
			// meeting created via the contact picker. Track seen emails to
			// dedupe against the legacy invitee_* fields below.
			const vmAttendees = Array.isArray(vm?.attendees) ? vm.attendees : [];
			const seenEmails = new Set<string>();
			for (const va of vmAttendees) {
				if (!va || typeof va !== 'object') continue;
				const du = (va as any).directus_user;
				const cn = (va as any).contact;
				let name = '';
				let email: string | null = null;
				if (du && typeof du === 'object') {
					// Skip if this attendee row IS the host (some flows mirror the
					// host into video_meeting_attendees as attendee_type='user').
					if (creatorId && du.id === creatorId) continue;
					name = `${du.first_name || ''} ${du.last_name || ''}`.trim() || du.email || '';
					email = du.email || null;
					if (!name) continue;
					members.push({ name, role: 'attendee', email });
				} else if (cn && typeof cn === 'object') {
					name = `${cn.first_name || ''} ${cn.last_name || ''}`.trim() || cn.email || '';
					email = cn.email || (va as any).guest_email || null;
					if (!name) continue;
					members.push({ name, role: 'invitee', email });
				} else {
					name = (va as any).guest_name || (va as any).guest_email || '';
					email = (va as any).guest_email || null;
					if (!name) continue;
					members.push({ name, role: 'invitee', email });
				}
				if (email) seenEmails.add(email.toLowerCase());
			}

			// Legacy single-invitee fields (vm.invitee_*). Only push if they
			// don't already appear in the rich attendees — otherwise the same
			// guest reads twice in the popover.
			if (vm?.invitee_name || vm?.invitee_email) {
				const legacyEmail = (vm.invitee_email || '').toLowerCase();
				const dup = legacyEmail && seenEmails.has(legacyEmail);
				if (!dup) {
					members.push({
						name: vm.invitee_name || vm.invitee_email,
						role: 'invitee',
						email: vm.invitee_email || null,
					});
				}
			}

			result.push({
				id: `apt-${apt.id}`,
				type: apt.is_video ? 'video_meeting' : 'appointment',
				title: apt.title || 'Untitled',
				start_time: normalizeDirectusDate(apt.start_time)!,
				end_time: normalizeDirectusDate(apt.end_time),
				is_video: !!apt.is_video,
				meeting_link: apt.meeting_link,
				room_name: apt.room_name || vm?.room_name,
				lead: lead ? { id: lead.id, stage: lead.stage, contact_name: contactName || '' } : null,
				contact: null,
				status: apt.status || 'pending',
				description: apt.description,
				invitee_name: vm?.invitee_name,
				invitee_email: vm?.invitee_email,
				invitee_phone: vm?.invitee_phone,
				meeting_type: vm?.meeting_type,
				duration_minutes: vm?.duration_minutes,
				video_meeting_id: vm?.id || null,
				meeting_status: vm?.status || null,
				recording_enabled: !!vm?.recording_enabled,
				transcription_enabled: !!vm?.transcription_enabled,
				waiting_room_enabled: !!vm?.waiting_room_enabled,
				host_name: hostDisplayName || null,
				// Attendee count reflects everyone visible in `members[]` *minus*
				// the host so the day-timeline count pill reads "2" on a host +
				// 2-guest meeting instead of "1" (legacy single-invitee path).
				attendee_count: Math.max(0, members.length - (members[0]?.role === 'host' ? 1 : 0)),
				members,
				client_id: (typeof vm?.client === 'object' ? vm?.client?.id : vm?.client) || null,
				client_name: (typeof vm?.client === 'object' ? vm?.client?.name : null) || null,
				creator_id: creatorId || null,
				creator_name: creatorName || null,
				creator_avatar: creatorAvatar,
				is_mine: !!(creatorId && meId && creatorId === meId),
				source_record: apt,
			});
		}

		// External-calendar overlay → CalendarEvent (type 'external')
		// These are the host's OWN external calendars, so is_mine=true keeps them
		// visible under "Mine only". They're read-only: no source_record to edit.
		for (const ext of externalOverlayEvents.value) {
			if (!ext?.start) continue;
			result.push({
				id: `ext-${ext.id}`,
				type: 'external',
				title: ext.title || '(No title)',
				start_time: ext.start,
				end_time: ext.end || null,
				is_video: false,
				status: 'confirmed',
				external_color: ext.color || null,
				external_calendar_name: ext.calendarName || null,
				external_link: ext.link || null,
				creator_id: meId || null,
				is_mine: true,
				source_record: ext,
			});
		}

		// Lead follow-ups → CalendarEvent
		for (const lead of followUpLeads.value) {
			if (!lead.next_follow_up) continue;
			const contactName = lead.related_contact
				? `${lead.related_contact.first_name || ''} ${lead.related_contact.last_name || ''}`.trim()
				: 'Unknown';

			result.push({
				id: `followup-${lead.id}`,
				type: 'follow_up',
				title: `Follow up: ${contactName || lead.related_contact?.company || 'Lead'}`,
				start_time: normalizeDirectusDate(lead.next_follow_up)!,
				end_time: null,
				is_video: false,
				lead: { id: lead.id, stage: lead.stage, contact_name: contactName },
				contact: lead.related_contact ? { id: lead.related_contact.id, name: contactName } : null,
				status: 'pending',
				description: lead.notes,
				invitee_name: contactName,
				invitee_email: lead.related_contact?.email,
				meeting_type: null,
				duration_minutes: null,
				creator_id: user.value?.id || null,
				is_mine: true,
				source_record: lead,
			});
		}

		return result;
	});

	// ── Pre-computed date map for calendar rendering ──
	const eventsByDate = computed<Map<string, CalendarEvent[]>>(() => {
		const map = new Map<string, CalendarEvent[]>();
		for (const event of events.value) {
			if (!event.start_time) continue;
			// Bucket by *local* calendar day, not UTC. A 11pm-UTC event in EDT lives
			// on the previous local date — naive substring would put it in the wrong
			// day cell.
			const d = new Date(event.start_time);
			if (isNaN(d.getTime())) continue;
			const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			if (!map.has(dateKey)) map.set(dateKey, []);
			map.get(dateKey)!.push(event);
		}
		// Sort each day's events by start_time
		for (const [, dayEvents] of map) {
			dayEvents.sort((a, b) => a.start_time.localeCompare(b.start_time));
		}
		return map;
	});

	const getEventsForDate = (dateStr: string): CalendarEvent[] => {
		return eventsByDate.value.get(dateStr) || [];
	};

	const todayEvents = computed(() => {
		const today = new Date().toISOString().substring(0, 10);
		return getEventsForDate(today);
	});

	const upcomingFollowUps = computed(() => {
		const now = new Date();
		const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
		return events.value
			.filter(e => e.type === 'follow_up' && new Date(e.start_time) >= now && new Date(e.start_time) <= weekFromNow)
			.sort((a, b) => a.start_time.localeCompare(b.start_time));
	});

	const refresh = async () => {
		refreshAppointments();
		await Promise.all([fetchFollowUps(), fetchExternalOverlay()]);
	};

	return {
		events,
		eventsByDate,
		getEventsForDate,
		todayEvents,
		upcomingFollowUps,
		followUpLeads,
		isLoading: followUpLoading,
		refresh,
	};
}

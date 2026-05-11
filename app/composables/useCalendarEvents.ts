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
	source_record: any;
}

/**
 * Deterministic HSL color from a string id. Used to color-key a host across
 * the calendar + day-timeline. Hue space is wide enough that two random IDs
 * don't visually collide; we hold saturation + lightness constant so colors
 * read as a related family rather than a clown palette.
 */
export function hostAccentColor(id: string | null | undefined): string {
	if (!id) return 'hsl(0, 0%, 60%)';
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
	}
	const hue = hash % 360;
	return `hsl(${hue}, 65%, 55%)`;
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

	// Initial fetch + periodic refresh
	let followUpInterval: ReturnType<typeof setInterval> | null = null;

	onMounted(() => {
		fetchFollowUps();
		followUpInterval = setInterval(fetchFollowUps, 120_000);
	});

	onUnmounted(() => {
		if (followUpInterval) clearInterval(followUpInterval);
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
			const hostName = vm?.host_identity || creatorName;

			if (hostName) members.push({ name: hostName, role: 'host' });
			for (const a of attendeesArr) {
				const u = a?.directus_users_id;
				if (!u) continue;
				const userId = typeof u === 'object' ? u.id : u;
				// Skip the host row — they already lead the list.
				if (userId && creatorId && userId === creatorId) continue;
				const fullName = typeof u === 'object'
					? `${u.first_name || ''} ${u.last_name || ''}`.trim()
					: '';
				if (!fullName) continue;
				members.push({ name: fullName, role: 'attendee' });
			}
			if (vm?.invitee_name || vm?.invitee_email) {
				members.push({
					name: vm.invitee_name || vm.invitee_email,
					role: 'invitee',
					email: vm.invitee_email || null,
				});
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
				host_name: hostName || null,
				attendee_count: attendeeCount + (vm?.invitee_email && attendeeCount === 0 ? 1 : 0),
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
		await fetchFollowUps();
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

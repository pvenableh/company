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
	meeting_type?: string | null;
	duration_minutes?: number | null;
	source_record: any;
}

export function useCalendarEvents() {
	const { user } = useDirectusAuth();

	// ── Appointments (realtime) ──
	const {
		data: realtimeAppointments,
		refresh: refreshAppointments,
	} = useRealtimeSubscription(
		'appointments',
		[
			'id', 'title', 'description', 'start_time', 'end_time', 'status',
			'is_video', 'meeting_link', 'room_name',
			'video_meeting.id', 'video_meeting.room_name', 'video_meeting.title',
			'video_meeting.meeting_type', 'video_meeting.duration_minutes',
			'video_meeting.invitee_name', 'video_meeting.invitee_email',
			'video_meeting.related_lead.id', 'video_meeting.related_lead.stage',
			'related_lead.id', 'related_lead.stage',
			'related_lead.related_contact.first_name', 'related_lead.related_contact.last_name',
			'attendees.id',
			'attendees.directus_users_id.id',
			'attendees.directus_users_id.first_name',
			'attendees.directus_users_id.last_name',
			'user_created.*',
		],
		{
			_or: [
				{ user_created: { id: { _eq: user.value?.id } } },
				{ attendees: { directus_users_id: { _eq: user.value?.id } } },
			],
		},
	);

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
		for (const apt of (realtimeAppointments.value || []) as any[]) {
			const lead = apt.related_lead || apt.video_meeting?.related_lead;
			const contactName = lead?.related_contact
				? `${lead.related_contact.first_name || ''} ${lead.related_contact.last_name || ''}`.trim()
				: null;

			result.push({
				id: `apt-${apt.id}`,
				type: apt.is_video ? 'video_meeting' : 'appointment',
				title: apt.title || 'Untitled',
				start_time: apt.start_time,
				end_time: apt.end_time,
				is_video: !!apt.is_video,
				meeting_link: apt.meeting_link,
				room_name: apt.room_name || apt.video_meeting?.room_name,
				lead: lead ? { id: lead.id, stage: lead.stage, contact_name: contactName || '' } : null,
				contact: null,
				status: apt.status || 'pending',
				description: apt.description,
				invitee_name: apt.video_meeting?.invitee_name,
				invitee_email: apt.video_meeting?.invitee_email,
				meeting_type: apt.video_meeting?.meeting_type,
				duration_minutes: apt.video_meeting?.duration_minutes,
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
				start_time: lead.next_follow_up,
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
			const dateKey = event.start_time.substring(0, 10); // YYYY-MM-DD
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

<!--
  SchedulerHub — Calendar-first CRM hub for the Apps layout.

  Self-contained: stats row, filter chips, CRM sidebar, booking calendar,
  day timeline, and the UnifiedEventModal for both create + edit.

  Day-click behavior: clicking a day cell just selects that date — the day
  timeline column on the right updates to show its events. The new-meeting
  modal opens only via explicit affordances (the day-timeline "+ Video" /
  "+ Event" buttons, or the top-bar Instant/New Meeting buttons). We tried
  opening the modal on every day click and users reported it as "click did
  nothing" because the modal popped out of view before they noticed the
  day-timeline update.
-->
<template>
	<div>
		<!-- Action bar -->
		<div class="flex items-center justify-end gap-2 mb-5">
			<SchedulerInstantMeetingButton @created="handleMeetingCreated" />
			<SchedulerNewMeetingButton @created="handleMeetingCreated" />
			<NuxtLink
				to="/scheduler/settings"
				class="p-2 rounded-xl bg-muted/30 hover:bg-muted/60 transition-colors ios-press"
				title="Scheduler settings"
			>
				<UIcon name="i-heroicons-cog-6-tooth" class="w-4.5 h-4.5 text-muted-foreground" />
			</NuxtLink>
		</div>

		<!-- Stats Row -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
			<UiStatCard label="Upcoming" :value="stats.upcoming" />
			<UiStatCard label="Video" :value="stats.videoMeetings" />
			<UiStatCard label="Follow-ups" :value="stats.followUps" />
			<UiStatCard label="Requests" :value="stats.pending" />
		</div>

		<!-- Filter toggles -->
		<div class="flex items-center gap-2 mb-4">
			<button
				v-for="filter in eventFilters"
				:key="filter.key"
				class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-all duration-200 ios-press"
				:class="activeFilters.has(filter.key)
					? `${filter.activeBg} ${filter.activeText}`
					: 'bg-muted/30 text-muted-foreground hover:bg-muted/50'"
				@click="toggleFilter(filter.key)"
			>
				<span class="w-1.5 h-1.5 rounded-full" :class="filter.dot" />
				{{ filter.label }}
			</button>
			<div class="flex-1" />
			<button
				class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-all duration-200 ios-press"
				:class="mineOnly
					? 'bg-primary/15 text-primary'
					: 'bg-muted/30 text-muted-foreground hover:bg-muted/50'"
				:title="mineOnly ? 'Showing only your events — click to include teammates' : 'Showing all org events — click to filter to your own'"
				@click="mineOnly = !mineOnly"
			>
				<UIcon :name="mineOnly ? 'i-heroicons-user' : 'i-heroicons-user-group'" class="w-3 h-3" />
				{{ mineOnly ? 'Mine only' : 'Team' }}
			</button>
		</div>

		<!-- Main Layout: Sidebar + Calendar + Day Detail -->
		<div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[260px_minmax(0,1fr)_320px] gap-5">
			<div class="hidden lg:block">
				<SchedulerCrmSidebar
					:upcoming-follow-ups="calendarEvents.upcomingFollowUps.value"
					:settings="settings"
					:pending-requests="pendingRequestCount"
					@open-requests="showRequestsModal = true"
					@open-settings="$router.push('/scheduler/settings')"
				/>
			</div>

			<div class="ios-card p-4 overflow-hidden">
				<CalendarBookingCalendar
					:external-events="filteredEvents"
					@date-selected="handleDateSelect"
					@edit-event="handleEditEvent"
					@join-meeting="handleJoinMeeting"
					@deleted="handleEventCreated"
				/>
			</div>

			<div>
				<SchedulerDayTimeline
					:date="selectedDate"
					:events="selectedDateEvents"
					@new-event="handleNewEvent"
					@new-meeting="handleNewVideoMeeting"
					@edit-event="handleEditEvent"
					@join-meeting="handleJoinMeeting"
					@deleted="handleEventCreated"
				/>
			</div>
		</div>

		<!-- Unified Event/Meeting Modal -->
		<SchedulerUnifiedEventModal
			v-model="showEventModal"
			:selected-date="eventModalDate"
			:default-video="eventModalDefaultVideo"
			:appointment="eventModalAppointment"
			:meeting="eventModalMeeting"
			@created="handleEventCreated"
			@saved="handleEventCreated"
		/>

		<!-- Requests Modal -->
		<UModal v-model="showRequestsModal" :ui="{ width: 'max-w-lg' }">
			<div class="ios-card overflow-hidden !rounded-2xl">
				<div class="px-5 py-4 border-b border-border/30 flex items-center justify-between">
					<h3 class="text-sm font-semibold text-foreground">Meeting Requests</h3>
					<button class="p-1.5 rounded-lg hover:bg-muted/30 transition-colors" @click="showRequestsModal = false">
						<UIcon name="i-heroicons-x-mark" class="w-4 h-4 text-muted-foreground" />
					</button>
				</div>
				<SchedulerMeetingRequests />
			</div>
		</UModal>
	</div>
</template>

<script setup lang="ts">
import { parseISO } from 'date-fns';
import type { CalendarEvent } from '~/composables/useCalendarEvents';

const router = useRouter();
const { user } = useDirectusAuth();

// Unified calendar event stream
const calendarEvents = useCalendarEvents();

// State
const settings = ref<any>(null);
const videoMeetings = ref<any[]>([]);
const meetingRequests = ref<any[]>([]);
const showRequestsModal = ref(false);
const selectedDate = ref(new Date().toISOString().substring(0, 10));

// Filters
const activeFilters = ref(new Set(['appointments', 'video', 'follow_ups']));

const MINE_ONLY_KEY = 'earnest:scheduler-mine-only';
const mineOnly = ref(false);
onMounted(() => {
	try {
		const stored = localStorage.getItem(MINE_ONLY_KEY);
		if (stored === 'true' || stored === 'false') mineOnly.value = stored === 'true';
	} catch {}
	watch(mineOnly, (val) => {
		try { localStorage.setItem(MINE_ONLY_KEY, String(val)); } catch {}
	});
});

const eventFilters = [
	{ key: 'appointments', label: 'Appointments', dot: 'bg-blue-500', activeBg: 'bg-blue-100/60 dark:bg-blue-900/20', activeText: 'text-blue-700 dark:text-blue-300' },
	{ key: 'video', label: 'Video', dot: 'bg-emerald-500', activeBg: 'bg-emerald-100/60 dark:bg-emerald-900/20', activeText: 'text-emerald-700 dark:text-emerald-300' },
	{ key: 'follow_ups', label: 'Follow-ups', dot: 'bg-amber-500', activeBg: 'bg-amber-100/60 dark:bg-amber-900/20', activeText: 'text-amber-700 dark:text-amber-300' },
];

const toggleFilter = (key: string) => {
	const set = new Set(activeFilters.value);
	if (set.has(key)) set.delete(key);
	else set.add(key);
	activeFilters.value = set;
};

const filteredEvents = computed(() => {
	return calendarEvents.events.value.filter(e => {
		if (e.type === 'video_meeting' && !activeFilters.value.has('video')) return false;
		if (e.type === 'appointment' && !activeFilters.value.has('appointments')) return false;
		if (e.type === 'follow_up' && !activeFilters.value.has('follow_ups')) return false;
		if (mineOnly.value && e.is_mine === false) return false;
		return true;
	});
});

const selectedDateEvents = computed(() => {
	return filteredEvents.value
		.filter(e => {
			if (!e.start_time) return false;
			const d = new Date(e.start_time);
			if (isNaN(d.getTime())) return false;
			const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			return local === selectedDate.value;
		})
		.sort((a, b) => a.start_time.localeCompare(b.start_time));
});

// Stats
const pendingRequestCount = computed(() =>
	meetingRequests.value.filter(r => r.request_status === 'pending').length
);

const stats = computed(() => {
	const now = new Date();
	const upcoming = calendarEvents.events.value.filter(
		e => (e.type === 'appointment' || e.type === 'video_meeting') && new Date(e.start_time) > now
	);
	return {
		upcoming: upcoming.length,
		videoMeetings: upcoming.filter(e => e.type === 'video_meeting').length,
		followUps: calendarEvents.upcomingFollowUps.value.length,
		pending: pendingRequestCount.value,
	};
});

// Unified Event Modal
const showEventModal = ref(false);
const eventModalDate = ref<Date | undefined>(undefined);
const eventModalDefaultVideo = ref(true);
const eventModalAppointment = ref<any>(null);
const eventModalMeeting = ref<any>(null);

const resetEventModalEditState = () => {
	eventModalAppointment.value = null;
	eventModalMeeting.value = null;
};

watch(showEventModal, (open) => {
	if (!open) resetEventModalEditState();
});

// Day click only updates the selected date — the day-timeline column
// refreshes to show that day's events. Creation is an explicit action via
// the "+ Video" / "+ Event" buttons in the day timeline, or the Instant /
// New Meeting buttons in the action bar.
const handleDateSelect = (dateStr: string) => {
	selectedDate.value = dateStr;
};

const handleNewEvent = (dateStr: string) => {
	resetEventModalEditState();
	eventModalDate.value = parseISO(dateStr);
	eventModalDefaultVideo.value = false;
	showEventModal.value = true;
};

const handleNewVideoMeeting = (dateStr: string) => {
	resetEventModalEditState();
	eventModalDate.value = parseISO(dateStr);
	eventModalDefaultVideo.value = true;
	showEventModal.value = true;
};

const handleEditEvent = (event: CalendarEvent) => {
	if (event.type === 'follow_up' && event.lead?.id) {
		router.push(`/leads/${event.lead.id}`);
		return;
	}
	const apt = event.source_record;
	eventModalAppointment.value = apt;
	eventModalMeeting.value = apt?.video_meeting && typeof apt.video_meeting === 'object'
		? apt.video_meeting
		: null;
	eventModalDate.value = event.start_time ? parseISO(event.start_time) : undefined;
	eventModalDefaultVideo.value = event.type === 'video_meeting';
	showEventModal.value = true;
};

const handleJoinMeeting = (event: CalendarEvent) => {
	if (event.room_name) router.push(`/meeting/${event.room_name}`);
};

const handleEventCreated = () => {
	resetEventModalEditState();
	calendarEvents.refresh();
	fetchVideoMeetings();
};

const handleMeetingCreated = () => {
	calendarEvents.refresh();
	fetchVideoMeetings();
};

// Data fetching
const fetchVideoMeetings = async () => {
	try {
		const response = await $fetch('/api/scheduler/video-meetings');
		videoMeetings.value = (response as any).data || [];
	} catch {}
};

const fetchSettings = async () => {
	try {
		const response = await $fetch('/api/scheduler/settings');
		settings.value = (response as any).data;
	} catch {}
};

const fetchMeetingRequests = async () => {
	try {
		const response = await $fetch('/api/scheduler/meeting-requests');
		meetingRequests.value = (response as any).data || [];
	} catch {}
};

// Provide data to nested scheduler components (InstantMeetingButton, etc.)
provide('schedulerData', {
	videoMeetings,
	settings,
	user,
	refreshVideoMeetings: fetchVideoMeetings,
});

onMounted(() => {
	fetchVideoMeetings();
	fetchSettings();
	fetchMeetingRequests();
});
</script>

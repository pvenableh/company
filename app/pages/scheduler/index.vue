<template>
	<div class="min-h-screen">
		<!-- Client scheduler view (non-admin users) -->
		<div v-if="!isAdmin" class="min-h-screen">
			<!-- Client Header -->
			<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-6">
				<h1 class="text-[28px] font-bold text-foreground tracking-tight leading-tight">Schedule a Meeting</h1>
				<p class="text-[15px] text-muted-foreground mt-0.5">View availability and request a meeting</p>
			</div>

			<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
				<!-- Client Tab Pills -->
				<div class="flex gap-1 p-1 bg-muted/40 rounded-xl w-fit mb-6">
					<button
						v-for="tab in clientTabs"
						:key="tab.key"
						@click="clientActiveTab = tab.key"
						class="px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
						:class="clientActiveTab === tab.key
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'"
					>
						<span class="flex items-center gap-1.5">
							<UIcon :name="tab.icon" class="w-3.5 h-3.5" />
							{{ tab.label }}
						</span>
					</button>
				</div>

				<!-- Request a Meeting -->
				<div v-show="clientActiveTab === 'request'">
					<div v-if="loadingHosts" class="space-y-3">
						<div v-for="n in 3" :key="n" class="h-20 bg-muted/30 rounded-xl animate-pulse" />
					</div>

					<div v-else-if="availableHosts.length === 0" class="ios-card p-8 text-center">
						<UIcon name="i-heroicons-calendar" class="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
						<p class="text-sm font-medium text-muted-foreground">No hosts available</p>
						<p class="text-xs text-muted-foreground/60 mt-1">No team members have booking enabled at this time</p>
					</div>

					<div v-else class="space-y-3">
						<div
							v-for="host in availableHosts"
							:key="host.id"
							class="ios-card p-4"
						>
							<div class="flex items-center gap-4">
								<UAvatar :alt="`${host.first_name} ${host.last_name}`" size="lg" />
								<div class="flex-1 min-w-0">
									<h3 class="text-sm font-semibold text-foreground">{{ host.first_name }} {{ host.last_name }}</h3>
									<p v-if="host.booking_page_title" class="text-xs text-muted-foreground mt-0.5">{{ host.booking_page_title }}</p>
								</div>
								<div class="flex items-center gap-2">
									<button
										@click="openRequestModal(host)"
										class="px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-[11px] font-medium ios-press transition-all"
									>
										Request Meeting
									</button>
									<NuxtLink
										v-if="host.booking_page_slug"
										:to="`/book/${host.booking_page_slug || host.id}`"
										target="_blank"
										class="p-1.5 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors"
									>
										<UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4 text-muted-foreground" />
									</NuxtLink>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- My Requests -->
				<div v-show="clientActiveTab === 'my-requests'">
					<div v-if="loadingClientRequests" class="space-y-3">
						<div v-for="n in 3" :key="n" class="h-16 bg-muted/30 rounded-xl animate-pulse" />
					</div>

					<div v-else-if="clientRequests.length === 0" class="ios-card p-8 text-center">
						<UIcon name="i-heroicons-inbox" class="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
						<p class="text-sm font-medium text-muted-foreground">No meeting requests yet</p>
						<p class="text-xs text-muted-foreground/60 mt-1">Request a meeting to get started</p>
					</div>

					<div v-else class="space-y-2">
						<div v-for="request in clientRequests" :key="request.id" class="ios-card p-4">
							<div class="flex items-start justify-between">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-1">
										<p class="text-sm font-medium text-foreground">Meeting with {{ getHostName(request) }}</p>
										<UiStatusBadge :status="request.request_status || 'pending'" />
									</div>
									<div class="flex items-center gap-3 text-[11px] text-muted-foreground">
										<span class="flex items-center gap-1">
											<UIcon name="i-heroicons-calendar" class="w-3 h-3" />
											{{ clientFormatDate(request.requested_date) }}
										</span>
										<span v-if="request.preferred_time" class="flex items-center gap-1">
											<UIcon name="i-heroicons-clock" class="w-3 h-3" />
											{{ clientFormatTime(request.preferred_time) }}
										</span>
										<span v-if="request.duration_minutes">{{ request.duration_minutes }}min</span>
									</div>
									<p v-if="request.notes" class="text-[11px] text-muted-foreground mt-1.5 italic">"{{ request.notes }}"</p>
									<p v-if="request.admin_notes" class="text-[11px] text-primary mt-1">Response: {{ request.admin_notes }}</p>
								</div>
								<button
									v-if="request.request_status === 'approved' && request.linked_appointment"
									class="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg text-[11px] font-medium ios-press"
								>
									<UIcon name="i-heroicons-video-camera" class="w-3 h-3" />
									Join
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Meeting Request Modal -->
			<UModal v-model="showRequestModal">
				<div class="ios-card overflow-hidden !rounded-2xl">
					<div class="px-5 py-4 border-b border-border/30 flex items-center justify-between">
						<h3 class="text-sm font-semibold text-foreground">Request a Meeting</h3>
						<button @click="showRequestModal = false" class="p-1.5 rounded-lg hover:bg-muted/30 transition-colors">
							<UIcon name="i-heroicons-x-mark" class="w-4 h-4 text-muted-foreground" />
						</button>
					</div>

					<div v-if="selectedHost" class="p-5 space-y-4">
						<div class="flex items-center gap-3 p-3 bg-muted/20 rounded-xl">
							<UAvatar :alt="`${selectedHost.first_name} ${selectedHost.last_name}`" size="sm" />
							<div>
								<p class="text-sm font-medium text-foreground">{{ selectedHost.first_name }} {{ selectedHost.last_name }}</p>
								<p class="text-xs text-muted-foreground">{{ selectedHost.email }}</p>
							</div>
						</div>

						<UFormGroup label="Preferred Date" required>
							<UInput v-model="requestForm.date" type="date" :min="minDate" />
						</UFormGroup>
						<UFormGroup label="Preferred Time">
							<UInput v-model="requestForm.time" type="time" />
						</UFormGroup>
						<UFormGroup label="Duration">
							<USelect v-model="requestForm.duration" :options="durationOptions" />
						</UFormGroup>
						<UFormGroup label="Meeting Type">
							<USelect v-model="requestForm.meetingType" :options="meetingTypeOptions" />
						</UFormGroup>
						<UFormGroup label="Notes (optional)">
							<UTextarea v-model="requestForm.notes" placeholder="Describe what you'd like to discuss..." rows="3" />
						</UFormGroup>

						<div class="flex justify-end gap-2 pt-2">
							<button
								@click="showRequestModal = false"
								class="px-4 py-2 rounded-xl bg-muted/30 hover:bg-muted/60 text-sm font-medium text-foreground transition-colors ios-press"
							>
								Cancel
							</button>
							<button
								@click="submitRequest"
								:disabled="submittingRequest"
								class="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-colors ios-press disabled:opacity-50"
							>
								{{ submittingRequest ? 'Sending...' : 'Send Request' }}
							</button>
						</div>
					</div>
				</div>
			</UModal>
		</div>

		<!-- ═══ Admin: Calendar-First CRM Hub ═══ -->
		<template v-else>
			<div class="max-w-screen-xl mx-auto px-4 pb-8 sm:px-6 lg:px-8">
				<!-- Header -->
				<div class="flex items-center justify-between pt-2 mb-5">
					<div>
						<h1 class="text-[28px] font-bold text-foreground tracking-tight leading-tight">Calendar</h1>
						<p class="text-[15px] text-muted-foreground mt-0.5">Meetings, follow-ups, and CRM touchpoints</p>
					</div>
					<div class="flex items-center gap-2">
						<SchedulerNewMeetingButton @created="handleMeetingCreated" />
						<NuxtLink
							to="/scheduler/settings"
							class="p-2 rounded-xl bg-muted/30 hover:bg-muted/60 transition-colors ios-press"
						>
							<UIcon name="i-heroicons-cog-6-tooth" class="w-4.5 h-4.5 text-muted-foreground" />
						</NuxtLink>
					</div>
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
						@click="toggleFilter(filter.key)"
						class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-all duration-200 ios-press"
						:class="activeFilters.has(filter.key)
							? `${filter.activeBg} ${filter.activeText}`
							: 'bg-muted/30 text-muted-foreground hover:bg-muted/50'"
					>
						<span class="w-1.5 h-1.5 rounded-full" :class="filter.dot" />
						{{ filter.label }}
					</button>
				</div>

				<!-- Main Layout: Sidebar + Calendar + Day Detail -->
				<div class="grid grid-cols-1 md:grid-cols-[1fr_320px] lg:grid-cols-[260px_1fr_320px] gap-5">
					<!-- Left: CRM Sidebar -->
					<div class="hidden lg:block">
						<SchedulerCrmSidebar
							:upcoming-follow-ups="calendarEvents.upcomingFollowUps.value"
							:settings="settings"
							:pending-requests="pendingRequestCount"
							@open-requests="showRequestsModal = true"
							@open-settings="$router.push('/scheduler/settings')"
						/>
					</div>

					<!-- Center: Calendar -->
					<div class="ios-card p-4 overflow-hidden">
						<CalendarBookingCalendar
							:external-events="filteredEvents"
							@date-selected="handleDateSelect"
						/>
					</div>

					<!-- Right: Day Timeline (Clean Gantt) -->
					<div>
						<SchedulerDayTimeline
							:date="selectedDate"
							:events="selectedDateEvents"
							@new-event="handleNewEvent"
							@new-meeting="handleNewVideoMeeting"
							@edit-event="handleEditEvent"
						/>
					</div>
				</div>
			</div>

			<!-- Unified Event/Meeting Modal -->
			<SchedulerUnifiedEventModal
				v-model="showEventModal"
				:selected-date="eventModalDate"
				:default-video="eventModalDefaultVideo"
				@created="handleEventCreated"
				@saved="handleEventCreated"
			/>

			<!-- Requests Modal -->
			<UModal v-model="showRequestsModal" :ui="{ width: 'max-w-lg' }">
				<div class="ios-card overflow-hidden !rounded-2xl">
					<div class="px-5 py-4 border-b border-border/30 flex items-center justify-between">
						<h3 class="text-sm font-semibold text-foreground">Meeting Requests</h3>
						<button @click="showRequestsModal = false" class="p-1.5 rounded-lg hover:bg-muted/30 transition-colors">
							<UIcon name="i-heroicons-x-mark" class="w-4 h-4 text-muted-foreground" />
						</button>
					</div>
					<SchedulerMeetingRequests />
				</div>
			</UModal>
		</template>
	</div>
</template>

<script setup lang="ts">
import { format, isAfter, addDays, parseISO } from 'date-fns';
import type { CalendarEvent } from '~/composables/useCalendarEvents';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Calendar | Earnest' });

const { user } = useDirectusAuth();
const { canAccess } = useOrgRole();
const isAdmin = computed(() => canAccess('appointments'));
const toast = useToast();
const router = useRouter();

// ═══ Calendar Events (unified) ═══
const calendarEvents = useCalendarEvents();

// ═══ Admin state ═══
const settings = ref<any>(null);
const videoMeetings = ref<any[]>([]);
const loadingVideoMeetings = ref(true);
const meetingRequests = ref<any[]>([]);
const showRequestsModal = ref(false);
const selectedDate = ref(new Date().toISOString().substring(0, 10));

// ── Filters ──
const activeFilters = ref(new Set(['appointments', 'video', 'follow_ups']));

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
		return true;
	});
});

const selectedDateEvents = computed(() => {
	return filteredEvents.value
		.filter(e => e.start_time?.substring(0, 10) === selectedDate.value)
		.sort((a, b) => a.start_time.localeCompare(b.start_time));
});

// ── Stats ──
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

// ── Unified Event Modal ──
const showEventModal = ref(false);
const eventModalDate = ref<Date | undefined>(undefined);
const eventModalDefaultVideo = ref(true);

// ── Event handlers ──
const handleDateSelect = (dateStr: string) => {
	selectedDate.value = dateStr;
};

const handleNewEvent = (dateStr: string) => {
	eventModalDate.value = parseISO(dateStr);
	eventModalDefaultVideo.value = false;
	showEventModal.value = true;
};

const handleNewVideoMeeting = (dateStr: string) => {
	eventModalDate.value = parseISO(dateStr);
	eventModalDefaultVideo.value = true;
	showEventModal.value = true;
};

const handleEditEvent = (event: CalendarEvent) => {
	if (event.type === 'video_meeting' && event.room_name) {
		router.push(`/meeting/${event.room_name}`);
	} else if (event.type === 'follow_up' && event.lead?.id) {
		router.push(`/leads/${event.lead.id}`);
	}
};

const handleEventCreated = () => {
	calendarEvents.refresh();
	fetchVideoMeetings();
};

const handleMeetingCreated = () => {
	calendarEvents.refresh();
	fetchVideoMeetings();
};

// ── Data fetching ──
const fetchVideoMeetings = async () => {
	loadingVideoMeetings.value = true;
	try {
		const response = await $fetch('/api/scheduler/video-meetings');
		videoMeetings.value = (response as any).data || [];
	} catch {
		// silently fail — video meetings list is non-critical
	} finally {
		loadingVideoMeetings.value = false;
	}
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

// Provide data to child components
provide('schedulerData', {
	videoMeetings,
	settings,
	user,
	refreshVideoMeetings: fetchVideoMeetings,
});

// ═══ Client state (non-admin) ═══
const clientActiveTab = ref('request');
const availableHosts = ref<any[]>([]);
const loadingHosts = ref(true);
const clientRequests = ref<any[]>([]);
const loadingClientRequests = ref(true);
const showRequestModal = ref(false);
const selectedHost = ref<any>(null);
const submittingRequest = ref(false);

const clientTabs = [
	{ key: 'request', label: 'Request a Meeting', icon: 'i-heroicons-calendar-days' },
	{ key: 'my-requests', label: 'My Requests', icon: 'i-heroicons-inbox' },
];

const minDate = computed(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'));

const durationOptions = [
	{ label: '15 minutes', value: 15 },
	{ label: '30 minutes', value: 30 },
	{ label: '45 minutes', value: 45 },
	{ label: '60 minutes', value: 60 },
];

const meetingTypeOptions = [
	{ label: 'Consultation', value: 'consultation' },
	{ label: 'Discovery Call', value: 'discovery' },
	{ label: 'Project Review', value: 'project_review' },
	{ label: 'General', value: 'general' },
];

const requestForm = reactive({
	date: '',
	time: '',
	duration: 30,
	meetingType: 'consultation',
	notes: '',
});

const fetchAvailableHosts = async () => {
	loadingHosts.value = true;
	try {
		const response = await $fetch('/api/scheduler/available-hosts');
		availableHosts.value = (response as any).data || [];
	} catch {
		// silently fail
	} finally {
		loadingHosts.value = false;
	}
};

const fetchClientRequests = async () => {
	loadingClientRequests.value = true;
	try {
		const response = await $fetch('/api/scheduler/meeting-requests');
		clientRequests.value = (response as any).data || [];
	} catch {
		// silently fail
	} finally {
		loadingClientRequests.value = false;
	}
};

const openRequestModal = (host: any) => {
	selectedHost.value = host;
	requestForm.date = '';
	requestForm.time = '';
	requestForm.duration = host.default_duration || 30;
	requestForm.meetingType = host.default_meeting_type || 'consultation';
	requestForm.notes = '';
	showRequestModal.value = true;
};

const submitRequest = async () => {
	if (!requestForm.date) {
		toast.add({ title: 'Please select a preferred date', color: 'red' });
		return;
	}
	submittingRequest.value = true;
	try {
		await $fetch('/api/scheduler/meeting-requests', {
			method: 'POST',
			body: {
				host_user_id: selectedHost.value.id,
				requested_date: requestForm.date,
				preferred_time: requestForm.time || null,
				duration_minutes: requestForm.duration,
				meeting_type: requestForm.meetingType,
				notes: requestForm.notes,
			},
		});
		toast.add({ title: 'Meeting request sent!', description: 'You will be notified once it is reviewed.', color: 'green' });
		showRequestModal.value = false;
		await fetchClientRequests();
	} catch (error: any) {
		toast.add({ title: 'Error sending request', description: error.message, color: 'red' });
	} finally {
		submittingRequest.value = false;
	}
};

const getHostName = (request: any) => {
	const host = request.host_user;
	if (!host) return 'Unknown';
	return typeof host === 'object' ? `${host.first_name || ''} ${host.last_name || ''}`.trim() : host;
};

// Uses utils/dates.ts helpers
const clientFormatDate = (dateStr: string) => {
	if (!dateStr) return 'No date specified';
	const d = new Date(dateStr);
	if (isNaN(d.getTime())) return dateStr;
	return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

// Uses formatTimeFromString from utils/dates.ts
const clientFormatTime = (timeStr: string) => formatTimeFromString(timeStr);

// ═══ Lifecycle ═══
onMounted(() => {
	if (isAdmin.value) {
		fetchVideoMeetings();
		fetchSettings();
		fetchMeetingRequests();
	} else {
		fetchAvailableHosts();
		fetchClientRequests();
	}
});
</script>

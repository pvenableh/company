<template>
	<div class="min-h-screen">
		<!-- Client scheduler view -->
		<div v-if="!isAdmin" class="min-h-screen">
			<!-- Client Header -->
			<div class="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
				<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
					<h1 class="text-2xl font-bold">Schedule a Meeting</h1>
					<p class="text-sm text-gray-500 mt-1">View availability and request a meeting</p>
				</div>
			</div>

			<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
				<UTabs :items="clientTabs" v-model="clientActiveTab" class="w-full">
					<template #item="{ item }">
						<!-- Request a Meeting Tab -->
						<div v-if="item.key === 'request'" class="py-4">
							<!-- Available Hosts -->
							<div v-if="loadingHosts" class="flex justify-center py-8">
								<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
							</div>

							<div v-else-if="availableHosts.length === 0" class="text-center py-12">
								<UIcon name="i-heroicons-calendar" class="w-12 h-12 text-gray-300 mx-auto mb-3" />
								<h3 class="text-lg font-medium text-gray-600">No Hosts Available</h3>
								<p class="text-sm text-gray-400 mt-1">No team members have booking enabled at this time.</p>
							</div>

							<div v-else class="space-y-6">
								<div v-for="host in availableHosts" :key="host.id" class="space-y-4">
									<UCard>
										<div class="flex items-center gap-4 mb-4">
											<UAvatar :alt="`${host.first_name} ${host.last_name}`" size="lg" />
											<div>
												<h3 class="font-semibold text-lg">{{ host.first_name }} {{ host.last_name }}</h3>
												<p v-if="host.booking_page_title" class="text-sm text-gray-500">{{ host.booking_page_title }}</p>
												<p v-if="host.booking_page_description" class="text-sm text-gray-400">{{ host.booking_page_description }}</p>
											</div>
										</div>

										<div class="flex items-center gap-3">
											<UButton
												color="primary"
												size="sm"
												icon="i-heroicons-calendar-days"
												@click="openRequestModal(host)"
											>
												Request Meeting
											</UButton>
											<UButton
												v-if="host.booking_page_slug"
												color="gray"
												variant="soft"
												size="sm"
												icon="i-heroicons-arrow-top-right-on-square"
												:to="`/book/${host.booking_page_slug || host.id}`"
												target="_blank"
											>
												Book Directly
											</UButton>
										</div>
									</UCard>
								</div>
							</div>
						</div>

						<!-- My Requests Tab -->
						<div v-else-if="item.key === 'my-requests'" class="py-4">
							<div v-if="loadingClientRequests" class="flex justify-center py-8">
								<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
							</div>

							<div v-else-if="clientRequests.length === 0" class="text-center py-12 border-2 border-dashed rounded-lg">
								<UIcon name="i-heroicons-inbox" class="w-10 h-10 text-gray-300 mx-auto mb-2" />
								<p class="text-gray-500">No meeting requests yet</p>
								<p class="text-sm text-gray-400 mt-1">Request a meeting to get started</p>
							</div>

							<div v-else class="space-y-3">
								<UCard v-for="request in clientRequests" :key="request.id">
									<div class="flex items-start justify-between">
										<div>
											<div class="flex items-center gap-2 mb-1">
												<p class="font-medium">
													Meeting with {{ getHostName(request) }}
												</p>
												<UBadge
													:color="request.request_status === 'approved' ? 'green' : request.request_status === 'rejected' ? 'red' : 'yellow'"
													variant="soft"
													size="xs"
													class="capitalize"
												>
													{{ request.request_status || 'pending' }}
												</UBadge>
											</div>
											<div class="flex flex-wrap items-center gap-3 text-sm text-gray-500">
												<span class="flex items-center gap-1">
													<UIcon name="i-heroicons-calendar" class="w-4 h-4" />
													{{ clientFormatDate(request.requested_date) }}
												</span>
												<span v-if="request.preferred_time" class="flex items-center gap-1">
													<UIcon name="i-heroicons-clock" class="w-4 h-4" />
													{{ clientFormatTime(request.preferred_time) }}
												</span>
												<span v-if="request.duration_minutes">{{ request.duration_minutes }} min</span>
											</div>
											<p v-if="request.notes" class="text-sm text-gray-400 mt-2 italic">"{{ request.notes }}"</p>
											<p v-if="request.admin_notes" class="text-sm text-blue-500 mt-1">Response: {{ request.admin_notes }}</p>
										</div>
										<div v-if="request.request_status === 'approved' && request.linked_appointment">
											<UButton
												size="xs"
												color="green"
												variant="soft"
												icon="i-heroicons-video-camera"
											>
												Join Meeting
											</UButton>
										</div>
									</div>
								</UCard>
							</div>
						</div>
					</template>
				</UTabs>
			</div>

			<!-- Meeting Request Modal -->
			<UModal v-model="showRequestModal">
				<UCard>
					<template #header>
						<div class="flex items-center justify-between">
							<h3 class="font-semibold">Request a Meeting</h3>
							<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showRequestModal = false" />
						</div>
					</template>

					<div v-if="selectedHost" class="space-y-4">
						<div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
							<UAvatar :alt="`${selectedHost.first_name} ${selectedHost.last_name}`" size="sm" />
							<div>
								<p class="font-medium">{{ selectedHost.first_name }} {{ selectedHost.last_name }}</p>
								<p class="text-sm text-gray-500">{{ selectedHost.email }}</p>
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
					</div>

					<template #footer>
						<div class="flex justify-end gap-2">
							<UButton color="gray" variant="soft" @click="showRequestModal = false">Cancel</UButton>
							<UButton color="primary" :loading="submittingRequest" @click="submitRequest">Send Request</UButton>
						</div>
					</template>
				</UCard>
			</UModal>
		</div>

		<!-- Full scheduler for admin users -->
		<template v-else>
		<!-- Header -->
		<div class="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
				<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
					<div>
						<h1 class="text-2xl font-bold">Scheduler</h1>
						<p class="text-sm text-gray-500 mt-1">Manage appointments and video meetings</p>
					</div>
					<div class="flex items-center gap-3">
						<SchedulerNewMeetingButton @created="refreshVideoMeetings" />
						<UButton to="/scheduler/settings" color="gray" variant="ghost" icon="i-heroicons-cog-6-tooth" />
					</div>
				</div>
			</div>
		</div>

		<!-- Stats Cards -->
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
				<UCard>
					<div class="flex items-center gap-3">
						<div class="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
							<UIcon name="i-heroicons-calendar" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<p class="text-2xl font-bold">{{ stats.upcoming }}</p>
							<p class="text-xs text-gray-500">Upcoming</p>
						</div>
					</div>
				</UCard>
				<UCard>
					<div class="flex items-center gap-3">
						<div class="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
							<UIcon name="i-heroicons-video-camera" class="w-5 h-5 text-green-600 dark:text-green-400" />
						</div>
						<div>
							<p class="text-2xl font-bold">{{ stats.videoMeetings }}</p>
							<p class="text-xs text-gray-500">Video Meetings</p>
						</div>
					</div>
				</UCard>
				<UCard>
					<div class="flex items-center gap-3">
						<div class="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
							<UIcon name="i-heroicons-clock" class="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
						</div>
						<div>
							<p class="text-2xl font-bold">{{ stats.pending }}</p>
							<p class="text-xs text-gray-500">Pending</p>
						</div>
					</div>
				</UCard>
				<UCard>
					<div class="flex items-center gap-3">
						<div class="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
							<UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-gray-600 dark:text-gray-400" />
						</div>
						<div>
							<p class="text-2xl font-bold">{{ stats.completed }}</p>
							<p class="text-xs text-gray-500">Completed</p>
						</div>
					</div>
				</UCard>
			</div>

			<!-- Tabs -->
			<UTabs :items="tabs" v-model="activeTab" class="w-full">
				<template #item="{ item }">
					<div v-if="item.key === 'calendar'" class="py-4">
						<div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
							<!-- Calendar takes up 3 columns -->
							<div class="lg:col-span-3">
								<CalendarView />
							</div>

							<!-- Sidebar -->
							<div class="space-y-6">
								<!-- Booking Link Card -->
								<UCard v-if="settings?.public_booking_enabled">
									<template #header>
										<h3 class="font-semibold text-sm">Your Booking Link</h3>
									</template>
									<div class="space-y-3">
										<p class="text-xs text-gray-500">Share this link for clients to book meetings with you</p>
										<div class="flex gap-2">
											<UInput :model-value="bookingUrl" readonly size="sm" class="flex-1 text-xs" />
											<UButton size="sm" color="gray" icon="i-heroicons-clipboard" @click="copyBookingLink" />
										</div>
									</div>
								</UCard>

								<!-- Upcoming Video Meetings -->
								<UCard>
									<template #header>
										<div class="flex items-center justify-between">
											<h3 class="font-semibold text-sm">Upcoming Video Meetings</h3>
											<UBadge v-if="upcomingVideoMeetings.length" color="green" variant="soft" size="xs">
												{{ upcomingVideoMeetings.length }}
											</UBadge>
										</div>
									</template>
									<div v-if="loadingVideoMeetings" class="text-center py-4">
										<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-400" />
									</div>
									<div v-else-if="upcomingVideoMeetings.length === 0" class="text-center py-4">
										<p class="text-sm text-gray-500">No upcoming video meetings</p>
									</div>
									<div v-else class="space-y-3">
										<div
											v-for="meeting in upcomingVideoMeetings.slice(0, 5)"
											:key="meeting.id"
											class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
										>
											<div class="flex items-start justify-between">
												<div class="flex-1 min-w-0">
													<p class="font-medium text-sm truncate">{{ meeting.title }}</p>
													<p class="text-xs text-gray-500">{{ formatMeetingTime(meeting.scheduled_start) }}</p>
													<p v-if="meeting.invitee_name" class="text-xs text-gray-400">
														with {{ meeting.invitee_name }}
													</p>
												</div>
												<UButton
													size="xs"
													color="green"
													variant="soft"
													icon="i-heroicons-video-camera"
													:to="`/meeting/${meeting.room_name}`"
													target="_blank"
												/>
											</div>
										</div>
									</div>
								</UCard>

								<!-- Quick Actions -->
								<UCard>
									<template #header>
										<h3 class="font-semibold text-sm">Quick Actions</h3>
									</template>
									<div class="space-y-2">
										<SchedulerInstantMeetingButton @created="refreshVideoMeetings" />
										<UButton block color="gray" variant="soft" icon="i-heroicons-cog-6-tooth" to="/scheduler/settings">
											Settings
										</UButton>
									</div>
								</UCard>
							</div>
						</div>
					</div>

					<div v-else-if="item.key === 'video'" class="py-4">
						<SchedulerVideoMeetingsList :meetings="videoMeetings" @refresh="refreshVideoMeetings" />
					</div>

					<div v-else-if="item.key === 'requests'" class="py-4">
						<SchedulerMeetingRequests />
					</div>

					<div v-else-if="item.key === 'history'" class="py-4">
						<SchedulerHistory />
					</div>
				</template>
			</UTabs>
		</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { format, parseISO, isAfter, addDays } from 'date-fns';

definePageMeta({ middleware: ['auth'] });

const { user } = useDirectusAuth();
const { canAccess } = useRole();

const isAdmin = computed(() => canAccess('appointments'));
const toast = useToast();

// ===== Client-side state (for non-admin users) =====
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
	} catch (error) {
		console.error('Error fetching available hosts:', error);
	} finally {
		loadingHosts.value = false;
	}
};

const fetchClientRequests = async () => {
	loadingClientRequests.value = true;
	try {
		const response = await $fetch('/api/scheduler/meeting-requests');
		clientRequests.value = (response as any).data || [];
	} catch (error) {
		console.error('Error fetching client requests:', error);
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

const clientFormatDate = (dateStr: string) => {
	if (!dateStr) return 'No date specified';
	try {
		return format(parseISO(dateStr), 'EEE, MMM d, yyyy');
	} catch {
		return dateStr;
	}
};

const clientFormatTime = (timeStr: string) => {
	if (!timeStr) return '';
	const [h, m] = timeStr.split(':');
	const hour = parseInt(h);
	const ampm = hour >= 12 ? 'PM' : 'AM';
	const displayHour = hour % 12 || 12;
	return `${displayHour}:${m} ${ampm}`;
};

// ===== Admin-side state =====
const activeTab = ref('calendar');
const videoMeetings = ref<any[]>([]);
const settings = ref<any>(null);
const loadingVideoMeetings = ref(true);

// Meeting requests
const meetingRequests = ref<any[]>([]);
const loadingRequests = ref(true);

const fetchMeetingRequests = async () => {
	loadingRequests.value = true;
	try {
		const response = await $fetch('/api/scheduler/meeting-requests');
		meetingRequests.value = (response as any).data || [];
	} catch (error) {
		console.error('Error fetching meeting requests:', error);
	} finally {
		loadingRequests.value = false;
	}
};

const pendingRequestCount = computed(() =>
	meetingRequests.value.filter((r) => r.request_status === 'pending').length
);

// Tabs
const tabs = computed(() => [
	{ key: 'calendar', label: 'Calendar', icon: 'i-heroicons-calendar' },
	{ key: 'video', label: 'Video Meetings', icon: 'i-heroicons-video-camera' },
	{ key: 'requests', label: `Requests${pendingRequestCount.value ? ` (${pendingRequestCount.value})` : ''}`, icon: 'i-heroicons-inbox' },
	{ key: 'history', label: 'History', icon: 'i-heroicons-clock' },
]);

// Computed
const bookingUrl = computed(() => {
	const baseUrl = useRuntimeConfig().public.siteUrl || window.location.origin;
	const slug = settings.value?.booking_page_slug || user.value?.id;
	return `${baseUrl}/book/${slug}`;
});

const upcomingVideoMeetings = computed(() => {
	const now = new Date();
	return videoMeetings.value
		.filter((m) => m.status === 'scheduled' && isAfter(parseISO(m.scheduled_start), now))
		.sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());
});

const stats = computed(() => {
	const now = new Date();
	return {
		upcoming: upcomingVideoMeetings.value.length,
		videoMeetings: videoMeetings.value.filter((m) => m.status === 'scheduled').length,
		pending: videoMeetings.value.filter((m) => m.status === 'scheduled').length,
		completed: videoMeetings.value.filter((m) => m.status === 'completed').length,
	};
});

// Methods
const formatMeetingTime = (dateStr: string) => {
	if (!dateStr) return '';
	return format(parseISO(dateStr), 'EEE, MMM d · h:mm a');
};

const copyBookingLink = async () => {
	await navigator.clipboard.writeText(bookingUrl.value);
	toast.add({ title: 'Booking link copied!', color: 'green', icon: 'i-heroicons-clipboard-document-check' });
};

const fetchVideoMeetings = async () => {
	loadingVideoMeetings.value = true;
	try {
		const response = await $fetch('/api/scheduler/video-meetings');
		videoMeetings.value = (response as any).data || [];
	} catch (error) {
		console.error('Error fetching video meetings:', error);
	} finally {
		loadingVideoMeetings.value = false;
	}
};

const fetchSettings = async () => {
	try {
		const response = await $fetch('/api/scheduler/settings');
		settings.value = (response as any).data;
	} catch (error) {
		console.error('Error fetching settings:', error);
	}
};

const refreshVideoMeetings = () => {
	fetchVideoMeetings();
};

// Provide data to child components
provide('schedulerData', {
	videoMeetings,
	settings,
	user,
	refreshVideoMeetings,
});

// Lifecycle
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

<template>
	<div class="min-h-screen">
		<!-- Coming Soon for non-admin users -->
		<div v-if="!isAdmin" class="page__content">
			<h1 class="page__title">Scheduler</h1>
			<div class="flex flex-col items-center justify-center z-10 min-h-[60vh] page__inner">
				<h2 class="text-2xl font-proxima-light uppercase tracking-widest text-gray-400">Coming Soon</h2>
				<p class="text-sm text-gray-400 mt-2">This feature is currently under development.</p>
			</div>
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
import { format, parseISO, isAfter } from 'date-fns';

const { user } = useDirectusAuth();
const { hasAdminAccess } = useTeams();

const isAdmin = computed(() => hasAdminAccess(user.value));
const toast = useToast();

// State
const activeTab = ref(0);
const videoMeetings = ref<any[]>([]);
const settings = ref<any>(null);
const loadingVideoMeetings = ref(true);

// Tabs
const tabs = [
	{ key: 'calendar', label: 'Calendar', icon: 'i-heroicons-calendar' },
	{ key: 'video', label: 'Video Meetings', icon: 'i-heroicons-video-camera' },
	{ key: 'history', label: 'History', icon: 'i-heroicons-clock' },
];

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
	fetchVideoMeetings();
	fetchSettings();
});
</script>

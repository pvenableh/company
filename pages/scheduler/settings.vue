<!-- pages/scheduler/settings.vue -->
<script setup>
definePageMeta({ middleware: ['auth'] });

const { data: authData, status } = useAuth();
const user = computed(() => status.value === 'authenticated' ? authData?.value?.user ?? null : null);

const toast = useToast();

// State
const loading = ref(true);
const saving = ref(false);
const activeTab = ref('general');

// Data
const settings = ref(null);
const availability = ref({});

// Tabs
const tabs = [
	{ key: 'general', label: 'General', icon: 'i-heroicons-cog-6-tooth' },
	{ key: 'availability', label: 'Availability', icon: 'i-heroicons-clock' },
	{ key: 'booking', label: 'Booking Page', icon: 'i-heroicons-link' },
	{ key: 'calendar', label: 'Calendar Sync', icon: 'i-heroicons-calendar' },
	{ key: 'notifications', label: 'Notifications', icon: 'i-heroicons-bell' },
];

// Options
const durationOptions = [
	{ label: '15 minutes', value: 15 },
	{ label: '30 minutes', value: 30 },
	{ label: '45 minutes', value: 45 },
	{ label: '60 minutes', value: 60 },
];

const meetingTypeOptions = [
	{ label: 'Consultation', value: 'consultation' },
	{ label: 'Discovery Call', value: 'discovery' },
	{ label: 'General', value: 'general' },
];

const reminderOptions = [
	{ label: '15 minutes before', value: 15 },
	{ label: '30 minutes before', value: 30 },
	{ label: '1 hour before', value: 60 },
	{ label: '1 day before', value: 1440 },
];

const timezoneOptions = [
	{ label: 'Eastern Time (ET)', value: 'America/New_York' },
	{ label: 'Central Time (CT)', value: 'America/Chicago' },
	{ label: 'Mountain Time (MT)', value: 'America/Denver' },
	{ label: 'Pacific Time (PT)', value: 'America/Los_Angeles' },
];

const weekDays = [
	{ label: 'Monday', value: 'monday' },
	{ label: 'Tuesday', value: 'tuesday' },
	{ label: 'Wednesday', value: 'wednesday' },
	{ label: 'Thursday', value: 'thursday' },
	{ label: 'Friday', value: 'friday' },
	{ label: 'Saturday', value: 'saturday' },
	{ label: 'Sunday', value: 'sunday' },
];

// Form
const form = reactive({
	default_duration: 30,
	default_meeting_type: 'general',
	buffer_before: 0,
	buffer_after: 0,
	timezone: 'America/New_York',
	public_booking_enabled: true,
	booking_page_slug: '',
	booking_page_title: '',
	booking_page_description: '',
	send_confirmations: true,
	send_reminders: true,
	reminder_time: 60,
	google_calendar_enabled: false,
	google_calendar_id: '',
	outlook_calendar_enabled: false,
});

// Computed
const bookingUrl = computed(() => {
	const slug = form.booking_page_slug || user.value?.id;
	return `${window.location.origin}/book/${slug}`;
});

// Methods
const fetchSettings = async () => {
	loading.value = true;
	try {
		const [settingsRes, availRes] = await Promise.all([
			$fetch('/api/scheduler/settings'),
			$fetch('/api/scheduler/availability'),
		]);
		
		settings.value = settingsRes.data;
		if (settings.value) {
			Object.keys(form).forEach((key) => {
				if (settings.value[key] !== undefined) form[key] = settings.value[key];
			});
		}
		
		const availData = availRes.data || [];
		weekDays.forEach((day) => {
			const dayData = availData.find((a) => a.day_of_week?.toLowerCase() === day.value);
			availability.value[day.value] = {
				enabled: dayData?.is_available !== false && !!dayData,
				start: dayData?.start_time?.substring(0, 5) || '09:00',
				end: dayData?.end_time?.substring(0, 5) || '17:00',
				breakStart: dayData?.break_start?.substring(0, 5) || '',
				breakEnd: dayData?.break_end?.substring(0, 5) || '',
			};
		});
	} catch (error) {
		console.error('Error:', error);
	}
	loading.value = false;
};

const saveSettings = async () => {
	saving.value = true;
	try {
		await $fetch('/api/scheduler/settings', { method: 'POST', body: form });
		toast.add({ title: 'Settings saved', color: 'green' });
	} catch (error) {
		toast.add({ title: 'Error saving', description: error.message, color: 'red' });
	}
	saving.value = false;
};

const saveAvailability = async () => {
	saving.value = true;
	try {
		await $fetch('/api/scheduler/availability', { method: 'POST', body: availability.value });
		toast.add({ title: 'Availability saved', color: 'green' });
	} catch (error) {
		toast.add({ title: 'Error saving', description: error.message, color: 'red' });
	}
	saving.value = false;
};

const connectGoogle = async () => {
	try {
		const response = await $fetch('/api/calendar/google/auth-url');
		window.location.href = response.url;
	} catch (error) {
		toast.add({ title: 'Error connecting Google Calendar', color: 'red' });
	}
};

const disconnectGoogle = async () => {
	try {
		await $fetch('/api/calendar/google/disconnect', { method: 'POST' });
		form.google_calendar_enabled = false;
		form.google_calendar_id = '';
		toast.add({ title: 'Google Calendar disconnected', color: 'green' });
	} catch (error) {
		toast.add({ title: 'Error disconnecting', color: 'red' });
	}
};

const connectOutlook = async () => {
	try {
		const response = await $fetch('/api/calendar/outlook/auth-url');
		window.location.href = response.url;
	} catch (error) {
		toast.add({ title: 'Error connecting Outlook', color: 'red' });
	}
};

const disconnectOutlook = async () => {
	try {
		await $fetch('/api/calendar/outlook/disconnect', { method: 'POST' });
		form.outlook_calendar_enabled = false;
		toast.add({ title: 'Outlook disconnected', color: 'green' });
	} catch (error) {
		toast.add({ title: 'Error disconnecting', color: 'red' });
	}
};

const copyBookingLink = async () => {
	await navigator.clipboard.writeText(bookingUrl.value);
	toast.add({ title: 'Link copied', color: 'green' });
};

onMounted(() => fetchSettings());
</script>

<template>
	<div class="w-full relative">
		<div class="flex items-center justify-between mb-6">
			<div class="flex items-center gap-3">
				<UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" to="/scheduler" />
				<h1 class="page__title mb-0">Scheduler Settings</h1>
			</div>
			<UButton color="primary" :loading="saving" @click="saveSettings">Save Changes</UButton>
		</div>

		<div v-if="loading" class="text-center py-12">
			<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mx-auto text-gray-400" />
		</div>

		<div v-else class="page__inner">
			<UTabs v-model="activeTab" :items="tabs" orientation="vertical" :ui="{ wrapper: 'flex gap-6' }">
				<template #default="{ item }">
					<div class="flex items-center gap-2">
						<UIcon :name="item.icon" class="w-4 h-4" />
						<span>{{ item.label }}</span>
					</div>
				</template>

				<template #item="{ item }">
					<UCard class="flex-1">
						<!-- General -->
						<div v-if="item.key === 'general'" class="space-y-6">
							<h2 class="text-lg font-semibold">General Settings</h2>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<UFormGroup label="Default Duration">
									<USelect v-model="form.default_duration" :options="durationOptions" />
								</UFormGroup>
								<UFormGroup label="Default Meeting Type">
									<USelect v-model="form.default_meeting_type" :options="meetingTypeOptions" />
								</UFormGroup>
								<UFormGroup label="Buffer Before (min)">
									<UInput v-model.number="form.buffer_before" type="number" min="0" max="60" />
								</UFormGroup>
								<UFormGroup label="Buffer After (min)">
									<UInput v-model.number="form.buffer_after" type="number" min="0" max="60" />
								</UFormGroup>
								<UFormGroup label="Timezone">
									<USelect v-model="form.timezone" :options="timezoneOptions" />
								</UFormGroup>
							</div>
						</div>

						<!-- Availability -->
						<div v-else-if="item.key === 'availability'" class="space-y-6">
							<div class="flex items-center justify-between">
								<h2 class="text-lg font-semibold">Availability</h2>
								<UButton color="primary" size="sm" :loading="saving" @click="saveAvailability">Save Availability</UButton>
							</div>
							<div class="space-y-4">
								<div v-for="day in weekDays" :key="day.value" class="flex items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-800">
									<div class="w-28">
										<UCheckbox v-model="availability[day.value].enabled" :label="day.label" />
									</div>
									<template v-if="availability[day.value]?.enabled">
										<UInput v-model="availability[day.value].start" type="time" class="w-28" size="sm" />
										<span class="text-gray-400">to</span>
										<UInput v-model="availability[day.value].end" type="time" class="w-28" size="sm" />
										<span class="text-gray-400 ml-4">Break:</span>
										<UInput v-model="availability[day.value].breakStart" type="time" class="w-24" size="sm" placeholder="Start" />
										<span class="text-gray-400">-</span>
										<UInput v-model="availability[day.value].breakEnd" type="time" class="w-24" size="sm" placeholder="End" />
									</template>
									<span v-else class="text-gray-400 text-sm">Unavailable</span>
								</div>
							</div>
						</div>

						<!-- Booking Page -->
						<div v-else-if="item.key === 'booking'" class="space-y-6">
							<h2 class="text-lg font-semibold">Booking Page</h2>
							<UFormGroup label="Enable Public Booking">
								<UToggle v-model="form.public_booking_enabled" />
							</UFormGroup>
							<UFormGroup label="Booking Page URL">
								<div class="flex gap-2">
									<UInput :model-value="bookingUrl" readonly class="flex-1" />
									<UButton color="gray" icon="i-heroicons-clipboard" @click="copyBookingLink" />
									<UButton color="gray" icon="i-heroicons-arrow-top-right-on-square" :to="bookingUrl" target="_blank" />
								</div>
							</UFormGroup>
							<UFormGroup label="Custom URL Slug" hint="Leave empty to use your user ID">
								<UInput v-model="form.booking_page_slug" placeholder="your-custom-slug" />
							</UFormGroup>
							<UFormGroup label="Page Title">
								<UInput v-model="form.booking_page_title" placeholder="Schedule a meeting with me" />
							</UFormGroup>
							<UFormGroup label="Page Description">
								<UTextarea v-model="form.booking_page_description" placeholder="Brief description" rows="3" />
							</UFormGroup>
						</div>

						<!-- Calendar Sync -->
						<div v-else-if="item.key === 'calendar'" class="space-y-6">
							<h2 class="text-lg font-semibold">Calendar Integrations</h2>
							<p class="text-sm text-gray-500">Connect your calendars to sync events and block busy times.</p>
							
							<!-- Google Calendar -->
							<div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<div class="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
											<UIcon name="i-simple-icons-google" class="w-5 h-5 text-red-500" />
										</div>
										<div>
											<div class="font-medium">Google Calendar</div>
											<div class="text-sm text-gray-500">{{ form.google_calendar_enabled ? 'Connected' : 'Not connected' }}</div>
										</div>
									</div>
									<UButton v-if="!form.google_calendar_enabled" color="gray" @click="connectGoogle">Connect</UButton>
									<UButton v-else color="red" variant="soft" @click="disconnectGoogle">Disconnect</UButton>
								</div>
								<div v-if="form.google_calendar_enabled" class="mt-4">
									<UFormGroup label="Calendar ID">
										<UInput v-model="form.google_calendar_id" placeholder="primary" />
									</UFormGroup>
								</div>
							</div>
							
							<!-- Outlook Calendar -->
							<div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<div class="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
											<UIcon name="i-simple-icons-microsoftoutlook" class="w-5 h-5 text-blue-500" />
										</div>
										<div>
											<div class="font-medium">Outlook Calendar</div>
											<div class="text-sm text-gray-500">{{ form.outlook_calendar_enabled ? 'Connected' : 'Not connected' }}</div>
										</div>
									</div>
									<UButton v-if="!form.outlook_calendar_enabled" color="gray" @click="connectOutlook">Connect</UButton>
									<UButton v-else color="red" variant="soft" @click="disconnectOutlook">Disconnect</UButton>
								</div>
							</div>
						</div>

						<!-- Notifications -->
						<div v-else-if="item.key === 'notifications'" class="space-y-6">
							<h2 class="text-lg font-semibold">Notifications</h2>
							<UFormGroup label="Send Confirmation Emails" hint="Send email when a meeting is booked">
								<UToggle v-model="form.send_confirmations" />
							</UFormGroup>
							<UFormGroup label="Send Reminder Emails" hint="Send reminder before meetings">
								<UToggle v-model="form.send_reminders" />
							</UFormGroup>
							<UFormGroup v-if="form.send_reminders" label="Reminder Time">
								<USelect v-model="form.reminder_time" :options="reminderOptions" />
							</UFormGroup>
						</div>
					</UCard>
				</template>
			</UTabs>
		</div>
	</div>
</template>

<style scoped>
.page__title { @apply text-2xl font-bold; }
.page__inner { @apply w-full; }
</style>

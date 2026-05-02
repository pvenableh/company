<!-- pages/scheduler/settings.vue -->
<script setup>
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Scheduler Settings | Earnest' });

const { user } = useDirectusAuth();
const toast = useToast();

// State
const saving = ref(false);
const activeTab = ref(0);

// Realtime subscription for scheduler_settings
const {
	data: settingsData,
	error: settingsError,
	refresh: refreshSettings,
} = useRealtimeSubscription('scheduler_settings', ['*'], { user_id: { _eq: user.value?.id } });

// Realtime subscription for availability
const {
	data: availabilityData,
	error: availabilityError,
	refresh: refreshAvailability,
} = useRealtimeSubscription('availability', ['*'], { user_id: { _eq: user.value?.id } });

// Initialize availability with defaults for all days
const availability = ref({
	monday: { enabled: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	tuesday: { enabled: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	wednesday: { enabled: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	thursday: { enabled: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	friday: { enabled: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	saturday: { enabled: false, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	sunday: { enabled: false, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
});

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

// Form with defaults
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
	ical_feed_token: '',
});

// Computed
const loading = computed(() => !settingsData.value && !settingsError.value);

const settings = computed(() => settingsData.value?.[0] || null);

const bookingUrl = computed(() => {
	const config = useRuntimeConfig();
	const baseUrl = config.public.siteUrl || (import.meta.client ? window.location.origin : '');
	const slug = form.booking_page_slug || user.value?.id;
	return `${baseUrl}/book/${slug}`;
});

const icalFeedUrl = computed(() => {
	const baseUrl = useRuntimeConfig().public.siteUrl || (import.meta.client ? window.location.origin : '');
	const token = form.ical_feed_token || 'no-token';
	return `${baseUrl}/api/calendar/ical/${user.value?.id}?token=${token}`;
});

const copyICalUrl = async () => {
	await navigator.clipboard.writeText(icalFeedUrl.value);
	toast.add({ title: 'iCal feed URL copied!', color: 'green', icon: 'i-heroicons-clipboard-document-check' });
};

const regenerateICalToken = async () => {
	const newToken = crypto.randomUUID();
	form.ical_feed_token = newToken;
	await saveSettings();
	toast.add({ title: 'Feed token regenerated', description: 'Share the new URL with your calendar apps.', color: 'green' });
};

// Watch for settings changes and update form
watch(
	settings,
	(newSettings) => {
		if (newSettings) {
			Object.keys(form).forEach((key) => {
				if (newSettings[key] !== undefined && newSettings[key] !== null) {
					form[key] = newSettings[key];
				}
			});
		}
	},
	{ immediate: true },
);

// Watch for availability changes
watch(
	availabilityData,
	(newData) => {
		if (newData && newData.length > 0) {
			weekDays.forEach((day) => {
				const dayData = newData.find((a) => a.day_of_week?.toLowerCase() === day.value);
				if (dayData) {
					availability.value[day.value] = {
						enabled: dayData.is_available !== false,
						start: dayData.start_time?.substring(0, 5) || '09:00',
						end: dayData.end_time?.substring(0, 5) || '17:00',
						breakStart: dayData.break_start?.substring(0, 5) || '',
						breakEnd: dayData.break_end?.substring(0, 5) || '',
					};
				}
			});
		}
	},
	{ immediate: true },
);

// Watch for errors
watch(settingsError, (error) => {
	if (error) {
		console.warn('Settings subscription error:', error);
	}
});

watch(availabilityError, (error) => {
	if (error) {
		console.warn('Availability subscription error:', error);
	}
});

// Methods
const schedulerSettingsItems = useDirectusItems('scheduler_settings');
const availabilityItems = useDirectusItems('availability');

const saveSettings = async () => {
	saving.value = true;
	try {
		// First, check if we have settings from subscription
		let existingSettingsId = settings.value?.id;

		// If not loaded yet, fetch directly from Directus to check
		if (!existingSettingsId) {
			const existingSettings = await schedulerSettingsItems.list({
				filter: { user_id: { _eq: user.value?.id } },
				limit: 1,
			});

			if (existingSettings && existingSettings.length > 0) {
				existingSettingsId = existingSettings[0].id;
			}
		}

		if (existingSettingsId) {
			// UPDATE existing settings
			await schedulerSettingsItems.update(existingSettingsId, { ...form });
		} else {
			// CREATE new settings (only if none exist)
			await schedulerSettingsItems.create({
				user_id: user.value?.id,
				...form,
			});
		}

		toast.add({ title: 'Settings saved', color: 'green' });
		refreshSettings();
	} catch (error) {
		console.error('Error saving settings:', error);
		toast.add({ title: 'Error saving settings', description: error.message, color: 'red' });
	}
	saving.value = false;
};

const saveAvailability = async () => {
	saving.value = true;
	try {
		// Delete existing availability for this user
		if (availabilityData.value?.length) {
			for (const item of availabilityData.value) {
				await availabilityItems.remove(item.id);
			}
		}

		// Create new records
		const dayMapping = {
			monday: 'Monday',
			tuesday: 'Tuesday',
			wednesday: 'Wednesday',
			thursday: 'Thursday',
			friday: 'Friday',
			saturday: 'Saturday',
			sunday: 'Sunday',
		};

		for (const [day, data] of Object.entries(availability.value)) {
			if (data.enabled) {
				await availabilityItems.create({
					user_id: user.value?.id,
					day_of_week: dayMapping[day],
					start_time: data.start + ':00',
					end_time: data.end + ':00',
					is_available: true,
					break_start: data.breakStart ? data.breakStart + ':00' : null,
					break_end: data.breakEnd ? data.breakEnd + ':00' : null,
					recurring: true,
				});
			}
		}

		toast.add({ title: 'Availability saved', color: 'green' });
		refreshAvailability();
	} catch (error) {
		console.error('Error saving availability:', error);
		toast.add({ title: 'Error saving availability', description: error.message, color: 'red' });
	}
	saving.value = false;
};

const connectGoogle = async () => {
	try {
		const response = await $fetch('/api/calendar/google/auth-url');
		window.location.href = response.url;
	} catch (error) {
		toast.add({
			title: 'Google Calendar not configured',
			description: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
			color: 'yellow',
		});
	}
};

const disconnectGoogle = async () => {
	try {
		await $fetch('/api/calendar/google/disconnect', { method: 'POST' });
		form.google_calendar_enabled = false;
		form.google_calendar_id = '';
		refreshSettings();
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
		toast.add({
			title: 'Outlook not configured',
			description: 'Set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET',
			color: 'yellow',
		});
	}
};

const disconnectOutlook = async () => {
	try {
		await $fetch('/api/calendar/outlook/disconnect', { method: 'POST' });
		form.outlook_calendar_enabled = false;
		refreshSettings();
		toast.add({ title: 'Outlook disconnected', color: 'green' });
	} catch (error) {
		toast.add({ title: 'Error disconnecting', color: 'red' });
	}
};

const copyBookingLink = async () => {
	await navigator.clipboard.writeText(bookingUrl.value);
	toast.add({ title: 'Link copied', color: 'green' });
};

// Check URL params for OAuth callback status
onMounted(() => {
	const route = useRoute();
	if (route.query.google === 'connected') {
		toast.add({ title: 'Google Calendar connected!', color: 'green' });
		form.google_calendar_enabled = true;
	}
	if (route.query.outlook === 'connected') {
		toast.add({ title: 'Outlook Calendar connected!', color: 'green' });
		form.outlook_calendar_enabled = true;
	}
	if (route.query.error) {
		toast.add({ title: 'Connection failed', description: route.query.error, color: 'red' });
	}
});
</script>

<template>
	<LayoutPageContainer>
		<div class="flex items-center justify-between mb-6">
			<div class="flex items-center gap-3">
				<UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" to="/scheduler" />
				<h1 class="text-2xl font-bold">Scheduler Settings</h1>
			</div>
			<UButton color="primary" :loading="saving" @click="saveSettings">Save Changes</UButton>
		</div>

		<div v-if="loading" class="text-center py-12">
			<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
			<p class="text-sm text-muted-foreground mt-2">Loading settings...</p>
		</div>

		<div v-else class="flex gap-6">
			<!-- Vertical Tab Navigation -->
			<UTabs v-model="activeTab" :items="tabs" orientation="vertical" class="w-48 flex-shrink-0" />

			<!-- Tab Content -->
			<UCard class="flex-1">
				<!-- General -->
				<div v-if="activeTab === 0" class="space-y-6">
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
				<div v-else-if="activeTab === 1" class="space-y-6">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-semibold">Availability</h2>
						<UButton color="primary" size="sm" :loading="saving" @click="saveAvailability">Save Availability</UButton>
					</div>
					<div class="space-y-4">
						<div
							v-for="day in weekDays"
							:key="day.value"
							class="flex items-center gap-4 py-3 border-b border-border"
						>
							<div class="w-28">
								<UCheckbox v-model="availability[day.value].enabled" :label="day.label" />
							</div>
							<template v-if="availability[day.value].enabled">
								<UInput v-model="availability[day.value].start" type="time" class="w-28" size="sm" />
								<span class="text-muted-foreground">to</span>
								<UInput v-model="availability[day.value].end" type="time" class="w-28" size="sm" />
								<span class="text-muted-foreground ml-4">Break:</span>
								<UInput
									v-model="availability[day.value].breakStart"
									type="time"
									class="w-24"
									size="sm"
									placeholder="Start"
								/>
								<span class="text-muted-foreground">-</span>
								<UInput
									v-model="availability[day.value].breakEnd"
									type="time"
									class="w-24"
									size="sm"
									placeholder="End"
								/>
							</template>
							<span v-else class="text-muted-foreground text-sm">Unavailable</span>
						</div>
					</div>
				</div>

				<!-- Booking Page -->
				<div v-else-if="activeTab === 2" class="space-y-6">
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
				<div v-else-if="activeTab === 3" class="space-y-6">
					<h2 class="text-lg font-semibold">Calendar Integrations</h2>
					<p class="text-sm text-muted-foreground">Connect your calendars to sync events and block busy times.</p>

					<!-- Google Calendar -->
					<div class="p-4 border border-border rounded-lg">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
									<UIcon name="i-simple-icons-google" class="w-5 h-5 text-red-500" />
								</div>
								<div>
									<div class="font-medium">Google Calendar</div>
									<div class="text-sm" :class="form.google_calendar_enabled ? 'text-green-500' : 'text-muted-foreground'">
										{{ form.google_calendar_enabled ? 'Connected' : 'Not connected' }}
									</div>
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
					<div class="p-4 border border-border rounded-lg">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
									<UIcon name="i-simple-icons-microsoftoutlook" class="w-5 h-5 text-blue-500" />
								</div>
								<div>
									<div class="font-medium">Outlook Calendar</div>
									<div class="text-sm" :class="form.outlook_calendar_enabled ? 'text-green-500' : 'text-muted-foreground'">
										{{ form.outlook_calendar_enabled ? 'Connected' : 'Not connected' }}
									</div>
								</div>
							</div>
							<UButton v-if="!form.outlook_calendar_enabled" color="gray" @click="connectOutlook">Connect</UButton>
							<UButton v-else color="red" variant="soft" @click="disconnectOutlook">Disconnect</UButton>
						</div>
					</div>

					<!-- iCal Feed -->
					<div class="p-4 border border-border rounded-lg">
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-3">
								<div class="w-10 h-10 bg-violet-50 dark:bg-violet-900/20 rounded-lg flex items-center justify-center">
									<UIcon name="i-heroicons-rss" class="w-5 h-5 text-violet-500" />
								</div>
								<div>
									<div class="font-medium">iCal Feed</div>
									<div class="text-sm text-muted-foreground">Subscribe from any calendar app</div>
								</div>
							</div>
						</div>
						<p class="text-xs text-muted-foreground mb-3">
							Use this URL to subscribe to your Earnest calendar from Apple Calendar, Google Calendar, or any other app that supports iCal feeds.
						</p>
						<div class="flex gap-2 mb-2">
							<UInput :model-value="icalFeedUrl" readonly size="sm" class="flex-1 text-xs font-mono" />
							<UButton size="sm" color="gray" icon="i-heroicons-clipboard" @click="copyICalUrl">Copy</UButton>
						</div>
						<UButton size="xs" color="gray" variant="soft" @click="regenerateICalToken">
							Regenerate Token
						</UButton>
						<p class="text-[10px] text-muted-foreground mt-2">
							Regenerating the token will invalidate the previous URL. Anyone subscribed with the old URL will need the new one.
						</p>
					</div>
				</div>

				<!-- Notifications -->
				<div v-else-if="activeTab === 4" class="space-y-6">
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
		</div>
	</LayoutPageContainer>
</template>

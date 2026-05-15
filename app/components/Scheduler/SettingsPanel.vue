<!--
  SchedulerSettingsPanel — extracted body of /scheduler/settings.vue, reusable
  from both the page (full-page) and from a slide-over launched off the
  scheduler hub gear button.

  The component owns its own floor state. Hosts can:
    - Pass `:initial-floor` to deep-link into a specific floor.
    - Listen to `@update:floor` if they want to mirror state back to a URL
      query (the standalone page does this; the slide-over does not).

  The savebar is rendered inside the panel because both hosts want the
  same save UX. In the page it stays fixed to the viewport bottom; in the
  slide-over it docks at the bottom of the panel via the `:in-overlay`
  prop, which switches the savebar from fixed (viewport-anchored) to
  sticky (panel-anchored).
-->
<script setup>
import { Button } from '~/components/ui/button';

const props = defineProps({
	initialFloor: { type: String, default: 'general' },
	/** When `true`, savebar is sticky to the panel (slide-over use). When
	 *  `false` (default), savebar is fixed to the viewport (page use). */
	inOverlay: { type: Boolean, default: false },
});

const emit = defineEmits(['update:floor']);

const { user } = useDirectusAuth();
const { currentOrg } = useOrganization();
const toast = useToast();
const route = useRoute();

// ── Floor strip ─────────────────────────────────────────────────────────────
const FLOOR_KEYS = ['general', 'event-types', 'availability', 'booking', 'calendar', 'notifications'];

const initialFloor = FLOOR_KEYS.includes(props.initialFloor) ? props.initialFloor : 'general';
const floor = ref(initialFloor);

watch(floor, (next) => emit('update:floor', next));

const floors = [
	{ key: 'general', label: 'General', icon: 'lucide:settings' },
	{ key: 'event-types', label: 'Event Types', icon: 'lucide:layers' },
	{ key: 'availability', label: 'Availability', icon: 'lucide:clock' },
	{ key: 'booking', label: 'Booking Page', icon: 'lucide:link' },
	{ key: 'calendar', label: 'Calendar Sync', icon: 'lucide:calendar' },
	{ key: 'notifications', label: 'Notifications', icon: 'lucide:bell' },
];

// ── Settings state ──────────────────────────────────────────────────────────
const saving = ref(false);

const {
	data: settingsData,
	error: settingsError,
	refresh: refreshSettings,
} = useRealtimeSubscription('scheduler_settings', ['*'], { user_id: { _eq: user.value?.id } });

const {
	data: availabilityData,
	error: availabilityError,
	refresh: refreshAvailability,
} = useRealtimeSubscription('availability', ['*'], { user_id: { _eq: user.value?.id } });

const availability = ref({
	monday: { enabled: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	tuesday: { enabled: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	wednesday: { enabled: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	thursday: { enabled: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	friday: { enabled: true, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	saturday: { enabled: false, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
	sunday: { enabled: false, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' },
});

const durationOptions = [
	{ label: '15 minutes', value: 15 },
	{ label: '30 minutes', value: 30 },
	{ label: '45 minutes', value: 45 },
	{ label: '60 minutes', value: 60 },
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

const form = reactive({
	default_duration: 30,
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

const loading = computed(() => !settingsData.value && !settingsError.value);
const settings = computed(() => settingsData.value?.[0] || null);

const bookingUrl = computed(() => {
	const config = useRuntimeConfig();
	const baseUrl = config.public.siteUrl || (import.meta.client ? window.location.origin : '');
	const orgSlug = currentOrg.value?.slug;
	const userSlug = form.booking_page_slug || user.value?.id;
	if (!orgSlug) return `${baseUrl}/book/—/${userSlug}`;
	return `${baseUrl}/book/${orgSlug}/${userSlug}`;
});

const bookingUrlReady = computed(() => !!currentOrg.value?.slug);

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

watch(settingsError, (error) => {
	if (error) console.warn('Settings subscription error:', error);
});
watch(availabilityError, (error) => {
	if (error) console.warn('Availability subscription error:', error);
});

const schedulerSettingsItems = useDirectusItems('scheduler_settings');
const availabilityItems = useDirectusItems('availability');
const eventTypeItems = useDirectusItems('event_types');

// ── Event Types CRUD ───────────────────────────────────────────────────────
const eventTypes = ref([]);
const eventTypesLoading = ref(false);
const eventTypeModalOpen = ref(false);
const editingEventType = ref(null);
const copiedUrlFor = ref(null);

const loadEventTypes = async () => {
	if (!user.value?.id) return;
	eventTypesLoading.value = true;
	try {
		const rows = await eventTypeItems.list({
			filter: { host_user: { _eq: user.value.id } },
			sort: ['sort', 'title'],
			limit: -1,
		});
		eventTypes.value = rows || [];
	} catch (err) {
		console.error('Error loading event types:', err);
	}
	eventTypesLoading.value = false;
};

const openNewEventTypeModal = () => {
	editingEventType.value = null;
	eventTypeModalOpen.value = true;
};

const openEditEventTypeModal = (et) => {
	editingEventType.value = et;
	eventTypeModalOpen.value = true;
};

const copyEventTypeUrl = async (et) => {
	const config = useRuntimeConfig();
	const baseUrl = config.public.siteUrl || (import.meta.client ? window.location.origin : '');
	const orgSlug = currentOrg.value?.slug;
	const userSlugPart = form.booking_page_slug || user.value?.id;
	const url = `${baseUrl}/book/${orgSlug || '—'}/${userSlugPart}/${et.slug}`;
	try {
		await navigator.clipboard.writeText(url);
		copiedUrlFor.value = et.id;
		toast.add({ title: 'Link copied', description: url, color: 'green' });
		setTimeout(() => { if (copiedUrlFor.value === et.id) copiedUrlFor.value = null; }, 1500);
	} catch {
		toast.add({ title: 'Copy failed', color: 'red' });
	}
};

const onEventTypeCreated = (et) => {
	if (et.is_default) {
		eventTypes.value = eventTypes.value.map((x) => ({ ...x, is_default: false }));
	}
	eventTypes.value = [...eventTypes.value, et];
	loadEventTypes();
};
const onEventTypeUpdated = (et) => {
	if (et.is_default) {
		eventTypes.value = eventTypes.value.map((x) => x.id === et.id ? et : { ...x, is_default: false });
	} else {
		eventTypes.value = eventTypes.value.map((x) => x.id === et.id ? et : x);
	}
	loadEventTypes();
};
const onEventTypeDeleted = (id) => {
	eventTypes.value = eventTypes.value.filter((x) => x.id !== id);
};

watch(() => user.value?.id, (id) => { if (id) loadEventTypes(); }, { immediate: true });

const saveSettings = async () => {
	saving.value = true;
	try {
		let existingSettingsId = settings.value?.id;
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
			await schedulerSettingsItems.update(existingSettingsId, { ...form });
		} else {
			await schedulerSettingsItems.create({ user_id: user.value?.id, ...form });
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
		if (availabilityData.value?.length) {
			for (const item of availabilityData.value) {
				await availabilityItems.remove(item.id);
			}
		}
		const dayMapping = {
			monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
			thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
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
	} catch {
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
	} catch {
		toast.add({ title: 'Error disconnecting', color: 'red' });
	}
};

const connectOutlook = async () => {
	try {
		const response = await $fetch('/api/calendar/outlook/auth-url');
		window.location.href = response.url;
	} catch {
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
	} catch {
		toast.add({ title: 'Error disconnecting', color: 'red' });
	}
};

const copyBookingLink = async () => {
	await navigator.clipboard.writeText(bookingUrl.value);
	toast.add({ title: 'Link copied', color: 'green' });
};

const embedEventTypeSlug = ref('');
const embedColor = ref('#6366F1');
const embedLabel = ref('Book a call');

watch(eventTypes, (rows) => {
	if (!embedEventTypeSlug.value) {
		const def = (rows || []).find((r) => r.is_default);
		embedEventTypeSlug.value = def?.slug || '';
	}
}, { immediate: true });

const embedSnippet = computed(() => {
	const config = useRuntimeConfig();
	const baseUrl = config.public.siteUrl || (import.meta.client ? window.location.origin : '');
	const orgSlug = currentOrg.value?.slug || 'YOUR_ORG';
	const userSlugPart = form.booking_page_slug || user.value?.id || 'YOUR_USER';
	const attrs = [
		`src="${baseUrl}/embed.js"`,
		`data-org="${orgSlug}"`,
		`data-user="${userSlugPart}"`,
	];
	if (embedEventTypeSlug.value) attrs.push(`data-event="${embedEventTypeSlug.value}"`);
	if (embedLabel.value) attrs.push(`data-label="${embedLabel.value.replace(/"/g, '&quot;')}"`);
	if (embedColor.value) attrs.push(`data-color="${embedColor.value}"`);
	attrs.push('async');
	return `<script ${attrs.join(' ')}><\/script>`;
});

const copyEmbedSnippet = async () => {
	await navigator.clipboard.writeText(embedSnippet.value);
	toast.add({ title: 'Snippet copied', color: 'green' });
};

onMounted(() => {
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
	<AppSlideOverPanel :padded="!inOverlay">
		<template #header>
			<AppFloorStrip v-model="floor" :items="floors" aria-label="Scheduler settings sections" />
		</template>

		<div v-if="loading" class="flex flex-col items-center justify-center py-16 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-sm text-muted-foreground">Loading settings…</p>
		</div>

		<template v-else>
			<!-- General ─────────────────────────────────────────────── -->
			<template v-if="floor === 'general'">
				<div class="ios-card p-5 space-y-5 max-w-3xl">
					<div>
						<h2 class="text-base font-semibold text-foreground">Defaults</h2>
						<p class="text-xs text-muted-foreground mt-0.5">
							Applied to new meetings when nothing else is specified.
						</p>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<UFormGroup label="Default Duration">
							<USelect v-model="form.default_duration" :options="durationOptions" />
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
					<div class="flex justify-end pt-3 border-t border-border/30">
						<Button size="sm" :disabled="saving" @click="saveSettings">
							<Icon v-if="saving" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
							{{ saving ? 'Saving…' : 'Save changes' }}
						</Button>
					</div>
				</div>
			</template>

			<template v-if="floor === 'event-types'">
				<div class="space-y-3 max-w-3xl">
					<div class="flex items-start justify-between gap-4">
						<div>
							<h2 class="text-base font-semibold text-foreground">Event types</h2>
							<p class="text-xs text-muted-foreground mt-0.5">
								Each event type is a bookable URL. The default loads when visitors hit your bare booking page.
							</p>
						</div>
						<Button size="sm" @click="openNewEventTypeModal">
							<Icon name="lucide:plus" class="w-4 h-4 mr-1" /> New event type
						</Button>
					</div>

					<div v-if="eventTypesLoading" class="ios-card p-8 text-center">
						<Icon name="lucide:loader-2" class="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
					</div>
					<div v-else-if="eventTypes.length === 0" class="ios-card p-8 text-center">
						<Icon name="lucide:layers" class="w-8 h-8 text-muted-foreground mx-auto mb-2" />
						<p class="text-sm font-medium">No event types yet</p>
						<p class="text-xs text-muted-foreground mt-1">
							Create one above, or run <code>pnpm tsx scripts/setup-event-types.ts</code> to seed defaults.
						</p>
					</div>
					<div v-else class="space-y-2">
						<div
							v-for="et in eventTypes"
							:key="et.id"
							class="ios-card p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition"
							@click="openEditEventTypeModal(et)"
						>
							<span
								class="w-3 h-3 rounded-full shrink-0"
								:style="{ background: et.color || 'var(--primary)' }"
							/>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="font-medium text-sm">{{ et.title }}</span>
									<span class="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-muted text-muted-foreground font-mono">{{ et.slug }}</span>
									<span class="text-xs text-muted-foreground">· {{ et.duration }} min</span>
									<span v-if="et.is_default" class="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-primary/15 text-primary">Default</span>
									<span v-if="!et.enabled" class="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-600">Paused</span>
								</div>
								<p v-if="et.description" class="text-xs text-muted-foreground mt-0.5 truncate">{{ et.description }}</p>
							</div>
							<div class="flex items-center gap-1 shrink-0" @click.stop>
								<Button
									variant="ghost"
									size="icon-sm"
									:title="copiedUrlFor === et.id ? 'Copied!' : 'Copy booking URL'"
									@click="copyEventTypeUrl(et)"
								>
									<Icon :name="copiedUrlFor === et.id ? 'lucide:check' : 'lucide:link'" class="w-3.5 h-3.5" />
								</Button>
								<Button variant="ghost" size="icon-sm" title="Edit" @click="openEditEventTypeModal(et)">
									<Icon name="lucide:pencil" class="w-3.5 h-3.5" />
								</Button>
							</div>
						</div>
					</div>

					<SchedulerEventTypeFormModal
						v-model="eventTypeModalOpen"
						:event-type="editingEventType"
						:all-event-types="eventTypes"
						@created="onEventTypeCreated"
						@updated="onEventTypeUpdated"
						@deleted="onEventTypeDeleted"
					/>
				</div>
			</template>

			<!-- Availability ─────────────────────────────────────────── -->
			<template v-if="floor === 'availability'">
				<div class="ios-card p-5 space-y-4 max-w-3xl">
					<div>
						<h2 class="text-base font-semibold text-foreground">Weekly availability</h2>
						<p class="text-xs text-muted-foreground mt-0.5">
							Hours your booking page offers slots within. Toggle a day off to block it entirely.
						</p>
					</div>
					<div class="space-y-1">
						<div
							v-for="day in weekDays"
							:key="day.value"
							class="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-b-0 flex-wrap"
						>
							<div class="w-28 shrink-0">
								<UCheckbox v-model="availability[day.value].enabled" :label="day.label" />
							</div>
							<template v-if="availability[day.value].enabled">
								<UInput v-model="availability[day.value].start" type="time" class="w-28" size="sm" />
								<span class="text-muted-foreground text-xs">to</span>
								<UInput v-model="availability[day.value].end" type="time" class="w-28" size="sm" />
								<span class="text-muted-foreground text-xs ml-2">Break:</span>
								<UInput
									v-model="availability[day.value].breakStart"
									type="time"
									class="w-24"
									size="sm"
									placeholder="Start"
								/>
								<span class="text-muted-foreground text-xs">–</span>
								<UInput
									v-model="availability[day.value].breakEnd"
									type="time"
									class="w-24"
									size="sm"
									placeholder="End"
								/>
							</template>
							<span v-else class="text-muted-foreground text-xs">Unavailable</span>
						</div>
					</div>
					<div class="flex justify-end pt-3 border-t border-border/30">
						<Button size="sm" :disabled="saving" @click="saveAvailability">
							<Icon v-if="saving" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
							{{ saving ? 'Saving…' : 'Save availability' }}
						</Button>
					</div>
				</div>
			</template>

			<!-- Booking Page ─────────────────────────────────────────── -->
			<template v-if="floor === 'booking'">
				<div class="ios-card p-5 space-y-5 max-w-3xl">
					<div class="flex items-start justify-between gap-4">
						<div>
							<h2 class="text-base font-semibold text-foreground">Booking page</h2>
							<p class="text-xs text-muted-foreground mt-0.5">
								Your public scheduling page that clients can use to book meetings.
							</p>
						</div>
						<UFormGroup label="Enable">
							<UToggle v-model="form.public_booking_enabled" />
						</UFormGroup>
					</div>

					<UFormGroup label="Booking page URL" :hint="bookingUrlReady ? null : 'Pick an active organization to generate a URL'">
						<div class="flex gap-2">
							<UInput :model-value="bookingUrl" readonly class="flex-1 font-mono text-xs" />
							<UButton color="gray" icon="i-heroicons-clipboard" :disabled="!bookingUrlReady" @click="copyBookingLink" />
							<UButton color="gray" icon="i-heroicons-arrow-top-right-on-square" :disabled="!bookingUrlReady" :to="bookingUrlReady ? bookingUrl : undefined" target="_blank" />
						</div>
					</UFormGroup>
					<UFormGroup label="Custom URL slug" hint="The user portion of the URL. Leave empty to use your user ID. Org slug is set in Organization settings.">
						<UInput v-model="form.booking_page_slug" placeholder="your-custom-slug" />
					</UFormGroup>
					<UFormGroup label="Page title">
						<UInput v-model="form.booking_page_title" placeholder="Schedule a meeting with me" />
					</UFormGroup>
					<UFormGroup label="Page description">
						<UTextarea v-model="form.booking_page_description" placeholder="Brief description" rows="3" />
					</UFormGroup>
					<div class="flex justify-end pt-3 border-t border-border/30">
						<Button size="sm" :disabled="saving" @click="saveSettings">
							<Icon v-if="saving" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
							{{ saving ? 'Saving…' : 'Save changes' }}
						</Button>
					</div>
				</div>

				<!-- Embed snippet (Stage 5) -->
				<div class="ios-card p-5 space-y-4 max-w-3xl">
					<div>
						<h2 class="text-base font-semibold text-foreground">Embed on your website</h2>
						<p class="text-xs text-muted-foreground mt-0.5">
							Drop this snippet into any page. It auto-renders a "Book a call" button that opens your scheduler in a modal.
						</p>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<UFormGroup label="Event type">
							<select v-model="embedEventTypeSlug" class="w-full rounded-full border bg-background px-3 py-2 text-sm">
								<option value="">Default (host's pick)</option>
								<option v-for="et in eventTypes" :key="et.id" :value="et.slug">{{ et.title }}</option>
							</select>
						</UFormGroup>
						<UFormGroup label="Button label">
							<UInput v-model="embedLabel" placeholder="Book a call" />
						</UFormGroup>
						<UFormGroup label="Accent color">
							<UInput v-model="embedColor" type="color" />
						</UFormGroup>
					</div>
					<div class="flex gap-2">
						<UTextarea
							:model-value="embedSnippet"
							readonly
							:rows="3"
							class="flex-1 font-mono text-xs"
						/>
						<UButton color="gray" icon="i-heroicons-clipboard" @click="copyEmbedSnippet" />
					</div>
					<details class="text-xs text-muted-foreground">
						<summary class="cursor-pointer select-none">Advanced: imperative API</summary>
						<pre class="mt-2 p-3 rounded bg-muted/30 overflow-x-auto whitespace-pre-wrap"><code>// Open the modal manually:
EarnestEmbed.open({ org: '{{ currentOrg?.slug || 'YOUR_ORG' }}', user: '{{ form.booking_page_slug || user?.id || 'YOUR_USER' }}', event: '{{ embedEventTypeSlug || 'optional-slug' }}' });

// Wire any element you've already styled:
&lt;a href="#" data-earnest-book="true"&gt;Book&lt;/a&gt;</code></pre>
					</details>
				</div>
			</template>

			<!-- Calendar Sync ────────────────────────────────────────── -->
			<template v-if="floor === 'calendar'">
				<div class="space-y-4 max-w-3xl">
					<div class="ios-card p-5">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3 min-w-0">
								<div class="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center shrink-0">
									<UIcon name="i-simple-icons-google" class="w-5 h-5 text-red-500" />
								</div>
								<div class="min-w-0">
									<div class="font-medium text-sm">Google Calendar</div>
									<div class="text-xs" :class="form.google_calendar_enabled ? 'text-emerald-500' : 'text-muted-foreground'">
										{{ form.google_calendar_enabled ? 'Connected' : 'Not connected' }}
									</div>
								</div>
							</div>
							<UButton v-if="!form.google_calendar_enabled" color="gray" size="sm" @click="connectGoogle">Connect</UButton>
							<UButton v-else color="red" variant="soft" size="sm" @click="disconnectGoogle">Disconnect</UButton>
						</div>
						<div v-if="form.google_calendar_enabled" class="mt-4">
							<UFormGroup label="Calendar ID">
								<UInput v-model="form.google_calendar_id" placeholder="primary" />
							</UFormGroup>
						</div>
					</div>

					<div class="ios-card p-5">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3 min-w-0">
								<div class="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0">
									<UIcon name="i-simple-icons-microsoftoutlook" class="w-5 h-5 text-blue-500" />
								</div>
								<div class="min-w-0">
									<div class="font-medium text-sm">Outlook Calendar</div>
									<div class="text-xs" :class="form.outlook_calendar_enabled ? 'text-emerald-500' : 'text-muted-foreground'">
										{{ form.outlook_calendar_enabled ? 'Connected' : 'Not connected' }}
									</div>
								</div>
							</div>
							<UButton v-if="!form.outlook_calendar_enabled" color="gray" size="sm" @click="connectOutlook">Connect</UButton>
							<UButton v-else color="red" variant="soft" size="sm" @click="disconnectOutlook">Disconnect</UButton>
						</div>
					</div>

					<div class="ios-card p-5">
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-3">
								<div class="w-10 h-10 bg-violet-50 dark:bg-violet-900/20 rounded-lg flex items-center justify-center">
									<UIcon name="i-heroicons-rss" class="w-5 h-5 text-violet-500" />
								</div>
								<div>
									<div class="font-medium text-sm">iCal feed</div>
									<div class="text-xs text-muted-foreground">Subscribe from any calendar app</div>
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
							Regenerate token
						</UButton>
						<p class="text-[10px] text-muted-foreground mt-2">
							Regenerating the token will invalidate the previous URL. Anyone subscribed with the old URL will need the new one.
						</p>
					</div>
				</div>
			</template>

			<!-- Notifications ────────────────────────────────────────── -->
			<template v-if="floor === 'notifications'">
				<div class="ios-card p-5 space-y-5 max-w-3xl">
					<div>
						<h2 class="text-base font-semibold text-foreground">Email notifications</h2>
						<p class="text-xs text-muted-foreground mt-0.5">
							Pick which transactional emails Earnest sends on your behalf.
						</p>
					</div>
					<UFormGroup label="Send confirmation emails" hint="Send email when a meeting is booked">
						<UToggle v-model="form.send_confirmations" />
					</UFormGroup>
					<UFormGroup label="Send reminder emails" hint="Send reminder before meetings">
						<UToggle v-model="form.send_reminders" />
					</UFormGroup>
					<UFormGroup v-if="form.send_reminders" label="Reminder time">
						<USelect v-model="form.reminder_time" :options="reminderOptions" />
					</UFormGroup>
					<div class="flex justify-end pt-3 border-t border-border/30">
						<Button size="sm" :disabled="saving" @click="saveSettings">
							<Icon v-if="saving" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
							{{ saving ? 'Saving…' : 'Save changes' }}
						</Button>
					</div>
				</div>
			</template>
		</template>

	</AppSlideOverPanel>
</template>

<!--
  No scoped styles needed — layout chrome (sticky header + sticky footer +
  padded body) is delegated to <AppSlideOverPanel>, the reusable shell.
-->

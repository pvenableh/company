<!-- pages/book/[orgSlug]/[userSlug].vue -->
<!--
  Org-scoped public booking page — DEFAULT event type.

  URL: /book/<organizations.slug>/<scheduler_settings.booking_page_slug | user.id>
  Renders the host's `is_default=true` event type directly (skipping the
  picker step). If `?picker=1` is in the URL or the host has no default,
  renders the picker UI from BookingFlow.

  See [eventTypeSlug].vue for the 3-segment specific-event-type route.
-->
<script setup>
definePageMeta({
	layout: 'blank',
	auth: false,
});
useHead({ title: 'Book Appointment | Earnest' });

const route = useRoute();
const toast = useToast();

const orgSlug = computed(() => route.params.orgSlug);
const userSlug = computed(() => route.params.userSlug);

const loading = ref(true);
const data = ref(null);

const showPicker = computed(() => route.query.picker === '1');

const activeEventType = computed(() => {
	if (showPicker.value) return null;
	return data.value?.selectedEventType || null;
});

async function fetchBookingData() {
	loading.value = true;
	try {
		const response = await $fetch(`/api/scheduler/public-booking/${orgSlug.value}/${userSlug.value}`);
		data.value = response;
	} catch (error) {
		toast.add({ title: 'Error loading booking page', description: error?.data?.message || error.message, color: 'red' });
	}
	loading.value = false;
}

onMounted(() => fetchBookingData());
</script>

<template>
	<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
		<div class="bg-white dark:bg-gray-800 border-b border-border">
			<div class="max-w-3xl mx-auto px-4 py-6">
				<div v-if="data?.user" class="flex items-center gap-4">
					<UAvatar :alt="data.user.first_name" size="lg" />
					<div>
						<h1 class="text-xl font-semibold">{{ data.user.first_name }} {{ data.user.last_name }}</h1>
						<p class="text-muted-foreground">{{ data.settings?.booking_page_title || 'Schedule a meeting' }}</p>
						<p v-if="data.organization?.name" class="text-xs text-muted-foreground mt-0.5">{{ data.organization.name }}</p>
					</div>
				</div>
			</div>
		</div>

		<div v-if="loading" class="max-w-3xl mx-auto px-4 py-12 text-center">
			<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
			<p class="text-muted-foreground">Loading...</p>
		</div>

		<div v-else-if="data" class="max-w-3xl mx-auto px-4 py-8">
			<!-- Default route: when no default event type and not in picker mode, show helpful error -->
			<div
				v-if="!activeEventType && !showPicker && (data.eventTypes?.length > 0)"
				class="ios-card p-6 text-center"
			>
				<UIcon name="i-heroicons-exclamation-circle" class="w-10 h-10 text-amber-500 mx-auto mb-3" />
				<h2 class="text-base font-semibold mb-1">No default event type</h2>
				<p class="text-sm text-muted-foreground mb-4">
					{{ data.user?.first_name }} hasn't published a default event type yet.
				</p>
				<UButton :to="`/book/${orgSlug}/${userSlug}?picker=1`" color="primary">
					Choose from {{ data.eventTypes.length }} options
				</UButton>
			</div>

			<SchedulerBookingFlow
				v-else
				:host-user="data.user"
				:host-org="data.organization"
				:settings="data.settings"
				:availability="data.availability || []"
				:existing-meetings="data.meetings || []"
				:event-types="data.eventTypes || []"
				:event-type="activeEventType"
			/>
		</div>

		<div class="text-center py-8 text-sm text-muted-foreground">
			<template v-if="data?.organization?.whitelabel">{{ data.organization.name }}</template>
			<template v-else>Powered by <a href="https://earnest.guru" class="hover:text-foreground">Earnest</a></template>
		</div>
	</div>
</template>

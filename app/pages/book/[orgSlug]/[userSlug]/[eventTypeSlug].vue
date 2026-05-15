<!-- pages/book/[orgSlug]/[userSlug]/[eventTypeSlug].vue -->
<!--
  Org-scoped public booking page — SPECIFIC event type.

  URL: /book/<organizations.slug>/<userSlug>/<event_types.slug>
  Loads the named event type (404 if not found / disabled), then hands off
  to <SchedulerBookingFlow> for intake → time → details → confirmation.
-->
<script setup>
definePageMeta({
	layout: 'blank',
	auth: false,
});

const route = useRoute();
const toast = useToast();

const orgSlug = computed(() => route.params.orgSlug);
const userSlug = computed(() => route.params.userSlug);
const eventTypeSlug = computed(() => route.params.eventTypeSlug);

const loading = ref(true);
const data = ref(null);

useHead({ title: () => data.value?.selectedEventType?.title ? `${data.value.selectedEventType.title} | Earnest` : 'Book Appointment | Earnest' });

async function fetchBookingData() {
	loading.value = true;
	try {
		const response = await $fetch(
			`/api/scheduler/public-booking/${orgSlug.value}/${userSlug.value}`,
			{ query: { eventTypeSlug: eventTypeSlug.value } },
		);
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
			<SchedulerBookingFlow
				:host-user="data.user"
				:host-org="data.organization"
				:settings="data.settings"
				:availability="data.availability || []"
				:existing-meetings="data.meetings || []"
				:event-types="data.eventTypes || []"
				:event-type="data.selectedEventType"
			/>
		</div>

		<div class="text-center py-8 text-sm text-muted-foreground">
			<template v-if="data?.organization?.whitelabel">{{ data.organization.name }}</template>
			<template v-else>Powered by <a href="https://earnest.guru" class="hover:text-foreground">Earnest</a></template>
		</div>
	</div>
</template>

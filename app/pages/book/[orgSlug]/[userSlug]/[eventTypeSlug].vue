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
	<SchedulerBookingPageShell :data="data" :loading="loading">
		<SchedulerBookingFlow
			v-if="data"
			:host-user="data.user"
			:host-org="data.organization"
			:settings="data.settings"
			:availability="data.availability || []"
			:existing-meetings="data.meetings || []"
			:event-types="data.eventTypes || []"
			:event-type="data.selectedEventType"
		/>
	</SchedulerBookingPageShell>
</template>

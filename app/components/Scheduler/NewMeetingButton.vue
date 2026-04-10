<!-- components/Scheduler/NewMeetingButton.vue -->
<!-- Thin wrapper: renders the "+ New Meeting" button and hosts the UnifiedEventModal -->
<script setup>
const emit = defineEmits(['created']);

const showModal = ref(false);

const handleCreated = (data) => {
	emit('created', data);
};
</script>

<template>
	<div>
		<button
			@click="showModal = true"
			class="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-colors ios-press"
		>
			<UIcon name="i-heroicons-plus" class="w-4 h-4" />
			New Meeting
		</button>

		<SchedulerUnifiedEventModal
			v-model="showModal"
			:default-video="true"
			@created="handleCreated"
			@saved="handleCreated"
		/>
	</div>
</template>

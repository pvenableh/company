<!-- components/Scheduler/InstantMeetingButton.vue -->
<script setup>
const emit = defineEmits(['created']);

const schedulerData = inject('schedulerData');
const { user } = schedulerData;

const toast = useToast();
const loading = ref(false);

const createInstantMeeting = async () => {
	loading.value = true;

	try {
		const response = await $fetch('/api/video/create-room', {
			method: 'POST',
			body: {
				title: 'Instant Meeting',
				scheduled_start: new Date().toISOString(),
				duration: 60,
			},
		});

		toast.add({ title: 'Meeting created', color: 'green' });
		window.open(`/meeting/${response.data.roomName}`, '_blank');
		emit('created');
	} catch (error) {
		toast.add({ title: 'Error creating meeting', description: error.message, color: 'red' });
	}

	loading.value = false;
};
</script>

<template>
	<button
		@click="createInstantMeeting"
		:disabled="loading"
		class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold transition-colors ios-press disabled:opacity-50"
	>
		<UIcon v-if="!loading" name="i-heroicons-video-camera" class="w-4 h-4" />
		<UIcon v-else name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
		Start Instant Meeting
	</button>
</template>

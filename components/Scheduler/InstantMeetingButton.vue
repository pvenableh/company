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
	<UButton block color="green" variant="soft" icon="i-heroicons-video-camera" :loading="loading" @click="createInstantMeeting">
		Start Instant Meeting
	</UButton>
</template>

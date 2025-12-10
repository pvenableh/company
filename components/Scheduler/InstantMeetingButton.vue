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
				hostName: `${user.value?.first_name} ${user.value?.last_name}`,
				hostUserId: user.value?.id,
			},
		});
		
		toast.add({ title: 'Meeting created', color: 'green' });
		window.open(`/meeting/${response.room.name}`, '_blank');
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

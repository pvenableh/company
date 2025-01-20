<template>
	<UButton
		:loading="isLoading"
		variant="outline"
		:color="status === 'Approved' ? 'primary' : 'gray'"
		class="transition-colors duration-200"
		@click="handleToggle"
	>
		{{ status }}
	</UButton>
</template>

<script setup>
const props = defineProps({
	initialStatus: {
		type: String,
		default: 'Active',
	},
	itemId: {
		type: String,
		required: true,
	},
});

const emit = defineEmits(['statusChanged']);
const { updateItem } = useDirectusItems();
const status = ref(props.initialStatus);
const isLoading = ref(false);
import confetti from 'canvas-confetti';

function startConfetti(duration = 4000) {
	const end = Date.now() + duration;
	const colors = ['#00bfff', '#0ef62d', '#e8fc00', '#ffcc00', '#ff005c', '#ff00cc', '#502989'];

	function frame() {
		confetti({
			particleCount: 6,
			angle: 60,
			spread: 55,
			origin: { x: 0 },
			colors: colors,
		});
		confetti({
			particleCount: 3,
			angle: 120,
			spread: 55,
			origin: { x: 1 },
			colors: colors,
		});

		if (Date.now() < end) {
			requestAnimationFrame(frame);
		}
	}

	frame();
}

const handleToggle = async () => {
	isLoading.value = true;
	try {
		const newStatus = status.value === 'Active' ? 'Completed' : 'Active';
		console.log(newStatus);
		// Update the item in Directus
		// await updateItem('project_events', props.itemId, {
		// 	status: newStatus,
		// });
		if (newStatus === 'Completed') {
			startConfetti();
		}
		status.value = newStatus;
		emit('statusChanged', newStatus);
	} catch (error) {
		console.error('Error toggling approval:', error);
		// You might want to add error handling with UToast here
	} finally {
		isLoading.value = false;
	}
};
</script>

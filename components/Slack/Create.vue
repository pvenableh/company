<template>
	<div class="create-channel-container">
		<h2 class="text-xl font-bold mb-4">
			Create a New Channel
			<span v-if="project">for {{ project.title }}</span>
			.
		</h2>

		<form @submit.prevent="createChannel" class="space-y-4">
			<!-- Channel Name Input -->
			<div>
				<UFormGroup for="channelName" label="Channel Name">
					<UInput
						v-model="channelName"
						type="text"
						id="channelName"
						placeholder="Enter a channel name"
						:disabled="isLoading"
						required
					/>
				</UFormGroup>
				<p v-if="channelName && !isValidChannelName" class="text-xs text-red-500 mt-1">
					Channel name must be at least 3 characters long.
				</p>
			</div>

			<!-- Create Channel Button -->
			<div>
				<UButton type="submit" :disabled="isLoading || !isValidChannelName" color="primary" :loading="isLoading">
					<span v-if="isLoading">Creating...</span>
					<span v-else>Create Channel</span>
				</UButton>
			</div>
		</form>

		<!-- Success Message -->
		<div v-if="successMessage" class="mt-4 text-green-500">
			<p>{{ successMessage }}</p>
		</div>

		<!-- Error Message -->
		<div v-if="errorMessage" class="mt-4 text-red-500">
			<p>{{ errorMessage }}</p>
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	project: Object,
	default: () => null,
});
// State variables
const channelName = ref('');
const channelSlug = computed(() => slugify(channelName.value));
const isLoading = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

// Directus API (assuming you're using Directus SDK or similar for the backend)
const { createItem } = useDirectusItems();

// Computed property for validating channel name (must be at least 3 characters)
const isValidChannelName = computed(() => channelName.value.length >= 3);

// Function to handle channel creation
const createChannel = async () => {
	if (!isValidChannelName.value) return; // Prevent submission if the name is invalid

	isLoading.value = true;
	successMessage.value = '';
	errorMessage.value = '';

	try {
		// Create a new channel using the Directus API
		await createItem('channels', {
			name: channelSlug.value,
			project: props.project.id,
		});

		// Show success message
		successMessage.value = `Channel "${channelName.value}" has been created successfully.`;

		// Clear input after successful creation
		channelName.value = '';
	} catch (error) {
		// Handle error (e.g., network issues or validation errors from Directus)
		console.error('Error creating channel:', error);
		errorMessage.value = 'Failed to create channel. Please try again.';
	} finally {
		isLoading.value = false;
	}
};
</script>

<style scoped>
.create-channel-container {
	max-width: 400px;
	margin: 0 auto;
	padding: 2rem;
	background-color: white;
	border-radius: 8px;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

button:disabled {
	cursor: not-allowed;
}

input:disabled {
	background-color: #f9f9f9;
	cursor: not-allowed;
}
</style>

<script setup>
// Add project prop
const props = defineProps({
	project: {
		type: Object,
		default: () => null,
	},
});

// Create computed filter that includes project if defined
const channelsFilter = computed(() => {
	const filter = {
		_and: [],
	};

	// Add project filter if project prop is defined
	// Project filter
	if (props.project) {
		filter._and.push({
			project: { _eq: props.project },
		});
	}

	return filter;
});

console.log(channelsFilter.value);

// Update channels subscription to use computed filter
// const {
// 	data: channels,
// 	isLoading: channelsLoading,
// 	error: channelsError,
// 	isConnected: channelsConnected,
// 	refresh: refreshChannels,
// } = useRealtimeSubscription('channels', ['*'], channelsFilter, '-date_updated');

const {
	data: channels,
	isLoading: channelsLoading,
	error: channelsError,
	isConnected: channelsConnected,
	refresh: refreshChannels,
} = useRealtimeSubscription('channels', ['id', 'name', 'messages'], {
	project: { _eq: props.project.id },
});

console.log(channels);

// Computed properties for status
const isFullyConnected = computed(() => channelsConnected.value);
const isLoading = computed(() => channelsLoading.value);
const hasError = computed(() => channelsError.value);

// Refresh function for both subscriptions
const refreshAll = () => {
	refreshChannels();
	// refreshMessages();
};
</script>

<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col relative px-4 pt-20">
		<SlackCreate :project="project" />
		<!-- Connection Status Alerts -->
		<div v-if="!isFullyConnected && !isLoading" class="w-full mb-4">
			<UAlert title="Connection Lost" description="Attempting to reconnect to real-time updates..." color="yellow">
				<template #footer>
					<UButton size="sm" color="yellow" @click="refreshAll">Retry Connection</UButton>
				</template>
			</UAlert>
		</div>

		<!-- Error Alert -->
		<div v-if="hasError" class="w-full mb-4">
			<UAlert title="Error" description="Failed to load channels. Please try again." color="red">
				<template #footer>
					<UButton size="sm" color="red" @click="refreshAll">Retry</UButton>
				</template>
			</UAlert>
		</div>

		<div class="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center z-10 page__inner">
			<!-- Loading State -->
			<div v-if="isLoading" class="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				<div v-for="n in 3" :key="n" class="p-12 shadow-lg">
					<USkeleton class="h-6 w-32" />
				</div>
			</div>

			<!-- Channels Grid -->
			<div v-else class="w-full flex flex-row flex-wrap items-center justify-center">
				<NuxtLink
					v-for="item in channels"
					:key="item.name"
					:to="'/channels/' + item.name"
					class="inline-block p-12 my-6 shadow-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors duration-200 lowercase mx-3 mb-6 rounded-lg"
				>
					#{{ item.name }}
					<UChip :text="item.messages.length" size="2xl">
						<UIcon name="i-heroicons-chat-bubble-left-right" class="w-4 h-4 inline-block" />
					</UChip>
				</NuxtLink>
			</div>
		</div>
	</div>
</template>

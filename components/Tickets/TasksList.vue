<template>
	<div class="task-list-container">
		<!-- Loading State -->
		<ClientOnly>
			<transition name="fade">
				<div
					v-if="isLoading"
					class="absolute inset-0 bg-white/70 dark:bg-gray-800/70 z-50 flex items-center justify-center"
				>
					<LayoutLoader text="Loading Tasks" />
				</div>
			</transition>
		</ClientOnly>

		<!-- Connection Status -->
		<ClientOnly>
			<transition name="fade">
				<div v-if="!isConnected && !isLoading" class="mb-4 absolute right-0 top-0 connection-alert">
					<UAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
						<template #footer>
							<UButton size="sm" color="yellow" @click="refreshTasks">Retry Connection</UButton>
						</template>
					</UAlert>
				</div>
			</transition>
		</ClientOnly>

		<!-- Tasks List -->
		<div v-if="!isLoading" class="space-y-2">
			<!-- Empty State -->
			<div v-if="tasks.length === 0" class="p-4 text-center text-gray-500">
				<UIcon name="i-heroicons-document-text" class="w-12 h-12 mx-auto mb-2 text-gray-300" />
				<p class="text-sm">No tasks found</p>
			</div>

			<!-- Tasks -->
			<div v-else>
				<h3 class="text-xs font-bold uppercase tracking-wide mb-3">
					Tasks ({{ tasks.length }}{{ totalTaskCount > limit ? '+' : '' }})
				</h3>

				<div v-for="task in tasks" :key="task.id" class="task-item">
					<div class="flex items-center space-x-3 group bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm">
						<!-- Loading State for Task Update -->
						<div
							v-if="updatingTasks.has(task.id)"
							class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 rounded-lg flex items-center justify-center z-10"
						>
							<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" />
						</div>

						<!-- Task Checkbox -->
						<UCheckbox :model-value="task.status === 'completed'" @update:model-value="toggleTaskStatus(task.id)" />

						<!-- Task Description -->
						<div class="flex-1">
							<div
								:class="{ 'line-through text-gray-400': task.status === 'completed' }"
								class="text-xs leading-4 inline-block"
								v-html="task.description"
							></div>

							<!-- Ticket Context -->
							<div class="text-[8px] text-gray-500 uppercase mt-1 flex items-center">
								<span class="mr-2">
									From ticket:
									<UButton
										size="xs"
										variant="link"
										color="gray"
										class="!p-0 underline hover:text-blue-500"
										@click="navigateToTicket(task.ticketContext.id)"
									>
										{{ task.ticketContext.title }}
									</UButton>
								</span>

								<!-- Due Date if available -->
								<span v-if="task.ticketContext.due_date" class="mr-2">
									<UIcon name="i-heroicons-calendar" class="w-3 h-3 inline-block" />
									{{ formatDate(task.ticketContext.due_date) }}
								</span>

								<!-- Task Status Badge -->
								<UBadge size="xs" :color="getStatusColor(task.ticketContext.status)" class="uppercase !text-[7px]">
									{{ task.ticketContext.status }}
								</UBadge>
							</div>

							<!-- Last Updated Info -->
							<div
								v-if="task.status === 'completed' && task.date_updated"
								class="text-[8px] text-gray-500 mt-0.5 uppercase"
							>
								Completed {{ formatCompletionDate(task.date_updated) }}
								{{ task.user_updated ? `by ${task.user_updated.first_name}` : '' }}
							</div>
						</div>
					</div>
				</div>

				<!-- Load More Button (if needed) -->
				<div v-if="totalTaskCount > limit" class="text-center mt-4">
					<UButton size="sm" color="gray" variant="soft" @click="loadMore">Load More Tasks</UButton>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	organizationId: {
		type: String,
		default: null,
	},
	teamId: {
		type: String,
		default: null,
	},
	projectId: {
		type: String,
		default: null,
	},
	userId: {
		type: String,
		default: null,
	},
	limit: {
		type: Number,
		default: 20,
	},
});

// Total tasks count for "load more" functionality
const totalTaskCount = ref(0);
const currentLimit = ref(props.limit);

// Create a reactive object to track prop changes
const filterParams = computed(() => ({
	organizationId: props.organizationId,
	teamId: props.teamId,
	projectId: props.projectId,
	userId: props.userId,
	limit: currentLimit.value,
}));

// Setup tasks list with the composable
const {
	tasks,
	isLoading,
	isConnected,
	error,
	lastUpdated,
	updatingTasks,
	toggleTaskStatus,
	navigateToTicket,
	refreshTasks,
	cleanup,
} = useTasksList(filterParams.value);

// Load more tasks
const loadMore = () => {
	currentLimit.value += props.limit;
	refreshTasks();
};

// Format date for display
const formatDate = (date) => {
	if (!date) return '';
	try {
		const options = { month: 'short', day: 'numeric' };
		return new Date(date).toLocaleDateString(undefined, options);
	} catch (error) {
		console.error('Error formatting date:', error);
		return 'Invalid date';
	}
};

// Format completion date
const formatCompletionDate = (date) => {
	if (!date) return '';
	const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
	return new Date(date).toLocaleDateString(undefined, options);
};

// Get color for status badge
const getStatusColor = (status) => {
	const statusColors = {
		Pending: 'gray',
		Scheduled: 'blue',
		'In Progress': 'yellow',
		Completed: 'green',
	};

	return statusColors[status] || 'gray';
};

onMounted(() => {
	// Fetch initial total count (could be fetched from API if needed)
	totalTaskCount.value = tasks.value.length;
});

onUnmounted(() => {
	cleanup();
});
</script>

<style scoped>
.task-list-container {
	position: relative;
	width: 100%;
}

.connection-alert {
	max-width: 300px;
	z-index: 100;
}

.task-item {
	position: relative;
	transition: all 0.2s ease;
}

.task-item:hover {
	transform: translateY(-1px);
	box-shadow:
		0 4px 6px -1px rgba(0, 0, 0, 0.1),
		0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* Animations */
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>

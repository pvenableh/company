<template>
	<div class="task-list-container">
		<div class="bg-yellow-100 p-4 rounded-lg mt-4">
			<h3>Debug API Test</h3>
			<button @click="testApiCall" class="bg-blue-500 text-white py-2 px-4 rounded">Run Test API Call</button>
			<pre v-if="apiTestResult">{{ JSON.stringify(apiTestResult, null, 2) }}</pre>
			<p v-if="apiTestError" class="text-red-500">{{ apiTestError }}</p>
		</div>
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

		<div v-if="!isLoading" class="space-y-2">
			<div v-if="filteredTasks.length === 0" class="p-4 text-center text-muted-foreground">
				<UIcon name="i-heroicons-document-text" class="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
				<p class="text-sm">No tasks found</p>
				<p class="text-xs text-muted-foreground mt-2">Try changing your filters or create new tasks in your tickets</p>
			</div>

			<div v-else>
				<div class="flex justify-between items-center mb-3">
					<h3 class="text-xs font-bold uppercase tracking-wide">
						Tasks ({{ filteredTasks.length }}{{ totalTaskCount > limit ? '+' : '' }})
					</h3>

					<div class="flex space-x-2">
						<USelectMenu
							v-model="activeFilter"
							:options="[
								{ label: 'All Tasks', value: 'all' },
								{ label: 'Active Tasks', value: 'active' },
								{ label: 'Completed Tasks', value: 'completed' },
								{ label: 'Due Today', value: 'today' },
								{ label: 'Overdue', value: 'overdue' },
							]"
							size="xs"
							class="w-40"
							@update:modelValue="applyFilter($event)"
						/>
					</div>
				</div>

				<div v-if="debug" class="bg-muted p-2 rounded-lg mb-3 text-xs">
					<div>
						<strong>Org ID:</strong>
						{{ effectiveOrgId }}
					</div>
					<div>
						<strong>Team ID:</strong>
						{{ effectiveTeamId }}
					</div>
					<div>
						<strong>Filter:</strong>
						{{ activeFilter }}
					</div>
					<div>
						<strong>Tasks:</strong>
						{{ tasks.length }} (Filtered: {{ filteredTasks.length }})
					</div>
				</div>

				<div v-for="task in filteredTasks" :key="task.id" class="task-item">
					<div class="flex items-center space-x-3 group bg-card p-2 rounded-lg shadow-sm">
						<div
							v-if="updatingTasks.has(task.id)"
							class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 rounded-lg flex items-center justify-center z-10"
						>
							<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" />
						</div>

						<UCheckbox :model-value="task.status === 'completed'" @update:model-value="toggleTaskStatus(task.id)" />

						<div class="flex-1">
							<div
								:class="{ 'line-through text-gray-400': task.status === 'completed' }"
								class="text-xs leading-4 inline-block"
								v-html="task.description"
							></div>

							<div class="text-[8px] text-muted-foreground uppercase mt-1 flex items-center flex-wrap">
								<span class="mr-2 inline-flex items-center">
									<UIcon name="i-heroicons-document-text" class="w-3 h-3 mr-1" />
									<UButton
										size="xs"
										variant="link"
										color="gray"
										class="!p-0 underline hover:text-blue-500"
										@click="navigateToTicket(task.ticketContext.id)"
									>
										{{ task.ticketContext.title || 'Untitled Ticket' }}
									</UButton>
								</span>

								<span v-if="task.ticketContext.due_date" class="mr-2 inline-flex items-center">
									<UIcon name="i-heroicons-calendar" class="w-3 h-3 mr-1" />
									<span :class="{ 'text-red-500': isOverdue(task) }">
										{{ formatDate(task.ticketContext.due_date) }}
									</span>
								</span>

								<UBadge size="xs" :color="getStatusColor(task.ticketContext.status)" class="uppercase !text-[7px]">
									{{ task.ticketContext.status }}
								</UBadge>
							</div>

							<div
								v-if="task.status === 'completed' && task.date_updated"
								class="text-[8px] text-muted-foreground mt-0.5 uppercase"
							>
								Completed {{ formatCompletionDate(task.date_updated) }}
								{{ task.user_updated ? `by ${task.user_updated.first_name}` : '' }}
							</div>
						</div>
					</div>
				</div>

				<div v-if="totalTaskCount > limit && filteredTasks.length < totalTaskCount" class="text-center mt-4">
					<UButton size="sm" color="gray" variant="soft" @click="loadMore">
						Load More Tasks ({{ filteredTasks.length }} of {{ totalTaskCount }})
					</UButton>
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
	// Add debug prop to help with troubleshooting
	debug: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['stats-update']);

const totalTaskCount = ref(0);
const currentLimit = ref(props.limit);
const activeFilter = ref('all');

// Get global context (these are now only used for reacting to changes)
const { selectedOrg } = useOrganization();
const { selectedTeam } = useTeams();

const ticketItems = useDirectusItems('tickets');

// Setup tasks list with the composable, passing initial filter params
const {
	tasks,
	isLoading,
	isConnected,
	error,
	lastUpdated,
	updatingTasks,
	totalCount,
	toggleTaskStatus,
	navigateToTicket,
	refresh: refreshTasks, // Use the consistent name
	effectiveOrgId,
	effectiveTeamId,
	cleanup,
} = useTasksList({
	organizationId: props.organizationId,
	teamId: props.teamId,
	projectId: props.projectId,
	userId: props.userId,
	limit: props.limit,
});

// Expose public methods and computed properties
defineExpose({
	refresh: refreshTasks, // Consistent naming
	tasks: computed(() => tasks.value),
	getTasks: () => tasks.value,
	filteredTasks: computed(() => filteredTasks.value),
	updateParentStats: () => {
		emit('stats-update', tasks.value);
	},
	effectiveOrgId,
	effectiveTeamId,
});

// Watch for changes in props and update filter parameters
watch(
	() => ({
		organizationId: props.organizationId,
		teamId: props.teamId,
		projectId: props.projectId,
		userId: props.userId,
		limit: props.limit,
	}),
	(newFilterParams) => {
		console.log('Props changed, updating filterParams:', newFilterParams);
		// Update filterParams object with new prop values
		Object.assign(filterParams, newFilterParams);
	},
	{ deep: true },
);

// Watch for changes in global organization and team
watch(
	[selectedOrg, selectedTeam],
	([newOrg, newTeam]) => {
		console.log('Global organization or team changed:', { org: newOrg, team: newTeam });
		// No need to refresh here, useTasksList handles it now
	},
	{ deep: true },
);

// Watch for tasks updates to emit stats
watch(
	tasks,
	(newTasks) => {
		console.log('Tasks updated in TasksList, emitting stats-update');
		emit('stats-update', newTasks);
	},
	{ deep: true },
);

// Emit stats after initial load
watch(
	isLoading,
	(loading) => {
		if (loading === false) {
			console.log('Tasks finished loading, emitting stats-update');
			nextTick(() => {
				emit('stats-update', tasks.value);
			});
		}
	},
	{ immediate: true },
);

// Apply filter and refresh data
const applyFilter = (filterValue) => {
	console.log('Applying filter:', filterValue);
	activeFilter.value = filterValue;
	refreshTasks();
};

// Filtered tasks based on active filter
const filteredTasks = computed(() => {
	console.log('Computing filtered tasks with filter:', activeFilter.value);
	console.log('Current tasks:', tasks.value?.length);

	if (!tasks.value || tasks.value.length === 0) return [];

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);

	let result = [];

	switch (activeFilter.value) {
		case 'active':
			result = tasks.value.filter((task) => task.status !== 'completed');
			break;

		case 'completed':
			result = tasks.value.filter((task) => task.status === 'completed');
			break;

		case 'today':
			result = tasks.value.filter((task) => {
				if (!task.ticketContext?.due_date) return false;
				const dueDate = new Date(task.ticketContext.due_date);
				dueDate.setHours(0, 0, 0, 0);
				return dueDate >= today && dueDate < tomorrow;
			});
			break;

		case 'overdue':
			result = tasks.value.filter((task) => {
				if (!task.ticketContext?.due_date) return false;
				const dueDate = new Date(task.ticketContext.due_date);
				dueDate.setHours(0, 0, 0, 0);
				return dueDate < today && task.status !== 'completed';
			});
			break;

		default: // 'all'
			result = tasks.value;
			break;
	}

	console.log('Filtered tasks result:', result.length);
	return result;
});

// Function to check if a task is overdue
const isOverdue = (task) => {
	if (!task.ticketContext?.due_date) return false;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const dueDate = new Date(task.ticketContext.due_date);
	dueDate.setHours(0, 0, 0, 0);
	return dueDate < today && task.status !== 'completed';
};

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
		'On Hold': 'orange',
	};

	return statusColors[status] || 'gray';
};

const apiTestResult = ref(null);
const apiTestError = ref(null);

const testApiCall = async () => {
	apiTestResult.value = null;
	apiTestError.value = null;
	const filterToTest = useTasksList().generateFilter(); // Use the composable to generate filter
	console.log('Testing API call with filter:', filterToTest);

	try {
		const response = await ticketItems.list({
			filter: filterToTest,
			// Add any other necessary parameters like fields, sort, etc.
		});
		apiTestResult.value = response.data;
		console.log('Test API call result:', response);
	} catch (error) {
		console.error('Error during test API call:', error);
		apiTestError.value = error.message || 'An error occurred during the test API call.';
	}
};

onMounted(() => {
	// Update total count when data changes
	watch(
		totalCount,
		(newCount) => {
			console.log('Total task count updated:', newCount);
			totalTaskCount.value = newCount;
		},
		{ immediate: true },
	);
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
	margin-bottom: 0.5rem;
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

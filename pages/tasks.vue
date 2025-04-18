<template>
	<div class="max-w-screen-xl mx-auto px-4 py-6">
		<h1 class="text-2xl font-semibold mb-6">My Tasks</h1>

		<!-- Organization & Filters -->
		<div class="mb-6 flex flex-wrap gap-4 items-center">
			<div v-if="selectedOrgData" class="flex items-center space-x-2">
				<div class="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center">
					<img
						v-if="selectedOrgData.logo"
						:src="`${config.public.directusUrl}/assets/${selectedOrgData.logo}?key=avatar`"
						alt="Organization Logo"
						class="h-6 w-6 rounded-full object-cover"
					/>
					<span v-else class="text-xs font-medium">{{ getOrgInitials(selectedOrgData) }}</span>
				</div>
				<span class="text-sm">{{ selectedOrgData.name }}</span>
			</div>

			<div class="ml-auto">
				<UButton @click="refreshData" size="sm" color="gray" variant="soft">
					<UIcon name="i-heroicons-arrow-path" class="mr-1" />
					Refresh
				</UButton>
			</div>
		</div>

		<!-- Debug Banner (for development purposes) -->
		<div v-if="debug" class="mb-4 p-2 bg-yellow-100 dark:bg-yellow-800 rounded text-xs">
			<div>
				<strong>Debug:</strong>
				Active Tab: {{ activeTab }} ({{ tabs[activeTab].content }})
			</div>
			<div>Global Organization ID: {{ selectedOrg }}</div>
			<div>Global Team ID: {{ selectedTeam }}</div>
			<div>Computed Organization ID: {{ getTasksOrganizationId }}</div>
			<div>Computed Team ID: {{ getTasksTeamId }}</div>
			<div>Computed User ID: {{ getTasksUserId }}</div>
			<div>Filter Type: {{ filterType }}</div>
			<div>Task Stats: {{ JSON.stringify(taskStats) }}</div>
		</div>

		<!-- Tabs -->
		<UTabs v-model="activeTab" :items="tabs" class="mb-6" />

		<!-- Tasks Lists & Summary -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
			<!-- Tasks List -->
			<div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
				<h2 class="text-lg font-medium mb-4">{{ tabs[activeTab].label }} Tasks</h2>

				<ClientOnly>
					<TicketsTasksList
						:organizationId="getTasksOrganizationId"
						:teamId="getTasksTeamId"
						:userId="getTasksUserId"
						:limit="20"
						:debug="debug"
						ref="tasksList"
						@stats-update="handleTasksUpdate"
					/>

					<template #fallback>
						<div class="p-4 flex justify-center">
							<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-400" />
						</div>
					</template>
				</ClientOnly>
			</div>

			<!-- Task Status Summary -->
			<div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
				<h2 class="text-lg font-medium mb-4">Task Summary</h2>
				<div class="grid grid-cols-2 gap-4">
					<!-- Active Tasks -->
					<div class="bg-white dark:bg-gray-700 rounded p-4 shadow-sm">
						<div class="flex items-center space-x-2">
							<div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
								<UIcon name="i-heroicons-clipboard-document-list" class="w-5 h-5 text-blue-500" />
							</div>
							<div>
								<div class="text-2xl font-semibold">{{ taskStats.active }}</div>
								<div class="text-xs text-gray-500 uppercase">Active</div>
							</div>
						</div>
					</div>

					<!-- Completed Tasks -->
					<div class="bg-white dark:bg-gray-700 rounded p-4 shadow-sm">
						<div class="flex items-center space-x-2">
							<div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
								<UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500" />
							</div>
							<div>
								<div class="text-2xl font-semibold">{{ taskStats.completed }}</div>
								<div class="text-xs text-gray-500 uppercase">Completed</div>
							</div>
						</div>
					</div>

					<!-- Due Today -->
					<div class="bg-white dark:bg-gray-700 rounded p-4 shadow-sm">
						<div class="flex items-center space-x-2">
							<div class="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
								<UIcon name="i-heroicons-clock" class="w-5 h-5 text-yellow-500" />
							</div>
							<div>
								<div class="text-2xl font-semibold">{{ taskStats.dueToday }}</div>
								<div class="text-xs text-gray-500 uppercase">Due Today</div>
							</div>
						</div>
					</div>

					<!-- Overdue -->
					<div class="bg-white dark:bg-gray-700 rounded p-4 shadow-sm">
						<div class="flex items-center space-x-2">
							<div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
								<UIcon name="i-heroicons-exclamation-circle" class="w-5 h-5 text-red-500" />
							</div>
							<div>
								<div class="text-2xl font-semibold">{{ taskStats.overdue }}</div>
								<div class="text-xs text-gray-500 uppercase">Overdue</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
definePageMeta({
	middleware: ['auth'],
});

// Enable debug mode (set to false in production)
const debug = ref(false);

// Get user data
const { user } = useEnhancedAuth();

// Get organization and team data directly from the composables
const { selectedOrg, organizations, setupListeners: setupOrgListeners, getOrganizationFilter } = useOrganization();

const {
	selectedTeam,
	visibleTeams,
	fetchTeams,
	DEFAULT_TEAM_ID,
	setupStorageListener: setupTeamListeners,
	getTeamFilter,
} = useTeams();
const config = useRuntimeConfig();
const tasksList = ref(null);

// Tabs
const activeTab = ref(0); // Use numeric index
const tabs = computed(() => [
	{
		label: 'Assigned to Me',
		icon: 'i-heroicons-user-circle',
		content: 'assigned',
		disabled: false, // Always enabled
	},
	{
		label: 'My Team',
		icon: 'i-heroicons-user-group',
		content: 'team',
		disabled: !selectedTeam.value, // Disabled if no team is selected
	},
	{
		label: 'Organization',
		icon: 'i-heroicons-building-office',
		content: 'organization',
		disabled: !selectedOrg.value, // Disabled if no organization is selected
	},
	{
		label: 'All Tasks',
		icon: 'i-heroicons-clipboard-document-list',
		content: 'all',
		disabled: false, // Always enabled
	},
]);

// Task statistics
const taskStats = reactive({
	active: 0,
	completed: 0,
	dueToday: 0,
	overdue: 0,
});

// Get selected organization data
const selectedOrgData = computed(() => {
	if (!selectedOrg.value) return null;
	return organizations.value.find((org) => org.id === selectedOrg.value) || null;
});

// Helper for organization initials
const getOrgInitials = (org) => {
	if (!org?.name) return '';
	return org.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2); // Up to 2 initials
};

// Computed properties for task list
// These computed properties determine what filters we send to the TasksList component
const getTasksOrganizationId = computed(() => {
	// For all tabs, we use the global organization filter from useOrganization()
	// This ensures organization context is maintained across all tabs
	return selectedOrg.value;
});

const getTasksTeamId = computed(() => {
	// Only use team filter on the "My Team" tab
	// For other tabs, use null to indicate no team filter
	return tabs.value[activeTab.value].content === 'team' ? selectedTeam.value : null;
});

const getTasksUserId = computed(() => {
	// Only use user filter on the "Assigned to Me" tab
	// For other tabs, use null to indicate no user filter
	return tabs.value[activeTab.value].content === 'assigned' ? user.value?.id : null;
});

const handleTasksUpdate = (tasksList) => {
	console.log('Received stats-update event with', tasksList?.length || 0, 'tasks');

	// Process tasks and update stats
	if (!tasksList || !Array.isArray(tasksList) || tasksList.length === 0) {
		// Reset stats if no tasks
		taskStats.active = 0;
		taskStats.completed = 0;
		taskStats.dueToday = 0;
		taskStats.overdue = 0;
		return;
	}

	// Define today for date comparisons
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);

	// Reset stats
	taskStats.active = 0;
	taskStats.completed = 0;
	taskStats.dueToday = 0;
	taskStats.overdue = 0;

	// Count tasks for each category
	tasksList.forEach((task) => {
		// Active vs. Completed
		if (task.status === 'completed') {
			taskStats.completed++;
		} else {
			taskStats.active++;

			// Due date checks (only for active tasks)
			if (task.ticketContext?.due_date) {
				const dueDate = new Date(task.ticketContext.due_date);
				dueDate.setHours(0, 0, 0, 0);

				if (dueDate < today) {
					taskStats.overdue++;
				} else if (dueDate >= today && dueDate < tomorrow) {
					taskStats.dueToday++;
				}
			}
		}
	});

	console.log('Stats updated via event:', taskStats);
};

// Add a manual stats update function
const updateStats = () => {
	if (tasksList.value) {
		if (typeof tasksList.value.updateParentStats === 'function') {
			console.log('Calling updateParentStats method');
			tasksList.value.updateParentStats();
		} else {
			console.log('Accessing tasks directly');
			const tasks = tasksList.value.getTasks ? tasksList.value.getTasks() : tasksList.value.tasks?.value || [];

			handleTasksUpdate(tasks);
		}
	}
};

// Function to refresh all data
const refreshData = () => {
	console.log('Refreshing data');
	if (tasksList.value) {
		tasksList.value.refreshTasks();

		// We'll update stats after a short delay to allow data to load
		setTimeout(() => {
			updateStats();
		}, 1000);
	}
};

// Watch for tab changes
watch(activeTab, () => {
	console.log('Active tab changed to:', activeTab.value);
	refreshData();
});

// Watch for organization or team changes from the global context
watch([selectedOrg, selectedTeam], ([newOrg, newTeam], [oldOrg, oldTeam]) => {
	console.log('Global context changed:', {
		org: { old: oldOrg, new: newOrg },
		team: { old: oldTeam, new: newTeam },
	});

	// Only refresh if values actually changed
	if (newOrg !== oldOrg || newTeam !== oldTeam) {
		refreshData();
	}
});

onMounted(() => {
	setupOrgListeners();
	setupTeamListeners();
	// Initial update after mount with retry logic
	nextTick(() => {
		console.log('Component mounted, scheduling stats update');

		// Try multiple times with increasing delays
		setTimeout(() => updateStats(), 500);
		setTimeout(() => updateStats(), 1500);
		setTimeout(() => updateStats(), 3000);
	});
});
</script>

<style scoped>
/* Add any component-specific styles here */
</style>

<template>
	<div class="max-w-screen-xl mx-auto px-4 py-6">
		<h1 class="text-2xl font-semibold mb-6">My Tasks</h1>

		<!-- Filters -->
		<div class="mb-6 flex flex-wrap gap-4 items-center">
			<div class="w-full md:w-auto">
				<USelectMenu
					v-model="selectedFilter"
					:options="filterOptions"
					placeholder="Filter Tasks"
					size="sm"
					class="w-full md:w-64"
				/>
			</div>

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

		<!-- Tabs -->
		<UTabs v-model="activeTab" :items="tabs" class="mb-6" />

		<!-- Tasks Lists -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
			<!-- Dynamic Task List Based on Active Tab -->
			<div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
				<h2 class="text-lg font-medium mb-4">{{ tabs[activeTab].label }} Tasks</h2>

				<ClientOnly>
					<TicketsTasksList
						:organizationId="tabs[activeTab].content === 'all' ? null : selectedOrg"
						:teamId="tabs[activeTab].content === 'team' ? selectedTeam : null"
						:userId="tabs[activeTab].content === 'assigned' ? user?.id : null"
						:limit="20"
						@refresh="refreshData"
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
								<div class="text-2xl font-semibold">{{ countActiveTasks }}</div>
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
								<div class="text-2xl font-semibold">{{ countCompletedTasks }}</div>
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
								<div class="text-2xl font-semibold">{{ countDueToday }}</div>
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
								<div class="text-2xl font-semibold">{{ countOverdue }}</div>
								<div class="text-xs text-gray-500 uppercase">Overdue</div>
							</div>
						</div>
					</div>
				</div>
			</div>
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
							<div class="text-2xl font-semibold">{{ countActiveTasks }}</div>
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
							<div class="text-2xl font-semibold">{{ countCompletedTasks }}</div>
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
							<div class="text-2xl font-semibold">{{ countDueToday }}</div>
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
							<div class="text-2xl font-semibold">{{ countOverdue }}</div>
							<div class="text-xs text-gray-500 uppercase">Overdue</div>
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
// Get user data
const { user } = useEnhancedAuth();

// Get organization and team data
const { selectedOrg, organizations } = useOrganization();
const { selectedTeam } = useTeams();
const config = useRuntimeConfig();

// Tabs
const activeTab = ref(0); // Use numeric index
const tabs = [
	{
		label: 'Assigned to Me',
		icon: 'i-heroicons-user-circle',
		content: 'assigned',
	},
	{
		label: 'My Team',
		icon: 'i-heroicons-user-group',
		content: 'team',
	},
	{
		label: 'Organization',
		icon: 'i-heroicons-building-office',
		content: 'organization',
	},
	{
		label: 'All Tasks',
		icon: 'i-heroicons-clipboard-document-list',
		content: 'all',
	},
];

// Filters
const selectedFilter = ref('active');
const filterOptions = [
	{ label: 'All Tasks', value: 'all' },
	{ label: 'Active Tasks', value: 'active' },
	{ label: 'Completed Tasks', value: 'completed' },
	{ label: 'Due Today', value: 'today' },
	{ label: 'Overdue', value: 'overdue' },
];

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

// Fetch all tasks data for summary statistics
const allTasks = ref([]);
const isLoadingStats = ref(true);

// Mock task statistics (replace with actual data fetching)
const fetchTasksData = async () => {
	isLoadingStats.value = true;

	try {
		// This would be replaced with your actual data fetching logic
		// For example, using the useTasksList composable with no limit
		allTasks.value = [
			// Mock data structure for example
			{ id: '1', status: 'active', ticketContext: { due_date: new Date().toISOString() } },
			{ id: '2', status: 'completed', ticketContext: { due_date: new Date().toISOString() } },
			{ id: '3', status: 'active', ticketContext: { due_date: new Date(Date.now() - 86400000).toISOString() } },
			// ... more mock data
		];
	} catch (error) {
		console.error('Error fetching task statistics:', error);
	} finally {
		isLoadingStats.value = false;
	}
};

// Task count statistics
const countActiveTasks = computed(() => {
	return allTasks.value.filter((task) => task.status === 'active').length;
});

const countCompletedTasks = computed(() => {
	return allTasks.value.filter((task) => task.status === 'completed').length;
});

const countDueToday = computed(() => {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);

	return allTasks.value.filter((task) => {
		if (!task.ticketContext?.due_date) return false;
		const dueDate = new Date(task.ticketContext.due_date);
		return dueDate >= today && dueDate < tomorrow;
	}).length;
});

const countOverdue = computed(() => {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	return allTasks.value.filter((task) => {
		if (!task.ticketContext?.due_date) return false;
		const dueDate = new Date(task.ticketContext.due_date);
		return dueDate < today && task.status !== 'completed';
	}).length;
});

// Function to refresh all data
const refreshData = () => {
	fetchTasksData();
	// The TasksList component will handle its own refresh
};

// Watch for organization changes
watch(
	() => selectedOrg.value,
	() => {
		refreshData();
	},
);

onMounted(() => {
	fetchTasksData();
});
</script>

<style scoped>
/* Add any component-specific styles here */
</style>

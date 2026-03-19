<template>
	<div class="max-w-screen-xl mx-auto px-4 py-6">
		<h1 class="text-2xl font-semibold mb-6">{{ filterUserId && filterUserId !== user?.id ? filterUserLabel + "'s Tasks" : 'My Tasks' }}</h1>

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

		<!-- User filter (shown on team/org/all tabs) -->
		<div v-if="showUserFilter" class="mb-4 flex items-center gap-3">
			<span class="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Viewing:</span>
			<div class="relative">
				<button
					class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm hover:border-primary/30 transition-colors"
					@click="showUserPicker = !showUserPicker"
				>
					<UIcon name="i-heroicons-user-circle" class="w-4 h-4 text-muted-foreground" />
					<span>{{ filterUserLabel }}</span>
					<UIcon name="i-heroicons-chevron-down" class="w-3 h-3 text-muted-foreground" />
				</button>
				<div v-if="showUserPicker" class="absolute top-full left-0 mt-1 z-50 w-64 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
					<input
						ref="userPickerSearchRef"
						v-model="userPickerSearch"
						type="text"
						placeholder="Search team members..."
						class="w-full h-8 px-3 text-xs bg-transparent border-b border-border placeholder:text-muted-foreground focus:outline-none"
					/>
					<div class="max-h-[200px] overflow-y-auto py-1">
						<button
							class="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
							:class="{ 'text-primary font-medium': !filterUserId }"
							@click="filterUserId = null; showUserPicker = false"
						>
							<UIcon name="i-heroicons-users" class="w-4 h-4" />
							Everyone
						</button>
						<button
							class="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
							:class="{ 'text-primary font-medium': filterUserId === user?.id }"
							@click="filterUserId = user?.id; showUserPicker = false"
						>
							<UIcon name="i-heroicons-user-circle" class="w-4 h-4" />
							Just Me
						</button>
						<div v-if="userPickerLoading" class="px-3 py-2 text-xs text-muted-foreground">Loading...</div>
						<template v-for="u in filteredPickerUsers" :key="u.id">
							<button
								v-if="u.id !== user?.id"
								class="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
								:class="{ 'text-primary font-medium': filterUserId === u.id }"
								@click="filterUserId = u.id; showUserPicker = false"
							>
								<div class="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[7px] font-bold uppercase flex-shrink-0">
									{{ (u.first_name?.[0] || '') + (u.last_name?.[0] || '') }}
								</div>
								{{ u.label }}
								<span v-if="u.type === 'client'" class="text-[9px] text-muted-foreground ml-auto">(client)</span>
							</button>
						</template>
					</div>
				</div>
			</div>
			<button
				v-if="filterUserId"
				class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
				@click="filterUserId = null"
			>
				Clear
			</button>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
			<!-- Quick Task Generator (left column) -->
			<div class="lg:col-span-1">
				<div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
					<TasksQuickTaskGenerator />
				</div>
			</div>

			<!-- Project Tasks + Stats (right columns) -->
			<div class="lg:col-span-2 space-y-8">
				<UTabs v-model="activeTab" :items="tabs" class="mb-2" />

				<div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
					<div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
						<h2 class="text-lg font-medium mb-4">{{ tabs[activeTab]?.label }} Tasks</h2>

						<ClientOnly>
							<TicketsTasksList
								:organizationId="getTasksOrganizationId"
								:teamId="getTasksTeamId"
								:projectId="getTasksProjectId"
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

					<div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
						<h2 class="text-lg font-medium mb-4">Task Summary</h2>
						<div class="grid grid-cols-2 gap-4">
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
const { user } = useDirectusAuth();

// User filter for viewing another person's tasks
const filterUserId = ref(null);
const showUserPicker = ref(false);
const userPickerSearch = ref('');
const userPickerSearchRef = ref(null);
const { filteredUsers: pickerUsers, fetchFilteredUsers: fetchPickerUsers, loading: userPickerLoading } = useFilteredUsers();

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

// User picker computed
const showUserFilter = computed(() => {
	const tab = tabs.value?.[activeTab.value]?.content;
	return tab === 'team' || tab === 'organization' || tab === 'all';
});

const filteredPickerUsers = computed(() => {
	const q = userPickerSearch.value.toLowerCase().trim();
	const users = pickerUsers.value || [];
	if (!q) return users;
	return users.filter((u) => u.label.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
});

const filterUserLabel = computed(() => {
	if (!filterUserId.value) return 'Everyone';
	if (filterUserId.value === user.value?.id) return 'Just Me';
	const found = pickerUsers.value?.find((u) => u.id === filterUserId.value);
	return found ? found.label : 'Selected User';
});

// Fetch users for picker when org changes or user filter becomes visible
watch([showUserFilter, selectedOrg], ([show]) => {
	if (show && selectedOrg.value) fetchPickerUsers();
}, { immediate: true });

// Close user picker on outside click
onMounted(() => {
	const handler = (e) => {
		if (showUserPicker.value && !e.target.closest('.relative')) {
			showUserPicker.value = false;
		}
	};
	document.addEventListener('click', handler);
	onUnmounted(() => document.removeEventListener('click', handler));
});

// Focus search when picker opens
watch(showUserPicker, (val) => {
	if (val) nextTick(() => userPickerSearchRef.value?.focus());
});

// Computed properties for task list
// These computed properties determine what filters we send to the TasksList component
const getTasksOrganizationId = computed(() => {
	return selectedOrg.value;
});

const getTasksTeamId = computed(() => {
	return tabs.value?.[activeTab.value]?.content === 'team' ? selectedTeam.value : null;
});

const getTasksUserId = computed(() => {
	const tab = tabs.value?.[activeTab.value]?.content;
	// "Assigned to Me" tab always shows current user's tasks
	if (tab === 'assigned') return user.value?.id;
	// Other tabs respect the user filter picker
	return filterUserId.value || null;
});

const getTasksProjectId = computed(() => {
	// Logic to determine projectId based on your tabs or other state
	// For example, if you have a project context:
	return null; // Replace with your actual project ID logic
});

const handleTasksUpdate = (tasksList) => {
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
};

// Add a manual stats update function
const updateStats = () => {
	if (tasksList.value) {
		if (typeof tasksList.value.updateParentStats === 'function') {
			tasksList.value.updateParentStats();
		} else {
			const tasks = tasksList.value.getTasks ? tasksList.value.getTasks() : tasksList.value.tasks?.value || [];
			handleTasksUpdate(tasks);
		}
	}
};

// Function to refresh all data
const refreshData = () => {
	if (tasksList.value) {
		tasksList.value.refresh();

		// We'll update stats after a short delay to allow data to load
		setTimeout(() => {
			updateStats();
		}, 1000);
	}
};

// Reset tab if current becomes disabled or invalid
watch(tabs, (newTabs) => {
	if (!newTabs[activeTab.value] || newTabs[activeTab.value].disabled) {
		activeTab.value = 0;
	}
});

// Watch for tab changes
watch(activeTab, () => {
	refreshData();
});

// Watch for organization or team changes from the global context
watch([selectedOrg, selectedTeam], () => {
	if (tasksList.value) {
		tasksList.value.refresh();
	}
});

onMounted(() => {
	setupOrgListeners();
	setupTeamListeners();
	// Initial update after mount with retry logic
	nextTick(() => {
		setTimeout(() => updateStats(), 500);
		setTimeout(() => updateStats(), 1500);
		setTimeout(() => updateStats(), 3000);
	});
});
</script>

<style scoped>
/* Add any component-specific styles here */
</style>

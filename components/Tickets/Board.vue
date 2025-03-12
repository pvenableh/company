<template>
	<div class="w-full mx-auto relative tickets-board">
		<!-- Loading Overlay -->
		<!--  -->
		<transition name="fade">
			<div
				v-if="isLoading"
				class="absolute h-svh inset-0 bg-white/70 dark:bg-gray-800/70 z-50 flex items-center justify-center"
			>
				<LayoutLoader text="Loading Tickets" />
			</div>
		</transition>
		<!-- Connection Status -->
		<transition name="fade">
			<div v-if="!isConnected && !isLoading" class="mb-4 absolute w-64 right-10 top-0 tickets-board__connection">
				<UAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
					<template #footer>
						<UButton size="sm" color="yellow" @click="refreshData">Retry Connection</UButton>
					</template>
				</UAlert>
			</div>
		</transition>

		<!-- Filters and Controls -->
		<div
			class="w-full flex flex-col md:flex-row items-end justify-between mb-4 xl:mb-8 xl:mt-2 px-4 gap-4 pt-4 tickets-board__filters"
		>
			<TicketsCreate :columns="columns" @ticketCreated="handleTicketCreated" class="mb-4 xl:mb-0" />

			<div v-if="!projectId" class="hidden md:flex items-center flex-col xl:flex-row relative mb-4 xl:mb-0">
				<div class="w-full flex flex-row items-center justify-end gap-4 mb-2 xl:mb-0 xl:mr-2">
					<UButton
						icon="i-heroicons-x-mark"
						size="xs"
						color="gray"
						variant="ghost"
						@click="clearFilters"
						class="uppercase text-[10px] transition-opacity duration-500 p-0"
						:class="hasActiveFilters ? 'opacity-100' : 'opacity-0'"
					>
						Clear Filters
					</UButton>
					<div class="flex flex-row items-center justify-center space-x-2">
						<UToggle v-model="filterByAssignedTo" />
						<span class="text-[10px] text-gray-500 uppercase">
							{{ filterByAssignedTo ? 'My Tickets' : 'All Tickets' }}
						</span>
					</div>
					<div class="flex flex-row items-center justify-center space-x-2 hidden">
						<UToggle v-model="filterUnassigned" :disabled="filterByAssignedTo" />
						<span class="text-[10px] text-gray-500 uppercase">
							{{ filterUnassigned ? 'Unassigned' : 'All Assignments' }}
						</span>
					</div>
				</div>
				<div class="w-full flex flex-row items-center justify-end gap-4">
					<div class="flex items-center space-x-2 relative">
						<USelectMenu
							v-model="filterDueDate"
							:options="dueDateOptions"
							placeholder="Due Date"
							size="sm"
							class="w-36 uppercase text-[10px]"
							option-attribute="label"
							value-attribute="value"
						>
							<template #trigger>
								<UButton
									:color="activeDueDateFilter ? 'yellow' : 'gray'"
									variant="soft"
									:icon="activeDueDateFilter ? 'i-heroicons-clock' : 'i-heroicons-calendar'"
									size="xs"
									class="uppercase text-[10px]"
								>
									{{ filterDueDate?.label || 'Due Date' }}
								</UButton>
							</template>
						</USelectMenu>
					</div>

					<div class="flex items-center space-x-2">
						<USelectMenu
							searchable
							v-model="selectedProject"
							:options="projectOptions"
							option-attribute="title"
							value-attribute="id"
							placeholder="Select Project"
							class="w-full lg:w-64 uppercase text-[8px] text-gray-400 relative"
							@change="handleProjectChange"
						>
							<template #option="{ option }">
								<div class="flex flex-col w-full">
									<span class="w-full flex flex-row items-center justify-start leading-4">
										{{ option.title }}
										<span
											v-if="option.tickets?.length"
											class="text-[8px] font-bold h-4 w-4 !text-white rounded-full bg-[var(--cyan)] inline-flex items-center justify-center ml-1 text-center"
										>
											{{ option.tickets.length }}
										</span>
									</span>
									<span v-if="option.organization" class="text-[9px] leading-3 text-gray-500">
										{{ option.organization.name }}
									</span>
									<span v-if="option.team" class="text-[9px] leading-3 text-gray-500">
										Team: {{ option.team.name }}
									</span>
								</div>
							</template>
						</USelectMenu>
					</div>
				</div>
				<div v-if="lastUpdated" class="-bottom-[22.5px] text-[9px] right-0 text-gray-500 absolute font-bold uppercase">
					Last updated: {{ formatLastUpdated(lastUpdated) }}
				</div>
			</div>
		</div>

		<!-- Mobile Column Navigation -->
		<div
			v-if="isMobile"
			class="flex items-center justify-between mb-4 mx-4 rounded bg-gray-500 px-4 gap-4 py-3 text-white"
		>
			<UIcon name="i-heroicons-chevron-left" class="w-5 h-5" @click="previousColumn" />
			<h3 class="text-sm font-medium uppercase tracking-wide">
				{{ columns.find((col) => col.id === activeColumn)?.name }}
			</h3>
			<UIcon name="i-heroicons-chevron-right" class="w-5 h-5" @click="nextColumn" />
		</div>

		<!-- Main Board -->
		<div
			class="bg-gray-100 bg-opacity-30 border-b border-gray-200 w-full flex min-h-svh overflow-x-auto overflow-hidden-scrollbar tickets-board__board"
			@touchstart="handleTouchStart"
			@touchend="handleTouchEnd"
		>
			<div
				v-for="(column, index) in columns"
				:key="column.id"
				class="flex-grow w-full basis-0 h-full min-h-dvh transition-transform duration-300 ease-in-out min-w-[350px] tickets-board__board-col"
				:class="{
					'hidden md:block': isMobile && column.id !== activeColumn,
					'transform translate-x-0': !isMobile || column.id === activeColumn,
				}"
			>
				<div class="tickets-board__board-col-header">
					<div class="flex items-center justify-between">
						<h3 class="text-xs font-bold uppercase tracking-wide">{{ column.name }}</h3>
						<UBadge
							class="ml-2 w-6 h-6 text-center inline-block text-[var(--darkBlue)]"
							:style="{ backgroundColor: `var(--${column.color})` }"
						>
							{{ localTickets[column.id]?.length || 0 }}
						</UBadge>
					</div>
				</div>

				<!-- Loading Skeletons -->
				<div
					v-if="isLoading && !localTickets[column.id]?.length"
					class="min-h-[90svh] p-2 bg-gray-100 dark:bg-gray-800"
				>
					<div class="space-y-3">
						<USkeleton v-for="n in 5" :key="n" class="h-24 mb-4 w-full" />
					</div>
				</div>

				<!-- Draggable Column Content -->
				<VueDraggable
					v-else
					v-model="localTickets[column.id]"
					:group="{ name: 'tickets' }"
					item-key="id"
					class="tickets-board__board-col-content"
					:class="{ 'is-dragging': isDragging }"
					ghost-class="ghost"
					chosen-class="chosen"
					drag-class="drag"
					@start="onDragStart"
					@end="onDragEnd"
					@change="(event) => updateTicketStatus(column.id, event)"
				>
					<template #item="{ element }">
						<div :id="element.id" class="ticket-wrapper">
							<div class="relative">
								<div
									v-if="updatingTickets.has(element.id)"
									class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 rounded-lg flex items-center justify-center z-10"
								>
									<LayoutLoader />
									<!-- <UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" /> -->
								</div>
								<TicketsExpandableCard :element="element" :columns="columns" :updating-tickets="updatingTickets" />
							</div>
						</div>
					</template>
				</VueDraggable>
			</div>
		</div>
	</div>
</template>

<script setup>
import VueDraggable from 'vuedraggable';

const { updateItem, readItems } = useDirectusItems();
const { registerRefreshCallback } = useTicketsStore();
const { user } = useDirectusAuth();
const { triggerHaptic } = useHaptic();
const toast = useToast();
const config = useRuntimeConfig();

// Use our composables
const { selectedOrg, organizations, setupListeners: setupOrgListeners, getOrganizationFilter } = useOrganization();

const {
	selectedTeam,
	visibleTeams,
	fetchTeams,
	DEFAULT_TEAM_ID,
	setupStorageListener: setupTeamListeners,
	getTeamFilter,
} = useTeams();

const props = defineProps({
	projectId: {
		type: String,
		default: null,
	},
});

// Define columns
const columns = [
	{ id: 'Pending', name: 'Pending', color: 'cyan' },
	{ id: 'Scheduled', name: 'Scheduled', color: 'cyan2' },
	{ id: 'In Progress', name: 'In Progress', color: 'green2' },
	{ id: 'Completed', name: 'Completed', color: 'green' },
];

// Use our mobile navigation composable
const {
	isMobile,
	activeColumn,
	handleTouchStart,
	handleTouchEnd,
	nextColumn,
	previousColumn,
	setupMobileDetection,
	setActiveColumn,
} = useMobileBoardNavigation({
	columns,
	breakpoint: 768,
	swipeThreshold: 50,
	onColumnChange: (columnId) => {
		console.log(`Column changed to: ${columnId}`);
	},
});

// Component state
const updatingTickets = ref(new Set());
const isDragging = ref(false);
const selectedProject = ref(props.projectId || null);
const projectOptions = ref([]);
const filterByAssignedTo = ref(false);
const filterUnassigned = ref(false);
const filterDueDate = ref(null);
const isLoading = ref(true);
const isConnected = ref(true);
const error = ref(null);
const lastUpdated = ref(null);
let cleanupMobileDetection = null;

// Initialize localTickets with empty arrays for each column
const localTickets = ref(
	columns.reduce((acc, column) => {
		acc[column.id] = [];
		return acc;
	}, {}),
);

// Storage for filter preferences
const assignedToStorage = useStorageSync('ticketFilterAssignedTo');
const unassignedStorage = useStorageSync('ticketFilterUnassigned');
const dueDateStorage = useStorageSync('ticketFilterDueDate');
const projectStorage = useStorageSync('selectedProject');

// WebSocket ticket subscription
let ticketsSubscription = null;
let connectFunc = null;
let disconnectFunc = null;

// The tickets data from our subscription
const ticketsData = ref([]);

// Due date filter options
const dueDateOptions = ref([
	{ value: 'all', label: 'All Dates' },
	{ value: 'overdue', label: 'Overdue' },
	{ value: 'today', label: 'Due Today' },
	{ value: 'week', label: 'Due This Week' },
]);

// Active due date filter
const activeDueDateFilter = computed(() => {
	if (!filterDueDate.value || filterDueDate.value === 'all') return null;
	return typeof filterDueDate.value === 'object' ? filterDueDate.value.value : filterDueDate.value;
});

// Required fields for ticket data
const fields = [
	'id',
	'title',
	'description',
	'status',
	'priority',
	'date_created',
	'date_updated',
	'user_updated.first_name',
	'user_updated.last_name',
	'user_updated.id',
	'user_created.first_name',
	'user_created.last_name',
	'user_created.id',
	'due_date',
	'organization.id',
	'organization.name',
	'organization.logo',
	'project.id',
	'project.title',
	'project.url',
	'assigned_to.id',
	'assigned_to.directus_users_id.id',
	'assigned_to.directus_users_id.first_name',
	'assigned_to.directus_users_id.last_name',
	'assigned_to.directus_users_id.avatar',
	'assigned_to.directus_users_id.email',
	'comments.id',
	'tasks.id',
	'tasks.status',
	'team.id',
	'team.name',
];

// Generate filter based on current state
const generateFilter = () => {
	console.log('Board: Generating filter with context:', {
		org: selectedOrg.value,
		team: selectedTeam.value,
		project: selectedProject.value,
		assignedTo: filterByAssignedTo.value,
		unassigned: filterUnassigned.value,
		dueDate: activeDueDateFilter.value,
	});

	const filter = { _and: [] };

	// Handle "All Organizations" (null) state for admins
	if (selectedOrg.value === null) {
		// For admins with multiple orgs, we want to show all accessible data
		// No organization filter is needed as they should see all orgs they have access to
		console.log('Board: Admin viewing all organizations');

		// Instead of filtering by org, we might want to filter by user's accessible orgs
		// This ensures they only see orgs they have access to
		if (user.value?.organizations?.length > 0) {
			const orgIds = user.value.organizations.map((org) => org.organizations_id?.id).filter(Boolean);
			if (orgIds.length > 0) {
				filter._and.push({
					organization: { _in: orgIds },
				});
			}
		}
	} else {
		// Organization filter for specific organization
		const orgFilter = getOrganizationFilter();
		if (orgFilter && Object.keys(orgFilter).length > 0) {
			filter._and.push(orgFilter);
		}
	}

	// Team filter (only apply if a specific team is selected)
	if (selectedTeam.value && selectedTeam.value !== DEFAULT_TEAM_ID) {
		filter._and.push({ team: { _eq: selectedTeam.value } });
	}

	// Project filter
	if (selectedProject.value) {
		filter._and.push({ project: { _eq: selectedProject.value } });
	}

	// Assigned to filter
	if (filterByAssignedTo.value && user.value) {
		console.log('trying to filter by assignment');
		filter._and.push({
			assigned_to: { directus_users_id: { id: { _eq: user.value.id } } },
		});
	} else if (filterUnassigned.value) {
		filter._and.push({ assigned_to: { _empty: true } });
	}

	// Due date filter
	if (activeDueDateFilter.value) {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		if (activeDueDateFilter.value === 'overdue') {
			filter._and.push({
				due_date: { _lt: today.toISOString(), _nnull: true },
			});
		} else if (activeDueDateFilter.value === 'today') {
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);
			filter._and.push({
				due_date: {
					_gte: today.toISOString(),
					_lt: tomorrow.toISOString(),
					_nnull: true,
				},
			});
		} else if (activeDueDateFilter.value === 'week') {
			const nextWeek = new Date(today);
			nextWeek.setDate(nextWeek.getDate() + 7);
			filter._and.push({
				due_date: {
					_gte: today.toISOString(),
					_lt: nextWeek.toISOString(),
					_nnull: true,
				},
			});
		}
	}

	// Clean up empty filter
	if (filter._and.length === 0) {
		return {}; // Return empty object instead of deleting _and
	}

	console.log('Generated filter:', filter);
	return filter;
};

// Initialize or update the subscription
const setupTicketsSubscription = () => {
	// Always create a fresh filter
	const filter = generateFilter();

	// Skip if we're on server side
	if (import.meta.server) {
		isLoading.value = false;
		return;
	}

	console.log('Setting up tickets subscription with filter:', filter);
	isLoading.value = true;

	// Clean up existing subscription
	if (disconnectFunc) {
		disconnectFunc();
	}

	// Create a new subscription
	const {
		data,
		isLoading: wsLoading,
		isConnected: wsConnected,
		error: wsError,
		lastUpdated: wsLastUpdated,
		connect,
		disconnect,
		updateFilter,
		refresh,
	} = useRealtimeSubscription('tickets', fields, filter, '-date_updated');

	// Store functions for lifecycle management
	connectFunc = connect;
	disconnectFunc = disconnect;

	// Store ticket data and subscribe to changes
	ticketsData.value = data;

	// Watch for changes to subscription state
	watch(
		wsLoading,
		(val) => {
			console.log('Subscription loading state:', val);
			isLoading.value = val;
		},
		{ immediate: true },
	);

	watch(
		wsConnected,
		(val) => {
			console.log('Subscription connection state:', val);
			isConnected.value = val;

			// If connection is lost, set isLoading to false
			if (!val && isLoading.value) {
				setTimeout(() => {
					isLoading.value = false;
				}, 1000);
			}
		},
		{ immediate: true },
	);

	watch(
		wsError,
		(val) => {
			error.value = val;
			if (val) {
				console.error('Subscription error:', val);
				toast.add({
					title: 'Error',
					description: 'Failed to load tickets. Please try again.',
					color: 'red',
				});
				// Set loading to false on error
				isLoading.value = false;
			}
		},
		{ immediate: true },
	);

	watch(
		wsLastUpdated,
		(val) => {
			lastUpdated.value = val;
		},
		{ immediate: true },
	);

	// Store the functions we need for later
	ticketsSubscription = {
		updateFilter,
		refresh,
	};

	// Process ticket data when it changes
	watch(
		data,
		(newData) => {
			if (newData) {
				console.log(`Received ${newData.length} tickets from subscription`);
				processTickets(newData);
			} else {
				console.log('Received null or undefined data from subscription');
				processTickets([]);
			}

			// End loading state when data is received
			isLoading.value = false;
		},
		{ immediate: true },
	);

	// Safety timeout to prevent infinite loading state
	setTimeout(() => {
		if (isLoading.value) {
			console.log('Safety timeout: ending loading state after 8 seconds');
			isLoading.value = false;
		}
	}, 8000);
};

// Call refresh on the current subscription
const refreshData = async () => {
	console.log('Board: Refreshing tickets...');
	isLoading.value = true;

	try {
		if (ticketsSubscription) {
			await ticketsSubscription.refresh();
			console.log('Board: Tickets refreshed.');
		} else {
			// If no subscription exists, set one up
			setupTicketsSubscription();
		}
	} catch (err) {
		console.error('Error refreshing tickets:', err);
		error.value = err;
		toast.add({
			title: 'Error',
			description: 'Failed to refresh tickets. Please try again.',
			color: 'red',
		});
	} finally {
		// Set loading to false after a timeout in case the subscription doesn't update it
		setTimeout(() => {
			if (isLoading.value) {
				isLoading.value = false;
			}
		}, 3000);
	}
};

// Process tickets into columns
const processTickets = (tickets) => {
	console.log('Board: Processing tickets data', tickets);

	// Create a new object to avoid reactivity issues
	const newLocalTickets = {};

	// Initialize columns with empty arrays
	columns.forEach((col) => {
		newLocalTickets[col.id] = [];
	});

	// If tickets data is null, undefined, or empty array, just set empty columns
	if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
		console.log('Board: No tickets data to process, setting empty columns');
		localTickets.value = newLocalTickets;
		return;
	}

	// Log the actual data
	console.log(`Board: Processing ${tickets.length} tickets`);

	// Process each ticket
	tickets.forEach((ticket) => {
		if (!ticket) return; // Skip null or undefined tickets

		const status = ticket.status;

		// Check if status exists in our columns
		if (columns.some((col) => col.id === status)) {
			// Add ticket to the correct column
			newLocalTickets[status].push(ticket);
		} else {
			// For tickets with invalid status, put them in the first column
			const defaultColumn = columns[0].id;
			console.log(`Ticket ${ticket.id} with invalid status "${status}" moved to "${defaultColumn}"`);
			newLocalTickets[defaultColumn].push({ ...ticket, status: defaultColumn });
		}
	});

	// Log column counts
	columns.forEach((col) => {
		console.log(`Column ${col.id}: ${newLocalTickets[col.id].length} tickets`);
	});

	// Update the reactive state once
	localTickets.value = newLocalTickets;
};

// Handle newly created ticket
const handleTicketCreated = () => {
	refreshData();
};

// Check for active filters
const hasActiveFilters = computed(() => {
	return filterByAssignedTo.value || filterUnassigned.value || filterDueDate.value || selectedProject.value;
});

// Clear all filters
const clearFilters = () => {
	filterByAssignedTo.value = false;
	filterUnassigned.value = false;
	filterDueDate.value = null;
	selectedProject.value = null;
};

// Fetch projects for the current organization
// Update the fetchProjects function to handle "All Organizations" mode
const fetchProjects = async () => {
	if (props.projectId) {
		selectedProject.value = props.projectId;
		return;
	}

	try {
		let filter = {};

		// Handle "All Organizations" vs specific organization
		if (selectedOrg.value === null) {
			// For "All Organizations" mode (admin users)
			if (user.value?.organizations?.length > 0) {
				// Get all organizations the user has access to
				const orgIds = user.value.organizations.map((org) => org.organizations_id?.id).filter(Boolean);

				if (orgIds.length > 0) {
					filter = {
						organization: { _in: orgIds },
					};
				}
			}
		} else {
			// For specific organization mode
			const orgFilter = getOrganizationFilter();
			const teamFilter = getTeamFilter();

			// Build filter based on org and team
			if (Object.keys(orgFilter).length > 0) {
				filter = { _and: [orgFilter] };

				if (Object.keys(teamFilter).length > 0) {
					filter._and.push(teamFilter);
				}
			}
		}

		// Fetch projects with the filter
		const projects = await readItems('projects', {
			fields: ['id', 'title', 'sort', 'organization.id', 'organization.name', 'team.id', 'team.name', 'tickets'],
			filter,
			sort: 'sort',
		});

		projectOptions.value = [{ id: null, title: 'All Projects' }, ...projects];
	} catch (error) {
		console.error('Error fetching projects:', error);
		projectOptions.value = [{ id: null, title: 'All Projects' }];
		toast.add({
			title: 'Error',
			description: 'Failed to load projects',
			color: 'red',
		});
	}
};

// Project selection handler
const handleProjectChange = (value) => {
	selectedProject.value = value === 'null' || value === 'All Projects' ? null : value;
};

// Format last updated timestamp
const formatLastUpdated = (timestamp) => {
	if (!timestamp) return '';
	return new Date(timestamp).toLocaleTimeString();
};

// Debounce function to prevent too many rapid updates
const debounce = (fn, delay) => {
	let timeoutId;
	return function (...args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			fn.apply(this, args);
		}, delay);
	};
};

// Debounced subscription update
const debouncedUpdateSubscription = debounce(() => {
	if (ticketsSubscription) {
		isLoading.value = true;
		const filter = generateFilter();
		console.log('Updating subscription with filter:', filter);
		ticketsSubscription.updateFilter(filter);

		// Add a safety timeout to prevent infinite loading
		setTimeout(() => {
			if (isLoading.value) {
				console.log('Force ending loading state after timeout');
				isLoading.value = false;
			}
		}, 5000);
	} else {
		setupTicketsSubscription();
	}
}, 300);

// Drag and drop handlers
const onDragStart = () => {
	isDragging.value = true;
};

const onDragEnd = () => {
	isDragging.value = false;
};

const updateTicketStatus = async (columnId, event) => {
	if (!event.added) return;

	const ticketId = event.added.element.id;
	const newStatus = columnId;

	updatingTickets.value.add(ticketId);

	try {
		await updateItem('tickets', ticketId, {
			status: newStatus,
			date_updated: new Date(),
		});

		const ticket = event.added.element;
		ticket.status = newStatus;
		triggerHaptic([100, 30, 100]);
	} catch (error) {
		console.error('Error updating ticket:', error);

		const originalStatus = event.added.element.status;
		localTickets.value[originalStatus].push(event.added.element);
		localTickets.value[columnId] = localTickets.value[columnId].filter((t) => t.id !== ticketId);

		toast.add({
			title: 'Error updating ticket',
			description: 'Failed to update ticket status. Please try again.',
			color: 'red',
		});
	} finally {
		updatingTickets.value.delete(ticketId);
	}
};

// Lifecycle hooks
onMounted(async () => {
	console.log('Board: Component mounted');

	// Set up mobile detection
	cleanupMobileDetection = setupMobileDetection();

	// Register refresh callback
	registerRefreshCallback(refreshData);

	// Set up cross-tab sync
	setupOrgListeners();
	setupTeamListeners();

	// Initialize filter values from storage
	filterByAssignedTo.value = assignedToStorage.getValue() || false;
	filterUnassigned.value = unassignedStorage.getValue() || false;
	filterDueDate.value = dueDateStorage.getValue() || null;

	// Load saved project
	if (!props.projectId) {
		const savedProject = projectStorage.getValue();
		if (savedProject) selectedProject.value = savedProject;
	}

	// Ensure WebSocket URL is set
	if (!config.public.websocketUrl) {
		console.error('WebSocket URL is not configured. Make sure to set public.websocketUrl in your Nuxt config.');
		toast.add({
			title: 'Configuration Error',
			description: 'WebSocket connection is not properly configured.',
			color: 'red',
		});
		isLoading.value = false;
		return;
	}

	// Allow component to mount fully before loading data
	await nextTick();

	// Load initial data
	if (selectedOrg.value) {
		await fetchProjects();

		try {
			// Make sure we're in client-side before setting up the subscription
			if (process.client) {
				setupTicketsSubscription();
				// Now call connect (moved from inside setupTicketsSubscription)
				if (connectFunc) connectFunc();
			}
		} catch (error) {
			console.error('Error setting up subscription:', error);
			isLoading.value = false;
		}
	}

	// Safety timeout to prevent infinite loading state
	setTimeout(() => {
		if (isLoading.value) {
			console.log('Board: Loading timeout reached, forcing loading state to false');
			isLoading.value = false;
		}
	}, 5000);
});

onUnmounted(() => {
	// Clean up mobile detection
	if (cleanupMobileDetection) {
		cleanupMobileDetection();
	}

	// Clean up WebSocket connection
	if (disconnectFunc) {
		console.log('Board: Cleaning up WebSocket connection');
		disconnectFunc();
	}
});

// Watch organization changes
watch(
	() => selectedOrg.value,
	async (newOrg, oldOrg) => {
		console.log('Board: Organization changed', { newOrg, oldOrg });
		if (newOrg !== oldOrg) {
			// Clear tickets and show loading
			localTickets.value = columns.reduce((acc, column) => {
				acc[column.id] = [];
				return acc;
			}, {});

			isLoading.value = true;

			// Fetch related data - for both specific org and "All Organizations" mode
			await fetchProjects();

			// If switching between specific organizations, fetch teams
			if (newOrg) {
				await fetchTeams(newOrg);
			}

			// Reset or create subscription with proper filter
			if (ticketsSubscription) {
				const filter = generateFilter();
				ticketsSubscription.updateFilter(filter);
			} else {
				setupTicketsSubscription();
				if (connectFunc) connectFunc();
			}
		}
	},
	{ immediate: false },
);

// Watch team changes
watch(
	() => selectedTeam.value,
	(newTeam, oldTeam) => {
		if (newTeam !== oldTeam) {
			debouncedUpdateSubscription();
		}
	},
);

// Watch project changes
watch(
	() => selectedProject.value,
	() => {
		if (!props.projectId) {
			projectStorage.setValue(selectedProject.value);
		}
		debouncedUpdateSubscription();
	},
);

// Watch filter changes
watch(
	() => filterByAssignedTo.value,
	(newVal) => {
		if (newVal) filterUnassigned.value = false;
		assignedToStorage.setValue(newVal);
		debouncedUpdateSubscription();
	},
);

watch(
	() => filterUnassigned.value,
	(newVal) => {
		if (newVal) filterByAssignedTo.value = false;
		unassignedStorage.setValue(newVal);
		debouncedUpdateSubscription();
	},
);

watch(
	() => filterDueDate.value,
	(newVal) => {
		dueDateStorage.setValue(newVal);
		debouncedUpdateSubscription();
	},
);
</script>

<style scoped>
.tickets-board {
	&__board {
		@apply relative;
		&-filters {
			@apply relative max-w-[2000px];
		}
		&-connection {
			@apply max-w-[2000px];
		}
		&-col {
			@apply border-gray-50 border-r border-l shadow-inner;
			&-header {
				@apply relative shadow-2xl py-5 px-4 backdrop-blur-lg mt-1 border-gray-200 border-b;
				@media (min-width: 1600px) {
					@apply px-8;
				}
			}
			&-content {
				@apply min-h-screen lg:h-svh h-full py-2 bg-gray-50 bg-opacity-15 dark:bg-gray-800 overflow-y-auto overflow-hidden-scrollbar px-2;
				@media (min-width: 1600px) {
					@apply px-6;
				}
			}
		}
	}
	.tickets-board__board::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 1px;
		z-index: 10;
		background: linear-gradient(90deg, var(--cyan), var(--green));
	}
	.tickets-board__board::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 1px;
		z-index: 10;
		background: linear-gradient(90deg, var(--cyan), var(--green));
	}
}

/* Hide scrollbar for Webkit browsers */
.overflow-hidden-scrollbar::-webkit-scrollbar {
	display: none;
}

/* Optional: Hide scrollbar for Firefox */
.overflow-hidden-scrollbar {
	scrollbar-width: none;
}

/* Maintain smooth scrolling */
.overflow-hidden-scrollbar {
	-ms-overflow-style: none; /* IE and Edge */
}

@media (max-width: 768px) {
	.column-transition-enter-active,
	.column-transition-leave-active {
		transition: transform 0.3s ease-in-out;
	}

	.column-transition-enter-from {
		transform: translateX(100%);
	}

	.column-transition-leave-to {
		transform: translateX(-100%);
	}
}

.ticket-wrapper {
	transition: all 0.3s ease;
}

.ghost {
	opacity: 0.5;
	background: #f0f0f0;
}

.chosen {
	box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}

.drag {
	opacity: 0.9;
	box-shadow: 0 15px 25px rgba(0, 0, 0, 0.15);
}

.is-dragging {
	transition: all 0.3s ease;
}

.drop-zone-indicator {
	display: none;
	text-align: center;
	padding: 1rem;
	color: #6b7280;
	font-size: 0.875rem;
	border: 2px dashed var(--cyan);
	border-radius: 0.1rem;
	margin-top: 0.5rem;
	opacity: 0;
	transform: translateY(-10px);
	transition: all 0.3s ease;
}

.drop-zone-indicator.show {
	display: block;
	opacity: 1;
	transform: translateY(0);
}

.ticket-move {
	transition: transform 0.5s ease;
}

.ticket-enter-active,
.ticket-leave-active {
	transition: all 0.5s ease;
}

.ticket-enter-from,
.ticket-leave-to {
	opacity: 0;
	transform: translateX(30px);
}
</style>

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
			<div v-if="!isConnected && !isLoading && hasEverConnected" class="mb-4 absolute w-64 right-10 top-0 tickets-board__connection">
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
			<div class="flex items-center gap-3 mb-4 xl:mb-0">
				<TicketsCreate :columns="columns" :default-project="projectId" :default-organization="organizationId" @ticketCreated="handleTicketCreated" />
				<UButton
					v-if="!projectId"
					icon="i-heroicons-x-mark"
					size="xs"
					color="gray"
					variant="ghost"
					@click="clearFilters"
					class="uppercase text-[10px] transition-opacity duration-500 p-0"
					:class="hasActiveFilters ? 'opacity-100' : 'opacity-0 pointer-events-none'"
				>
					Clear Filters
				</UButton>
			</div>

			<div v-if="!projectId" class="hidden md:flex flex-col items-end gap-2 relative mb-4 xl:mb-0 shrink-0">
				<!-- Row 1: Toggles -->
				<div class="flex flex-row items-center gap-4">
					<button
						class="flex flex-row items-center space-x-2 cursor-pointer"
						@click="filterByAssignedTo = !filterByAssignedTo"
					>
						<UToggle :model-value="filterByAssignedTo" />
						<span class="text-[10px] uppercase select-none whitespace-nowrap" :class="filterByAssignedTo ? 'text-foreground font-semibold' : 'text-muted-foreground'">
							{{ filterByAssignedTo ? 'My Tickets' : 'All Tickets' }}
						</span>
					</button>
					<button
						class="flex flex-row items-center space-x-2 cursor-pointer"
						:disabled="filterByAssignedTo"
						@click="!filterByAssignedTo && (filterUnassigned = !filterUnassigned)"
					>
						<UToggle :model-value="filterUnassigned" :disabled="filterByAssignedTo" />
						<span class="text-[10px] uppercase select-none whitespace-nowrap" :class="filterUnassigned ? 'text-foreground font-semibold' : 'text-muted-foreground'">
							{{ filterUnassigned ? 'Unassigned Only' : 'All Assignments' }}
						</span>
					</button>
					<transition name="fade">
						<UIcon v-if="isFetching" name="i-heroicons-arrow-path" class="w-4 h-4 text-muted-foreground animate-spin" />
					</transition>
				</div>
				<!-- Row 2: Due Date, Project, Archive -->
				<div class="flex flex-row items-center gap-4">
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
							class="w-full lg:w-64 uppercase text-[8px] text-muted-foreground relative"
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
									<span v-if="option.organization" class="text-[9px] leading-3 text-muted-foreground">
										{{ option.organization.name }}
									</span>
									<span v-if="option.team" class="text-[9px] leading-3 text-muted-foreground">
										Team: {{ option.team.name }}
									</span>
								</div>
							</template>
						</USelectMenu>
					</div>
					<UButton
						icon="i-heroicons-archive-box"
						size="xs"
						:color="showArchived ? 'primary' : 'gray'"
						:variant="showArchived ? 'soft' : 'outline'"
						@click="toggleArchived"
						class="uppercase text-[10px] border border-border/60"
					>
						{{ showArchived ? 'View Board' : 'Archived' }}
					</UButton>
				</div>
				<div v-if="lastUpdated" class="-bottom-[22.5px] text-[9px] right-0 text-muted-foreground absolute font-bold uppercase">
					Last updated: {{ formatLastUpdated(lastUpdated) }}
				</div>
			</div>
		</div>

		<!-- Archived Tickets View -->
		<transition name="fade" mode="out-in">
		<div v-if="showArchived" key="archived-view" class="px-4">
			<div class="bg-card border border-border rounded-2xl p-6">
				<div class="flex items-center justify-between mb-6">
					<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
						<UIcon name="i-heroicons-archive-box" class="w-4 h-4" />
						Archived Tickets
						<span v-if="archivedTickets.length" class="text-xs font-normal text-muted-foreground">({{ archivedTickets.length }})</span>
					</h3>
				</div>

				<div v-if="isLoadingArchived" class="flex items-center justify-center py-12">
					<LayoutLoader text="Loading archived tickets" />
				</div>

				<div v-else-if="!archivedTickets.length" class="text-center py-12 text-muted-foreground">
					<UIcon name="i-heroicons-archive-box" class="w-8 h-8 mx-auto mb-2 opacity-40" />
					<p class="text-sm">No archived tickets</p>
				</div>

				<div v-else class="space-y-2">
					<div
						v-for="ticket in archivedTickets"
						:key="ticket.id"
						class="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors stagger-item"
					>
						<div class="flex-1 min-w-0">
							<nuxt-link :to="`/tickets/${ticket.id}`" class="text-sm font-medium text-foreground hover:underline truncate block">
								{{ ticket.title }}
							</nuxt-link>
							<div class="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground uppercase">
								<span v-if="ticket.organization?.name" class="flex items-center gap-1">
									<UIcon name="i-heroicons-building-office" class="w-3 h-3" />
									{{ ticket.organization.name }}
								</span>
								<span v-if="ticket.date_updated" class="flex items-center gap-1">
									<UIcon name="i-heroicons-clock" class="w-3 h-3" />
									Archived {{ getFriendlyDate(ticket.date_updated) }}
								</span>
								<span v-if="ticket.priority" class="flex items-center gap-1">
									Priority: {{ ticket.priority }}
								</span>
							</div>
						</div>
						<UTooltip text="Restore to Pending" :popper="{ arrow: true }">
							<UButton
								icon="i-heroicons-arrow-uturn-left"
								size="xs"
								color="gray"
								variant="soft"
								@click="restoreTicket(ticket.id)"
								class="ml-3"
							/>
						</UTooltip>
					</div>
				</div>
			</div>
		</div>

		<div v-else key="board-view">
		<!-- Mobile Column Navigation -->
		<div
			v-if="isMobile"
			class="flex items-center justify-between mb-4 mx-4 rounded-xl bg-card border border-border px-4 gap-4 py-3 text-foreground shadow-sm"
		>
			<UIcon name="i-heroicons-chevron-left" class="w-5 h-5" @click="previousColumn" />
			<h3 class="text-sm font-medium uppercase tracking-wide">
				{{ columns.find((col) => col.id === activeColumn)?.name }}
			</h3>
			<UIcon name="i-heroicons-chevron-right" class="w-5 h-5" @click="nextColumn" />
		</div>

		<!-- Main Board -->
		<div
			class="bg-muted/20 border border-border/50 rounded-2xl w-full flex min-h-svh overflow-x-auto overflow-hidden overflow-hidden-scrollbar tickets-board__board"
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
					<div class="flex items-center gap-3">
						<div class="h-5 w-1 rounded-full" :style="{ backgroundColor: `var(--${column.color})` }" />
						<h3 class="text-xs font-semibold uppercase tracking-wider text-foreground flex-1">{{ column.name }}</h3>
						<span
							class="text-[10px] font-bold tabular-nums min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5"
							:style="{ backgroundColor: `var(--${column.color})`, color: 'var(--darkBlue)' }"
						>
							{{ localTickets[column.id]?.length || 0 }}
						</span>
					</div>
				</div>

				<!-- Loading Skeletons -->
				<div
					v-if="isLoading && !localTickets[column.id]?.length"
					class="min-h-[90svh] p-2 bg-muted"
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
						<div :id="element.id" class="ticket-wrapper stagger-item">
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
		</transition>
	</div>
</template>

<script setup>
import VueDraggable from 'vuedraggable';

const ticketItems = useDirectusItems('tickets');
const commentItems = useDirectusItems('comments');
const projectItems = useDirectusItems('projects');
const { registerRefreshCallback } = useTicketsStore();
const { user } = useDirectusAuth();
const { triggerHaptic } = useHaptic();
const toast = useToast();
const config = useRuntimeConfig();

// Use our composables
const { selectedOrg, organizations, setupListeners: setupOrgListeners, getOrganizationFilter } = useOrganization();
const { selectedClient, getClientFilter } = useClients();

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
	organizationId: {
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
const showArchived = ref(false);
const archivedTickets = ref([]);
const isLoadingArchived = ref(false);
const updatingTickets = ref(new Set());
const isDragging = ref(false);
const selectedProject = ref(props.projectId || null);
const projectOptions = ref([]);
const filterByAssignedTo = ref(false);
const filterUnassigned = ref(false);
const filterDueDate = ref(null);
const isLoading = ref(true);
const isFetching = ref(false);
const isConnected = ref(true);
const hasEverConnected = ref(false);
const error = ref(null);
const lastUpdated = ref(null);
let cleanupMobileDetection = null;
let commentSub = null;

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
	'tasks.id',
	'tasks.status',
	'team.id',
	'team.name',
	'client.id',
	'client.name',
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

	const filter = { _and: [{ status: { _neq: 'Archived' } }] };

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
		filter._and.push({
			assigned_to: { _some: { directus_users_id: { id: { _eq: user.value.id } } } },
		});
	} else if (filterUnassigned.value) {
		filter._and.push({
			assigned_to: { _none: {} },
		});
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

	// Client filter
	const clientFilter = getClientFilter();
	if (Object.keys(clientFilter).length > 0) {
		filter._and.push(clientFilter);
	}

	// Clean up empty filter
	if (filter._and.length === 0) {
		return {}; // Return empty object instead of deleting _and
	}

	console.log('Generated filter:', filter);
	return filter;
};

// Fetch comment counts and attach them to tickets
const attachCommentCounts = async (tickets) => {
	const ticketIds = tickets.map((ticket) => ticket.id).filter(Boolean);

	if (ticketIds.length === 0) {
		tickets.forEach((ticket) => {
			ticket.comments = 0;
			ticket.commentsCount = 0;
		});
		return;
	}

	try {
		const commentCounts = await commentItems.list({
			filter: {
				collection: { _eq: 'tickets' },
				item: { _in: ticketIds },
			},
			fields: ['item'],
			aggregate: {
				count: ['*'],
			},
			groupBy: ['item'],
		});

		const countMap = {};
		if (Array.isArray(commentCounts)) {
			commentCounts.forEach((result) => {
				if (result && result.item) {
					countMap[result.item] = parseInt(result.count, 10) || 0;
				}
			});
		}

		tickets.forEach((ticket) => {
			const commentCount = countMap[ticket.id] || 0;
			ticket.comments = commentCount;
			ticket.commentsCount = commentCount;
		});
	} catch (err) {
		console.error('Error fetching comment counts:', err);
		tickets.forEach((ticket) => {
			ticket.comments = 0;
			ticket.commentsCount = 0;
		});
	}
};

// Fetch tickets via REST API for instant display
const fetchTicketsViaREST = async (filter) => {
	isFetching.value = true;

	try {
		const tickets = await ticketItems.list({
			fields,
			filter,
			sort: ['-date_updated'],
		});

		const result = tickets || [];
		await attachCommentCounts(result);
		return result;
	} catch (err) {
		console.error('Error fetching tickets via REST:', err);
		return null;
	} finally {
		isFetching.value = false;
	}
};

// Set up WebSocket subscription for real-time updates, using pre-fetched data
const setupRealtimeOnly = (filter, initialTickets) => {
	// Clean up existing subscription
	if (disconnectFunc) {
		disconnectFunc();
	}

	const {
		data,
		isConnected: wsConnected,
		error: wsError,
		lastUpdated: wsLastUpdated,
		connect,
		disconnect,
		updateFilter,
		refresh,
	} = useRealtimeSubscription('tickets', fields, filter, '-date_updated', initialTickets);

	connectFunc = connect;
	disconnectFunc = disconnect;
	ticketsData.value = data;

	ticketsSubscription = {
		updateFilter,
		refresh,
	};

	// Track connection state
	watch(
		wsConnected,
		(val) => {
			// Don't update connection state while REST fetch is in progress
			if (!isFetching.value) {
				isConnected.value = val;
			}
			if (val) {
				hasEverConnected.value = true;
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

	// Process real-time updates as they arrive
	watch(
		data,
		async (newData) => {
			if (newData && newData.length > 0) {
				await attachCommentCounts(newData);
				processTickets(newData);
			}
		},
	);

	// Connect WebSocket
	if (import.meta.client) {
		connect();
	}
};

// Main loading function: REST first, then WebSocket
const loadTickets = async () => {
	const filter = generateFilter();

	if (import.meta.server) {
		isLoading.value = false;
		return;
	}

	isLoading.value = true;

	// 1. Fetch via REST for instant display
	const tickets = await fetchTicketsViaREST(filter);

	if (tickets) {
		processTickets(tickets);
		isConnected.value = true;
	}

	// End loading immediately after REST data is displayed
	isLoading.value = false;

	// 2. Set up WebSocket subscription for real-time updates
	setupRealtimeOnly(filter, tickets || []);
};

// Refresh: re-fetch via REST and reconnect WebSocket
const refreshData = async () => {
	console.log('Board: Refreshing tickets...');
	await loadTickets();
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
		const projects = await projectItems.list({
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

// Debounced filter update: re-fetch via REST and update WebSocket filter
const debouncedUpdateSubscription = debounce(async () => {
	const filter = generateFilter();

	// Fetch fresh data via REST immediately
	const tickets = await fetchTicketsViaREST(filter);
	if (tickets) {
		processTickets(tickets);
	}

	// Update the WebSocket subscription filter
	if (ticketsSubscription) {
		ticketsSubscription.updateFilter(filter);
	} else {
		setupRealtimeOnly(filter, tickets || []);
	}
}, 300);

// Archive functions
const toggleArchived = async () => {
	showArchived.value = !showArchived.value;
	if (showArchived.value) {
		await fetchArchivedTickets();
	}
};

const fetchArchivedTickets = async () => {
	isLoadingArchived.value = true;
	try {
		const filter = { _and: [{ status: { _eq: 'Archived' } }] };

		// Add org filter if not admin viewing all
		if (selectedOrg.value) {
			filter._and.push({ organization: { _eq: selectedOrg.value } });
		}

		const result = await ticketItems.list({
			fields: [
				'id', 'title', 'status', 'priority', 'date_updated',
				'organization.id', 'organization.name',
			],
			filter,
			sort: ['-date_updated'],
			limit: 100,
		});
		archivedTickets.value = result || [];
	} catch (err) {
		console.error('Failed to fetch archived tickets:', err);
		archivedTickets.value = [];
	} finally {
		isLoadingArchived.value = false;
	}
};

const restoreTicket = async (ticketId) => {
	try {
		await ticketItems.update(ticketId, { status: 'Pending', date_updated: new Date() });
		archivedTickets.value = archivedTickets.value.filter((t) => t.id !== ticketId);
		toast.add({ title: 'Ticket restored to Pending', color: 'green' });
		await refreshData();
	} catch (err) {
		console.error('Failed to restore ticket:', err);
		toast.add({ title: 'Failed to restore ticket', color: 'red' });
	}
};

// Drag and drop handlers
const { feedback: triggerFeedback } = useFeedback();

const onDragStart = () => {
	isDragging.value = true;
	triggerFeedback('drag');
};

const onDragEnd = () => {
	isDragging.value = false;
	triggerFeedback('drop');
};

const updateTicketStatus = async (columnId, event) => {
	if (!event.added) return;

	const ticketId = event.added.element.id;
	const newStatus = columnId;

	updatingTickets.value.add(ticketId);

	try {
		await ticketItems.update(ticketId, {
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

const setupCommentSubscription = () => {
	// Skip if we're on server side
	if (import.meta.server) return { connect: () => {}, disconnect: () => {} };

	console.log('Setting up comment subscription for real-time updates');

	// Create a basic filter for all ticket comments
	const commentFilter = {
		collection: { _eq: 'tickets' },
	};

	// Simple fields, we just need to know when comments change
	const commentFields = ['id', 'item'];

	// Set up subscription
	const { connect: commentConnect, disconnect: commentDisconnect } = useRealtimeSubscription(
		'comments',
		commentFields,
		commentFilter,
		null, // no sort needed
	);

	// We'll listen for any comment changes and refresh our tickets
	// This approach is simpler than trying to update specific tickets
	const handleCommentChange = () => {
		console.log('Comment change detected, refreshing ticket data');
		refreshData();
	};

	// Return the connection functions
	return {
		connect: () => {
			commentConnect();
			// Listen for comment changes
			document.addEventListener('comment-changed', handleCommentChange);
		},
		disconnect: () => {
			commentDisconnect();
			document.removeEventListener('comment-changed', handleCommentChange);
		},
	};
};

// Lifecycle hooks
onMounted(async () => {
	console.log('Board: Component mounted');

	commentSub = setupCommentSubscription();
	if (commentSub?.connect) commentSub.connect();

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

		if (import.meta.client) {
			await loadTickets();
		}
	} else {
		isLoading.value = false;
	}
});

onUnmounted(() => {
	// Clean up mobile detection
	if (cleanupMobileDetection) {
		cleanupMobileDetection();
	}
	if (commentSub?.disconnect) commentSub.disconnect();
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

			// Re-load tickets via REST and reconnect WebSocket
			await loadTickets();
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

watch(
	() => selectedClient.value,
	() => {
		debouncedUpdateSubscription();
	},
);
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";
.tickets-board {
	.tickets-board__board {
		@apply relative;
	}
	.tickets-board__board-filters {
		@apply relative max-w-[2000px];
	}
	.tickets-board__board-connection {
		@apply max-w-[2000px];
	}
	.tickets-board__board-col {
		@apply border-border/50 border-r;
	}
	.tickets-board__board-col-header {
		@apply relative py-4 px-4 border-b border-border sticky top-0 z-10;
		background: rgba(255, 255, 255, 0.78);
		backdrop-filter: saturate(180%) blur(20px);
		-webkit-backdrop-filter: saturate(180%) blur(20px);
		@media (min-width: 1600px) {
			@apply px-8;
		}
	}
	:is(.dark) .tickets-board__board-col-header {
		background: rgba(20, 20, 20, 0.78);
	}
	.tickets-board__board-col-content {
		@apply min-h-screen lg:h-svh h-full py-3 bg-muted/20 dark:bg-card/30 overflow-y-auto px-3;
		scrollbar-width: none;
		-ms-overflow-style: none;
		&::-webkit-scrollbar {
			display: none;
		}
		@media (min-width: 1600px) {
			@apply px-6;
		}
	}
	/* Rounded corners on first/last columns to match container */
	.tickets-board__board > div:first-child .tickets-board__board-col-header {
		border-top-left-radius: 1rem;
	}
	.tickets-board__board > div:first-child .tickets-board__board-col-content {
		border-bottom-left-radius: 1rem;
	}
	.tickets-board__board > div:last-child .tickets-board__board-col-header {
		border-top-right-radius: 1rem;
	}
	.tickets-board__board > div:last-child .tickets-board__board-col-content {
		border-bottom-right-radius: 1rem;
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

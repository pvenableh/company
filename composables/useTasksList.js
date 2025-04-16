// composables/useTasksList.js
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';

export function useTasksList({
	organizationId = null,
	teamId = null,
	projectId = null,
	userId = null,
	limit = 20,
	sortBy = 'due_date',
} = {}) {
	const router = useRouter();
	const tasks = ref([]);
	const isLoading = ref(true);
	const isConnected = ref(true);
	const error = ref(null);
	const lastUpdated = ref(null);

	let disconnect = null;
	let refresh = null;
	let connect = null;

	// Tasks being updated (for loading indicators)
	const updatingTasks = ref(new Set());

	// Generate filter based on provided parameters
	const generateFilter = () => {
		const filter = { _and: [] };

		// Organization filter
		if (organizationId) {
			filter._and.push({ organization: { _eq: organizationId } });
		}

		// Team filter
		if (teamId) {
			filter._and.push({ team: { _eq: teamId } });
		}

		// Project filter
		if (projectId) {
			filter._and.push({ project: { _eq: projectId } });
		}

		// User assignment filter (optional)
		if (userId) {
			filter._and.push({
				assigned_to: {
					directus_users_id: { id: { _eq: userId } },
				},
			});
		}

		// Clean up empty filter
		if (filter._and.length === 0) {
			return {};
		}

		return filter;
	};

	// Fields to fetch
	const fields = [
		'id',
		'title',
		'status',
		'due_date',
		'organization.id',
		'organization.name',
		'team.id',
		'team.name',
		'project.id',
		'project.title',
		'tasks.id',
		'tasks.description',
		'tasks.status',
		'tasks.sort',
		'tasks.date_created',
		'tasks.date_updated',
		'tasks.user_created.first_name',
		'tasks.user_created.last_name',
		'tasks.user_updated.first_name',
		'tasks.user_updated.last_name',
		'tasks.user_updated.id',
		'tasks.assigned_to.directus_users_id.id',
		'tasks.assigned_to.directus_users_id.first_name',
		'tasks.assigned_to.directus_users_id.last_name',
	];

	// Set up the subscription
	const setupSubscription = () => {
		if (import.meta.server) {
			isLoading.value = false;
			return;
		}

		const filter = generateFilter();

		// Use the existing useRealtimeSubscription composable
		const {
			data: ticketsData,
			isLoading: wsLoading,
			isConnected: wsConnected,
			error: wsError,
			lastUpdated: wsLastUpdated,
			connect: wsConnect,
			disconnect: wsDisconnect,
			refresh: wsRefresh,
		} = useRealtimeSubscription('tickets', fields, filter, sortBy, limit);

		// Store functions for later use
		connect = wsConnect;
		disconnect = wsDisconnect;
		refresh = wsRefresh;

		// Watch for subscription state changes
		watch(
			wsLoading,
			(val) => {
				isLoading.value = val;
			},
			{ immediate: true },
		);
		watch(
			wsConnected,
			(val) => {
				isConnected.value = val;
			},
			{ immediate: true },
		);
		watch(
			wsError,
			(val) => {
				error.value = val;
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

		// Process tickets data when it changes
		watch(
			ticketsData,
			(newTickets) => {
				// Initialize with empty array
				tasks.value = [];

				// Check if newTickets is an array and has items
				if (!newTickets || !Array.isArray(newTickets) || newTickets.length === 0) {
					isLoading.value = false;
					return;
				}

				const allTasks = [];

				// Process each ticket and extract tasks
				newTickets.forEach((ticket) => {
					if (ticket && ticket.tasks && Array.isArray(ticket.tasks) && ticket.tasks.length > 0) {
						// Add ticket context to each task
						const tasksWithContext = ticket.tasks
							.map((task) => {
								if (!task) return null;

								return {
									...task,
									ticketContext: {
										id: ticket.id,
										title: ticket.title,
										status: ticket.status,
										due_date: ticket.due_date,
										organization: ticket.organization,
										team: ticket.team,
										project: ticket.project,
									},
								};
							})
							.filter(Boolean); // Remove any null entries

						allTasks.push(...tasksWithContext);
					}
				});

				// Sort tasks (by due date and sort order)
				allTasks.sort((a, b) => {
					// First by ticket due date
					const dateA = a.ticketContext?.due_date ? new Date(a.ticketContext.due_date) : new Date(0);
					const dateB = b.ticketContext?.due_date ? new Date(b.ticketContext.due_date) : new Date(0);

					if (dateA < dateB) return -1;
					if (dateA > dateB) return 1;

					// Then by task sort order
					return (a.sort || 0) - (b.sort || 0);
				});

				// Take only the first 'limit' tasks
				tasks.value = allTasks.slice(0, limit);

				isLoading.value = false;
			},
			{ immediate: true },
		);

		// Safety timeout to prevent infinite loading state
		setTimeout(() => {
			if (isLoading.value) {
				isLoading.value = false;
			}
		}, 5000);
	};

	// Function to toggle task status
	const toggleTaskStatus = async (taskId) => {
		// Find the task
		const task = tasks.value.find((t) => t.id === taskId);
		if (!task) return;

		// Mark as updating
		updatingTasks.value.add(taskId);

		try {
			const { updateItem } = useDirectusItems();

			// Toggle status
			const newStatus = task.status === 'completed' ? 'active' : 'completed';

			// Update in Directus
			await updateItem('tasks', taskId, {
				status: newStatus,
				date_updated: new Date().toISOString(),
			});

			// Update local state (optimistic update)
			task.status = newStatus;
			task.date_updated = new Date().toISOString();

			// Force reactive update
			tasks.value = [...tasks.value];

			return true;
		} catch (err) {
			console.error('Error toggling task status:', err);

			// Revert local change on error
			if (task) {
				task.status = task.status === 'completed' ? 'active' : 'completed';
			}

			return false;
		} finally {
			// Remove from updating set
			updatingTasks.value.delete(taskId);
		}
	};

	// Function to navigate to ticket view
	const navigateToTicket = (ticketId) => {
		if (!ticketId) return;
		router.push(`/tickets/${ticketId}`);
	};

	// Refresh tasks data
	const refreshTasks = () => {
		isLoading.value = true;
		if (refresh) {
			refresh();
		}

		// Safety timeout
		setTimeout(() => {
			if (isLoading.value) {
				isLoading.value = false;
			}
		}, 5000);
	};

	// Initialize on component mount
	onMounted(() => {
		if (import.meta.client) {
			setupSubscription();
			// Connect to WebSocket
			if (connect) {
				connect();
			}
		}
	});

	// Initialize with empty values for SSR
	if (import.meta.server) {
		isLoading.value = false;
		tasks.value = [];
	}

	// Return all needed values and functions
	return {
		tasks: computed(() => tasks.value),
		isLoading: computed(() => isLoading.value),
		isConnected: computed(() => isConnected.value),
		error: computed(() => error.value),
		lastUpdated: computed(() => lastUpdated.value),
		updatingTasks: computed(() => updatingTasks.value),

		toggleTaskStatus,
		navigateToTicket,
		refreshTasks,

		// Clean up function for component unmount
		cleanup: () => {
			if (disconnect) {
				disconnect();
			}
		},
	};
}

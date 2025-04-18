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
	const totalCount = ref(0); // Added total count for pagination

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

		// Team filter - note the modified structure to target team assignments
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
					directus_users_id: { _eq: userId },
				},
			});
		}

		// Clean up empty filter
		if (filter._and.length === 0) {
			return {};
		}

		console.log('Generated filter:', JSON.stringify(filter));
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

	// Process data and extract tasks with ticket context
	const processTicketData = (ticketsData) => {
		// Initialize with empty array
		const processedTasks = [];

		// Check if ticketsData is an array and has items
		if (!ticketsData || !Array.isArray(ticketsData) || ticketsData.length === 0) {
			return [];
		}

		console.log('Processing', ticketsData.length, 'tickets');

		// Process each ticket and extract tasks
		ticketsData.forEach((ticket) => {
			if (ticket && ticket.tasks && Array.isArray(ticket.tasks) && ticket.tasks.length > 0) {
				console.log(`Ticket ${ticket.id} has ${ticket.tasks.length} tasks`);

				// Add ticket context to each task
				const tasksWithContext = ticket.tasks
					.filter((task) => task) // Filter out null/undefined tasks
					.map((task) => ({
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
					}));

				processedTasks.push(...tasksWithContext);
			} else {
				console.log(`Ticket ${ticket?.id || 'unknown'} has no tasks`);
			}
		});

		console.log('Total processed tasks:', processedTasks.length);

		// Set the total count for pagination info
		totalCount.value = processedTasks.length;

		// Sort tasks by priority:
		// 1. Active tasks before completed tasks
		// 2. Overdue tasks first
		// 3. Due today second
		// 4. Then by due date
		// 5. Then by sort order
		processedTasks.sort((a, b) => {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);

			// First by completion status (active tasks first)
			if (a.status === 'completed' && b.status !== 'completed') return 1;
			if (a.status !== 'completed' && b.status === 'completed') return -1;

			// For active tasks, prioritize by due date
			if (a.status !== 'completed' && b.status !== 'completed') {
				const dateA = a.ticketContext?.due_date ? new Date(a.ticketContext.due_date) : null;
				const dateB = b.ticketContext?.due_date ? new Date(b.ticketContext.due_date) : null;

				// Handle cases where one or both tasks don't have due dates
				if (dateA && !dateB) return -1; // Tasks with due dates before tasks without due dates
				if (!dateA && dateB) return 1; // Tasks without due dates after tasks with due dates
				if (!dateA && !dateB) return 0; // If neither has a due date, they're equal for this sort

				// Check for overdue tasks
				const aIsOverdue = dateA < today;
				const bIsOverdue = dateB < today;
				if (aIsOverdue && !bIsOverdue) return -1; // Overdue tasks first
				if (!aIsOverdue && bIsOverdue) return 1;

				// Check for tasks due today
				const aIsDueToday = dateA >= today && dateA < tomorrow;
				const bIsDueToday = dateB >= today && dateB < tomorrow;
				if (aIsDueToday && !bIsDueToday) return -1; // Tasks due today second
				if (!aIsDueToday && bIsDueToday) return 1;

				// Otherwise sort by due date
				return dateA - dateB;
			}

			// For completed tasks, sort by completion date (most recent first)
			if (a.status === 'completed' && b.status === 'completed') {
				const updateA = a.date_updated ? new Date(a.date_updated) : new Date(0);
				const updateB = b.date_updated ? new Date(b.date_updated) : new Date(0);
				return updateB - updateA;
			}

			// Then by task sort order if all else is equal
			return (a.sort || 0) - (b.sort || 0);
		});

		return processedTasks;
	};

	// Set up the subscription
	const setupSubscription = () => {
		if (import.meta.server) {
			isLoading.value = false;
			return;
		}

		const filter = generateFilter();
		console.log('Setting up task subscription with filter:', filter);

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
		} = useRealtimeSubscription('tickets', fields, filter, sortBy);

		// Store functions for later use
		connect = wsConnect;
		disconnect = wsDisconnect;
		refresh = wsRefresh;

		// Watch for subscription state changes
		watch(
			wsLoading,
			(val) => {
				console.log('WebSocket loading state changed:', val);
				isLoading.value = val;
			},
			{ immediate: true },
		);

		watch(
			wsConnected,
			(val) => {
				console.log('WebSocket connection state changed:', val);
				isConnected.value = val;
			},
			{ immediate: true },
		);

		watch(
			wsError,
			(val) => {
				if (val) console.error('WebSocket error:', val);
				error.value = val;
			},
			{ immediate: true },
		);

		watch(
			wsLastUpdated,
			(val) => {
				if (val) console.log('WebSocket data updated at:', val);
				lastUpdated.value = val;
			},
			{ immediate: true },
		);

		// Process tickets data when it changes
		watch(
			ticketsData,
			(newTickets) => {
				console.log('Received ticket data:', newTickets?.length || 0, 'tickets');

				if (newTickets && newTickets.length > 0) {
					// Log count of tasks for first few tickets
					newTickets.slice(0, 3).forEach((ticket, i) => {
						console.log(`Ticket ${i + 1} (${ticket.id}) has ${ticket.tasks?.length || 0} tasks`);
					});
				}

				const allTasks = processTicketData(newTickets);
				console.log('Processed tasks:', allTasks.length);

				// Take only the first 'limit' tasks for initial view
				tasks.value = allTasks.slice(0, limit);
				console.log('Set tasks.value with', tasks.value.length, 'tasks (limited by', limit, ')');

				isLoading.value = false;
			},
			{ immediate: true, deep: true },
		);

		// Safety timeout to prevent infinite loading state
		setTimeout(() => {
			if (isLoading.value) {
				console.log('Forcing loading state to false after timeout');
				isLoading.value = false;
			}
		}, 5000);
	};

	// Function to toggle task status
	const toggleTaskStatus = async (taskId) => {
		// Find the task
		const task = tasks.value.find((t) => t.id === taskId);
		if (!task) {
			console.error('Task not found:', taskId);
			return;
		}

		// Mark as updating
		updatingTasks.value.add(taskId);
		console.log('Toggling task status:', taskId);

		try {
			const { updateItem } = useDirectusItems();

			// Toggle status
			const newStatus = task.status === 'completed' ? 'active' : 'completed';
			console.log('New status will be:', newStatus);

			// Update in Directus
			await updateItem('tasks', taskId, {
				status: newStatus,
			});

			// Get the current date for updated timestamp
			const now = new Date().toISOString();

			// Update local state (optimistic update)
			task.status = newStatus;
			task.date_updated = now;

			// Handle user info for update
			const { user } = useEnhancedAuth();
			if (user.value && newStatus === 'completed') {
				task.user_updated = {
					id: user.value.id,
					first_name: user.value.first_name,
					last_name: user.value.last_name,
				};
			}

			// Force reactive update
			tasks.value = [...tasks.value];
			console.log('Task updated successfully');

			// Optionally notify user of success
			if (import.meta.client) {
				const toast = useToast();
				toast.add({
					title: newStatus === 'completed' ? 'Task completed' : 'Task reopened',
					timeout: 2000,
				});
			}

			// Use ticketsStore to refresh parent components that might display this data
			if (import.meta.client) {
				try {
					const { triggerRefresh } = useTicketsStore();
					triggerRefresh();
				} catch (e) {
					console.warn('Could not trigger tickets refresh:', e);
				}
			}

			return true;
		} catch (err) {
			console.error('Error toggling task status:', err);

			// Revert local change on error
			if (task) {
				task.status = task.status === 'completed' ? 'active' : 'completed';
			}

			// Show error notification
			if (import.meta.client) {
				const toast = useToast();
				toast.add({
					title: 'Error updating task',
					description: 'Failed to update task status. Please try again.',
					color: 'red',
				});
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
		console.log('Navigating to ticket:', ticketId);
		router.push(`/tickets/${ticketId}`);
	};

	// Refresh tasks data
	const refreshTasks = () => {
		console.log('Refreshing tasks data');
		isLoading.value = true;

		if (refresh) {
			refresh();
		} else {
			// If the refresh function isn't available yet, re-setup the subscription
			console.log('Refresh function not available, re-setting up subscription');
			setupSubscription();
		}

		// Safety timeout
		setTimeout(() => {
			if (isLoading.value) {
				console.log('Force ending loading state after timeout');
				isLoading.value = false;
			}
		}, 5000);
	};

	// Watch for changes in filter params to update subscription
	watch(
		() => [organizationId, teamId, projectId, userId, limit],
		(newValues, oldValues) => {
			// Only refresh if values actually changed
			if (JSON.stringify(newValues) !== JSON.stringify(oldValues)) {
				console.log('Task list filter params changed:', {
					organizationId,
					teamId,
					projectId,
					userId,
					limit,
				});
				refreshTasks();
			}
		},
		{ immediate: true, deep: true },
	);

	// Initialize on component mount
	onMounted(() => {
		if (import.meta.client) {
			console.log('Component mounted, setting up subscription');
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
		totalCount: computed(() => totalCount.value),

		toggleTaskStatus,
		navigateToTicket,
		refreshTasks,

		// Clean up function for component unmount
		cleanup: () => {
			if (disconnect) {
				console.log('Cleaning up and disconnecting WebSocket');
				disconnect();
			}
		},
	};
}

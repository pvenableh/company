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
	const totalCount = ref(0);

	// Get global organization and team values
	const { selectedOrg, getOrganizationFilter } = useOrganization();
	const { selectedTeam, getTeamFilter } = useTeams();

	let disconnect = null;
	let refresh = null;
	let connect = null;
	let updateFilterFunc = null;
	let subscriptionInitialized = false;

	const updatingTasks = ref(new Set());

	const effectiveOrgId = computed(() => {
		console.log('Computed effectiveOrgId:', organizationId || selectedOrg.value?.id);
		return organizationId || selectedOrg.value?.id;
	});

	const effectiveTeamId = computed(() => (teamId !== undefined ? teamId : selectedTeam.value?.id));

	const generateFilter = () => {
		const filter = { _and: [] };

		if (effectiveOrgId.value) {
			const orgFilter = getOrganizationFilter(effectiveOrgId.value);
			if (orgFilter && Object.keys(orgFilter).length > 0) {
				filter._and.push(orgFilter);
			}
		}

		if (effectiveTeamId.value) {
			const teamFilter = getTeamFilter(effectiveTeamId.value);
			if (teamFilter && Object.keys(teamFilter).length > 0) {
				filter._and.push(teamFilter);
			}
		}

		if (projectId) {
			filter._and.push({ project: { _eq: projectId } });
		}

		if (userId) {
			filter._and.push({
				assigned_to: {
					directus_users_id: { _eq: userId },
				},
			});
		}

		if (filter._and.length === 0) {
			return {};
		}

		console.log('Generated task filter:', JSON.stringify(filter));
		return filter;
	};

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

	const processTicketData = (ticketsData) => {
		const processedTasks = [];

		if (!ticketsData || !Array.isArray(ticketsData) || ticketsData.length === 0) {
			return [];
		}

		console.log('Processing', ticketsData.length, 'tickets');

		ticketsData.forEach((ticket) => {
			if (ticket && ticket.tasks && Array.isArray(ticket.tasks) && ticket.tasks.length > 0) {
				console.log(`Ticket ${ticket.id} has ${ticket.tasks.length} tasks`);

				const tasksWithContext = ticket.tasks
					.filter((task) => task)
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
		totalCount.value = processedTasks.length;

		processedTasks.sort((a, b) => {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);

			if (a.status === 'completed' && b.status !== 'completed') return 1;
			if (a.status !== 'completed' && b.status === 'completed') return -1;

			if (a.status !== 'completed' && b.status !== 'completed') {
				const dateA = a.ticketContext?.due_date ? new Date(a.ticketContext.due_date) : null;
				const dateB = b.ticketContext?.due_date ? new Date(b.ticketContext.due_date) : null;

				if (dateA && !dateB) return -1;
				if (!dateA && dateB) return 1;
				if (!dateA && !dateB) return 0;

				const aIsOverdue = dateA < today;
				const bIsOverdue = dateB < today;
				if (aIsOverdue && !bIsOverdue) return -1;
				if (!aIsOverdue && bIsOverdue) return 1;

				const aIsDueToday = dateA >= today && dateA < tomorrow;
				const bIsDueToday = dateB >= today && dateB < tomorrow;
				if (aIsDueToday && !bIsDueToday) return -1;
				if (!aIsDueToday && bIsDueToday) return 1;

				return dateA - dateB;
			}

			if (a.status === 'completed' && b.status === 'completed') {
				const updateA = a.date_updated ? new Date(a.date_updated) : new Date(0);
				const updateB = b.date_updated ? new Date(b.date_updated) : new Date(0);
				return updateB - updateA;
			}

			return (a.sort || 0) - (b.sort || 0);
		});

		return processedTasks;
	};

	const setupSubscription = () => {
		if (import.meta.server) {
			isLoading.value = false;
			return;
		}

		const filter = generateFilter();
		console.log('Setting up task subscription with filter:', filter);

		const {
			data: ticketsData,
			isLoading: wsLoading,
			isConnected: wsConnected,
			error: wsError,
			lastUpdated: wsLastUpdated,
			connect: wsConnect,
			disconnect: wsDisconnect,
			refresh: wsRefresh,
			updateFilter: wsUpdateFilter,
		} = useRealtimeSubscription('tickets', fields, filter, sortBy);

		connect = wsConnect;
		disconnect = wsDisconnect;
		refresh = wsRefresh;
		updateFilterFunc = wsUpdateFilter;
		subscriptionInitialized = true;

		watch(wsLoading, (val) => (isLoading.value = val), { immediate: true });
		watch(wsConnected, (val) => (isConnected.value = val), { immediate: true });
		watch(wsError, (val) => (error.value = val), { immediate: true });
		watch(wsLastUpdated, (val) => (lastUpdated.value = val), { immediate: true });

		watch(
			ticketsData,
			(newTickets) => {
				const allTasks = processTicketData(newTickets);
				tasks.value = allTasks.slice(0, limit);
				isLoading.value = false;
			},
			{ immediate: true, deep: true },
		);
	};

	watch([effectiveOrgId, effectiveTeamId], ([newOrgId, newTeamId], [oldOrgId, oldTeamId]) => {
		console.log('Effective filter values changed:', { organization: newOrgId, team: newTeamId });

		if (subscriptionInitialized && updateFilterFunc) {
			isLoading.value = true;
			const newFilter = generateFilter();
			console.log('Updating subscription filter:', newFilter);
			updateFilterFunc(newFilter);
		} else {
			console.warn('updateFilter function not available yet. Will update on setup.');
		}
	});

	const toggleTaskStatus = async (taskId) => {
		const task = tasks.value.find((t) => t.id === taskId);
		if (!task) {
			console.error('Task not found:', taskId);
			return;
		}

		updatingTasks.value.add(taskId);
		console.log('Toggling task status:', taskId);

		try {
			const { updateItem } = useDirectusItems();

			const newStatus = task.status === 'completed' ? 'active' : 'completed';
			console.log('New status will be:', newStatus);

			await updateItem('tasks', taskId, {
				status: newStatus,
			});

			const now = new Date().toISOString();

			task.status = newStatus;
			task.date_updated = now;

			const { user } = useDirectusAuth();
			if (user.value && newStatus === 'completed') {
				task.user_updated = {
					id: user.value.id,
					first_name: user.value.first_name,
					last_name: user.value.last_name,
				};
			}

			tasks.value = [...tasks.value];

			if (import.meta.client) {
				const toast = useToast();
				toast.add({
					title: newStatus === 'completed' ? 'Task completed' : 'Task reopened',
					timeout: 2000,
				});
			}

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

			if (task) {
				task.status = task.status === 'completed' ? 'active' : 'completed';
			}

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
			updatingTasks.value.delete(taskId);
		}
	};

	const navigateToTicket = (ticketId) => {
		if (!ticketId) return;
		console.log('Navigating to ticket:', ticketId);
		router.push(`/tickets/${ticketId}`);
	};

	const refreshTasks = () => {
		console.log('Refreshing tasks data');
		isLoading.value = true;
		if (refresh) {
			refresh();
		} else {
			console.log('Refresh function not available, re-setting up subscription');
			setupSubscription();
		}
		setTimeout(() => {
			if (isLoading.value) {
				console.log('Force ending loading state after timeout');
				isLoading.value = false;
			}
		}, 5000);
	};

	onMounted(() => {
		if (import.meta.client) {
			console.log('Component mounted, setting up subscription');
			setupSubscription();
			if (connect) {
				connect();
			}
		}
	});

	onUnmounted(() => {
		if (disconnect) {
			disconnect();
		}
	});

	if (import.meta.server) {
		isLoading.value = false;
		tasks.value = [];
	}

	return {
		tasks: computed(() => tasks.value),
		isLoading: computed(() => isLoading.value),
		isConnected: computed(() => isConnected.value),
		error: computed(() => error.value),
		lastUpdated: computed(() => lastUpdated.value),
		updatingTasks: computed(() => updatingTasks.value),
		totalCount: computed(() => totalCount.value),
		effectiveOrgId,
		effectiveTeamId,
		generateFilter,
		refresh,
		toggleTaskStatus,
		navigateToTicket,
		refreshTasks,
		cleanup: () => {
			if (disconnect) {
				console.log('Cleaning up and disconnecting WebSocket');
				disconnect();
			}
		},
	};
}

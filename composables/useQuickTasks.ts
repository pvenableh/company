// composables/useQuickTasks.ts
// Manages quick personal tasks persisted to Directus `tasks` collection.
// Tasks can be linked to tickets, projects, events, channels, teams, or clients.
// Supports day/week scheduling: Today, This Week, Later, or Unscheduled.

export type TaskSchedule = 'today' | 'this_week' | 'later' | 'unscheduled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskCategory = 'quick' | 'ticket' | 'project' | 'event' | 'channel' | 'team';

export interface TaskAssignee {
	id: string;
	first_name: string;
	last_name: string;
	avatar?: string | null;
}

export interface QuickTask {
	id: string;
	title: string;
	completed: boolean;
	priority: TaskPriority;
	createdAt: string;
	completedAt?: string;
	dueDate?: string;
	schedule: TaskSchedule;
	ticketId?: string;
	projectId?: string;
	projectEventId?: string;
	channelId?: string;
	teamId?: string;
	clientId?: string;
	organizationId?: string;
	category?: TaskCategory;
	aiSuggested?: boolean;
	assignee?: TaskAssignee | null;
	createdBy?: string;
	description?: string;
}

// ── Motivational messages ──
const MOTIVATIONAL_START = [
	"Let's make today count!",
	'You got this — one task at a time.',
	'Small steps lead to big results.',
	"Focus mode: activated.",
	"Ready to crush it? Let's go.",
];

const MOTIVATIONAL_PROGRESS = [
	'Nice! Keep that momentum going.',
	"You're on a roll!",
	'One down — you make it look easy.',
	'Progress feels good, right?',
	"That just got done. What's next?",
	'Crushing it!',
	'Every checkmark is a win.',
];

const MOTIVATIONAL_HALFWAY = [
	"Halfway there — you're unstoppable!",
	"Past the halfway mark. Finish strong!",
	"More done than left. You've got this.",
];

const MOTIVATIONAL_ALMOST = [
	'Almost there — the finish line is in sight!',
	'Just a few more to go!',
	'So close to clearing the list!',
];

const MOTIVATIONAL_DONE = [
	'All done! Time to celebrate.',
	'Clean slate — you earned it!',
	'Every single task: done. Legend.',
	'List cleared. Take a victory lap.',
];

function pickRandom(arr: string[]): string {
	return arr[Math.floor(Math.random() * arr.length)];
}

/** Map a Directus task record to the QuickTask interface used by the UI. */
function directusToQuickTask(record: any): QuickTask {
	// Resolve assignee from M2M junction
	let assignee: TaskAssignee | null = null;
	if (record.assigned_to?.length) {
		const first = record.assigned_to[0];
		const u = first?.directus_users_id;
		if (u && typeof u === 'object') {
			assignee = {
				id: u.id,
				first_name: u.first_name || '',
				last_name: u.last_name || '',
				avatar: u.avatar || null,
			};
		}
	}

	return {
		id: record.id,
		title: record.title || record.description || '',
		completed: record.status === 'completed',
		priority: record.priority || 'medium',
		createdAt: record.date_created || new Date().toISOString(),
		completedAt: record.date_completed || undefined,
		dueDate: record.due_date || undefined,
		schedule: record.schedule || 'unscheduled',
		ticketId: typeof record.ticket_id === 'object' ? record.ticket_id?.id : record.ticket_id || undefined,
		projectId: typeof record.project_id === 'object' ? record.project_id?.id : record.project_id || undefined,
		projectEventId: typeof record.project_event_id === 'object' ? record.project_event_id?.id : record.project_event_id || undefined,
		channelId: typeof record.channel_id === 'object' ? record.channel_id?.id : record.channel_id || undefined,
		teamId: typeof record.team_id === 'object' ? record.team_id?.id : record.team_id || undefined,
		clientId: typeof record.client_id === 'object' ? record.client_id?.id : record.client_id || undefined,
		organizationId: typeof record.organization_id === 'object' ? record.organization_id?.id : record.organization_id || undefined,
		category: record.category || 'quick',
		aiSuggested: record.ai_suggested || false,
		assignee,
		createdBy: typeof record.user_created === 'object' ? record.user_created?.id : record.user_created || undefined,
		description: record.description || undefined,
	};
}

// Shared reactive state (singleton across composable instances)
const tasks = ref<QuickTask[]>([]);
const isLoaded = ref(false);
const isLoading = ref(false);

export const useQuickTasks = () => {
	const { user } = useDirectusAuth();
	const { selectedOrg } = useOrganization();
	const taskItems = useDirectusItems('tasks');

	const TASK_FIELDS = [
		'id', 'title', 'description', 'status', 'sort', 'priority', 'schedule',
		'due_date', 'date_completed', 'date_created', 'user_created',
		'ticket_id', 'project_id', 'project_event_id', 'channel_id',
		'team_id', 'client_id', 'organization_id', 'category', 'ai_suggested',
		'assigned_to.id', 'assigned_to.directus_users_id.id',
		'assigned_to.directus_users_id.first_name',
		'assigned_to.directus_users_id.last_name',
		'assigned_to.directus_users_id.avatar',
	];

	/** Load tasks from Directus for the current user. */
	const load = async () => {
		if (import.meta.server || !user.value?.id) return;
		isLoading.value = true;
		try {
			const filter: any = {
				_and: [
					// Show tasks the user created (and didn't assign away) OR tasks assigned to them
					{
						_or: [
							{
								_and: [
									{ user_created: { _eq: user.value.id } },
									{
										_or: [
											{ assigned_to: { _null: true } },
											{ assigned_to: { directus_users_id: { _eq: user.value.id } } },
										],
									},
								],
							},
							{ assigned_to: { directus_users_id: { _eq: user.value.id } } },
						],
					},
				],
			};
			// Optionally scope to org
			if (selectedOrg.value) {
				filter._and.push({
					_or: [
						{ organization_id: { _eq: selectedOrg.value } },
						{ organization_id: { _null: true } },
					],
				});
			}

			const records = await taskItems.list({
				fields: TASK_FIELDS,
				filter,
				sort: ['-date_created'],
				limit: 200,
			});

			tasks.value = (records || []).map(directusToQuickTask);
		} catch (err) {
			console.error('[useQuickTasks] Failed to load tasks:', err);
			tasks.value = [];
		} finally {
			isLoading.value = false;
			isLoaded.value = true;
		}
	};

	const addTask = async (
		title: string,
		options?: Partial<Pick<QuickTask, 'priority' | 'dueDate' | 'schedule' | 'ticketId' | 'projectId' | 'projectEventId' | 'channelId' | 'teamId' | 'clientId' | 'category' | 'aiSuggested' | 'assignee' | 'description'>>,
	): Promise<QuickTask> => {
		// Auto-detect category from linked entity
		let category = options?.category || 'quick';
		if (!options?.category) {
			if (options?.ticketId) category = 'ticket';
			else if (options?.projectEventId) category = 'event';
			else if (options?.projectId) category = 'project';
			else if (options?.channelId) category = 'channel';
			else if (options?.teamId) category = 'team';
		}

		const payload: any = {
			title: title.trim(),
			status: 'new',
			priority: options?.priority || 'medium',
			schedule: options?.schedule || 'today',
			category,
			ai_suggested: options?.aiSuggested || false,
		};

		// Only include optional relational/nullable fields if they have values
		if (options?.dueDate) payload.due_date = options.dueDate;
		if (options?.ticketId) payload.ticket_id = options.ticketId;
		if (options?.projectId) payload.project_id = options.projectId;
		if (options?.projectEventId) payload.project_event_id = options.projectEventId;
		if (options?.channelId) payload.channel_id = options.channelId;
		if (options?.teamId) payload.team_id = options.teamId;
		if (options?.clientId) payload.client_id = options.clientId;
		if (selectedOrg.value) payload.organization_id = selectedOrg.value;
		if (options?.description) payload.description = options.description;

		// Handle assignee via M2M junction
		if (options?.assignee) {
			payload.assigned_to = [{ directus_users_id: options.assignee.id }];
		}

		let record;
		try {
			record = await taskItems.create(payload);
		} catch (err: any) {
			console.error('[useQuickTasks] Failed to create task:', err);
			throw err;
		}

		// Optimistically add to local state
		const task = directusToQuickTask({
			...record,
			user_created: user.value?.id,
			date_created: new Date().toISOString(),
			assigned_to: options?.assignee
				? [{ directus_users_id: options.assignee }]
				: [],
		});
		tasks.value.unshift(task);
		return task;
	};

	const removeTask = async (id: string) => {
		tasks.value = tasks.value.filter((t) => t.id !== id);
		try {
			await taskItems.remove(id);
		} catch (err) {
			console.error('[useQuickTasks] Failed to remove task:', err);
			await load(); // Reload on error
		}
	};

	const toggleTask = async (id: string): Promise<{ completed: boolean; motivationalMessage: string }> => {
		const task = tasks.value.find((t) => t.id === id);
		if (!task) return { completed: false, motivationalMessage: '' };

		const wasCompleted = task.completed;
		task.completed = !task.completed;
		task.completedAt = task.completed ? new Date().toISOString() : undefined;

		// Update in Directus
		try {
			await taskItems.update(id, {
				status: task.completed ? 'completed' : 'new',
				date_completed: task.completed ? new Date().toISOString() : null,
			});
		} catch (err) {
			console.error('[useQuickTasks] Failed to toggle task:', err);
			// Revert on error
			task.completed = wasCompleted;
			task.completedAt = wasCompleted ? task.completedAt : undefined;
		}

		// Generate motivational message on completion
		if (task.completed) {
			const active = tasks.value.filter((t) => !t.completed);
			const completed = tasks.value.filter((t) => t.completed);
			const total = tasks.value.length;
			const pct = total > 0 ? completed.length / total : 0;

			let message: string;
			if (active.length === 0) {
				message = pickRandom(MOTIVATIONAL_DONE);
			} else if (pct >= 0.75) {
				message = pickRandom(MOTIVATIONAL_ALMOST);
			} else if (pct >= 0.45) {
				message = pickRandom(MOTIVATIONAL_HALFWAY);
			} else {
				message = pickRandom(MOTIVATIONAL_PROGRESS);
			}
			return { completed: true, motivationalMessage: message };
		}

		return { completed: false, motivationalMessage: '' };
	};

	const updateTask = async (
		id: string,
		updates: Partial<Pick<QuickTask, 'title' | 'priority' | 'dueDate' | 'schedule' | 'ticketId' | 'projectId' | 'projectEventId' | 'channelId' | 'teamId' | 'clientId' | 'category' | 'assignee' | 'description'>>,
	) => {
		const task = tasks.value.find((t) => t.id === id);
		if (!task) return;

		// Build Directus update payload
		const payload: any = {};
		if (updates.title !== undefined) payload.title = updates.title;
		if (updates.priority !== undefined) payload.priority = updates.priority;
		if (updates.dueDate !== undefined) payload.due_date = updates.dueDate || null;
		if (updates.schedule !== undefined) payload.schedule = updates.schedule;
		if (updates.ticketId !== undefined) payload.ticket_id = updates.ticketId || null;
		if (updates.projectId !== undefined) payload.project_id = updates.projectId || null;
		if (updates.projectEventId !== undefined) payload.project_event_id = updates.projectEventId || null;
		if (updates.channelId !== undefined) payload.channel_id = updates.channelId || null;
		if (updates.teamId !== undefined) payload.team_id = updates.teamId || null;
		if (updates.clientId !== undefined) payload.client_id = updates.clientId || null;
		if (updates.category !== undefined) payload.category = updates.category;
		if (updates.description !== undefined) payload.description = updates.description;

		// Optimistic local update
		Object.assign(task, updates);

		try {
			await taskItems.update(id, payload);
		} catch (err) {
			console.error('[useQuickTasks] Failed to update task:', err);
			await load(); // Reload on error
		}
	};

	const reorderTasks = (newOrder: QuickTask[]) => {
		tasks.value = newOrder;
	};

	const clearCompleted = async () => {
		const completedIds = tasks.value.filter((t) => t.completed).map((t) => t.id);
		tasks.value = tasks.value.filter((t) => !t.completed);
		try {
			if (completedIds.length > 0) {
				await taskItems.remove(completedIds);
			}
		} catch (err) {
			console.error('[useQuickTasks] Failed to clear completed tasks:', err);
			await load();
		}
	};

	// Computed filters
	const activeTasks = computed(() => tasks.value.filter((t) => !t.completed));
	const completedTasks = computed(() => tasks.value.filter((t) => t.completed));
	const overdueTasks = computed(() => {
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		return tasks.value.filter((t) => {
			if (t.completed || !t.dueDate) return false;
			const due = new Date(t.dueDate);
			due.setHours(0, 0, 0, 0);
			return due < now;
		});
	});

	// Grouped by schedule
	const todayTasks = computed(() => activeTasks.value.filter((t) => t.schedule === 'today'));
	const thisWeekTasks = computed(() => activeTasks.value.filter((t) => t.schedule === 'this_week'));
	const laterTasks = computed(() => activeTasks.value.filter((t) => t.schedule === 'later'));
	const unscheduledTasks = computed(() => activeTasks.value.filter((t) => t.schedule === 'unscheduled'));

	// Progress for motivational messages
	const progress = computed(() => {
		const total = tasks.value.length;
		if (total === 0) return { total: 0, completed: 0, pct: 0 };
		const done = completedTasks.value.length;
		return { total, completed: done, pct: done / total };
	});

	// Starting motivation
	const startingMotivation = computed(() => {
		if (activeTasks.value.length === 0 && completedTasks.value.length === 0) return '';
		if (completedTasks.value.length === 0 && activeTasks.value.length > 0) {
			return pickRandom(MOTIVATIONAL_START);
		}
		return '';
	});

	// Load on init if not already loaded
	if (!isLoaded.value && !isLoading.value) {
		load();
	}

	// Reload when user changes
	watch(() => user.value?.id, () => {
		isLoaded.value = false;
		load();
	});

	return {
		tasks: readonly(tasks),
		activeTasks,
		completedTasks,
		overdueTasks,
		todayTasks,
		thisWeekTasks,
		laterTasks,
		unscheduledTasks,
		progress,
		startingMotivation,
		isLoading: readonly(isLoading),
		addTask,
		removeTask,
		toggleTask,
		updateTask,
		reorderTasks,
		clearCompleted,
		refresh: load,
	};
};

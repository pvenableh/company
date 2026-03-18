// composables/useQuickTasks.ts
// Manages quick personal to-do tasks with localStorage persistence.
// Tasks can optionally be linked to a ticket or project event.
// Supports day/week scheduling: Today, This Week, Later, or a specific date.

export type TaskSchedule = 'today' | 'this_week' | 'later' | 'unscheduled';

export interface QuickTask {
	id: string;
	title: string;
	completed: boolean;
	priority: 'low' | 'medium' | 'high';
	createdAt: string;
	completedAt?: string;
	dueDate?: string;
	/** Schedule bucket: today, this_week, later, or unscheduled */
	schedule: TaskSchedule;
	/** Optional link to a ticket */
	ticketId?: string;
	/** Optional link to a project event */
	projectEventId?: string;
	/** Whether this was AI-suggested */
	aiSuggested?: boolean;
}

const STORAGE_KEY = 'quick-tasks';

// Shared reactive state
const tasks = ref<QuickTask[]>([]);
const isLoaded = ref(false);

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

export const useQuickTasks = () => {
	const { user } = useDirectusAuth();

	const storageKey = computed(() => {
		const userId = user.value?.id || 'anonymous';
		return `${STORAGE_KEY}-${userId}`;
	});

	const load = () => {
		if (import.meta.server) return;
		try {
			const saved = localStorage.getItem(storageKey.value);
			if (saved) {
				const parsed = JSON.parse(saved) as QuickTask[];
				// Migrate older tasks without schedule field
				tasks.value = parsed.map((t) => ({
					...t,
					schedule: t.schedule || 'unscheduled',
				}));
			} else {
				tasks.value = [];
			}
		} catch {
			tasks.value = [];
		}
		isLoaded.value = true;
	};

	const save = () => {
		if (import.meta.server) return;
		try {
			localStorage.setItem(storageKey.value, JSON.stringify(tasks.value));
		} catch {}
	};

	const addTask = (title: string, options?: Partial<Pick<QuickTask, 'priority' | 'dueDate' | 'schedule' | 'ticketId' | 'projectEventId' | 'aiSuggested'>>) => {
		const task: QuickTask = {
			id: crypto.randomUUID(),
			title: title.trim(),
			completed: false,
			priority: options?.priority || 'medium',
			schedule: options?.schedule || 'today',
			createdAt: new Date().toISOString(),
			dueDate: options?.dueDate,
			ticketId: options?.ticketId,
			projectEventId: options?.projectEventId,
			aiSuggested: options?.aiSuggested,
		};
		tasks.value.unshift(task);
		save();
		return task;
	};

	const removeTask = (id: string) => {
		tasks.value = tasks.value.filter((t) => t.id !== id);
		save();
	};

	const toggleTask = (id: string): { completed: boolean; motivationalMessage: string } => {
		const task = tasks.value.find((t) => t.id === id);
		if (!task) return { completed: false, motivationalMessage: '' };

		task.completed = !task.completed;
		task.completedAt = task.completed ? new Date().toISOString() : undefined;
		save();

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

	const updateTask = (id: string, updates: Partial<Pick<QuickTask, 'title' | 'priority' | 'dueDate' | 'schedule' | 'ticketId' | 'projectEventId'>>) => {
		const task = tasks.value.find((t) => t.id === id);
		if (task) {
			Object.assign(task, updates);
			save();
		}
	};

	const reorderTasks = (newOrder: QuickTask[]) => {
		tasks.value = newOrder;
		save();
	};

	const clearCompleted = () => {
		tasks.value = tasks.value.filter((t) => !t.completed);
		save();
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

	// Load on init
	if (!isLoaded.value) {
		load();
	}

	// Reload when user changes
	watch(storageKey, () => load());

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
		addTask,
		removeTask,
		toggleTask,
		updateTask,
		reorderTasks,
		clearCompleted,
	};
};

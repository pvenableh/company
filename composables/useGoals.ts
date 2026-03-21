// composables/useGoals.ts
// Manages goals persisted to Directus `goals` collection.
// Supports snapshots for tracking progress over time.

import type { Goal, GoalSnapshot } from '~/types/directus';

// Shared reactive state (singleton across composable instances)
const goals = ref<Goal[]>([]);
const isLoaded = ref(false);
const isLoading = ref(false);

const GOAL_FIELDS = [
	'id', 'status', 'sort', 'user_created', 'date_created',
	'user_updated', 'date_updated', 'organization', 'title',
	'description', 'type', 'target_value', 'target_unit',
	'current_value', 'start_date', 'end_date', 'timeframe',
	'priority', 'assigned_to', 'team', 'client', 'tags',
	'metadata', 'snapshots.id', 'snapshots.value',
	'snapshots.notes', 'snapshots.date_created',
	'snapshots.user_created',
];

const SNAPSHOT_FIELDS = [
	'id', 'goal', 'value', 'notes', 'date_created', 'user_created',
];

export const useGoals = () => {
	const { user } = useDirectusAuth();
	const { selectedOrg } = useOrganization();
	const goalItems = useDirectusItems('goals');
	const snapshotItems = useDirectusItems('goal_snapshots');

	/** Load goals from Directus for the current org. */
	const load = async () => {
		if (import.meta.server || !user.value?.id) return;
		isLoading.value = true;
		try {
			const filter: any = {};
			if (selectedOrg.value) {
				filter.organization = { _eq: selectedOrg.value };
			}

			const records = await goalItems.list({
				fields: GOAL_FIELDS,
				filter,
				sort: ['-date_created'],
				limit: 200,
			});

			goals.value = (records || []) as Goal[];
		} catch (err) {
			console.error('[useGoals] Failed to load goals:', err);
			goals.value = [];
		} finally {
			isLoading.value = false;
			isLoaded.value = true;
		}
	};

	/** Create a new goal. */
	const createGoal = async (data: Partial<Goal>): Promise<Goal> => {
		const payload: any = { ...data };
		if (selectedOrg.value && !payload.organization) {
			payload.organization = selectedOrg.value;
		}
		// Remove snapshots from create payload — managed separately
		delete payload.snapshots;

		let record;
		try {
			record = await goalItems.create(payload);
		} catch (err: any) {
			console.error('[useGoals] Failed to create goal:', err);
			throw err;
		}

		const goal = { ...record, date_created: record?.date_created || new Date().toISOString() } as Goal;
		goals.value.unshift(goal);
		return goal;
	};

	/** Update an existing goal. */
	const updateGoal = async (id: string, data: Partial<Goal>): Promise<void> => {
		const payload: any = { ...data };
		delete payload.snapshots;

		// Optimistic local update
		const idx = goals.value.findIndex((g) => g.id === id);
		if (idx !== -1) {
			goals.value[idx] = { ...goals.value[idx], ...payload };
		}

		try {
			await goalItems.update(id, payload);
		} catch (err) {
			console.error('[useGoals] Failed to update goal:', err);
			await load(); // Reload on error
		}
	};

	/** Delete a goal. */
	const deleteGoal = async (id: string): Promise<void> => {
		goals.value = goals.value.filter((g) => g.id !== id);
		try {
			await goalItems.remove(id);
		} catch (err) {
			console.error('[useGoals] Failed to delete goal:', err);
			await load(); // Reload on error
		}
	};

	/** Record a progress snapshot for a goal. */
	const recordSnapshot = async (goalId: string, value: number, notes?: string): Promise<void> => {
		try {
			const snapshot = await snapshotItems.create({
				goal: goalId,
				value,
				notes: notes || null,
			});

			// Update local goal's current_value and snapshots
			const goal = goals.value.find((g) => g.id === goalId);
			if (goal) {
				goal.current_value = value;
				if (!goal.snapshots) goal.snapshots = [];
				(goal.snapshots as GoalSnapshot[]).push(snapshot as GoalSnapshot);
			}
		} catch (err) {
			console.error('[useGoals] Failed to record snapshot:', err);
			throw err;
		}
	};

	/** Calculate goal progress as a percentage (0-100). */
	const goalProgress = (goal: Goal): number => {
		if (!goal.target_value || goal.target_value === 0) return 0;
		const current = goal.current_value || 0;
		const pct = (current / goal.target_value) * 100;
		return Math.min(100, Math.max(0, pct));
	};

	// Computed filters
	const activeGoals = computed(() => goals.value.filter((g) => g.status === 'active'));
	const completedGoals = computed(() => goals.value.filter((g) => g.status === 'completed'));

	const goalsByType = computed(() => {
		const grouped: Record<string, Goal[]> = {};
		for (const goal of goals.value) {
			const type = goal.type || 'custom';
			if (!grouped[type]) grouped[type] = [];
			grouped[type].push(goal);
		}
		return grouped;
	});

	const overdueGoals = computed(() => {
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		return goals.value.filter((g) => {
			if (g.status !== 'active' || !g.end_date) return false;
			const end = new Date(g.end_date);
			end.setHours(0, 0, 0, 0);
			return end < now;
		});
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
		goals: readonly(goals),
		activeGoals,
		completedGoals,
		goalsByType,
		overdueGoals,
		isLoading: readonly(isLoading),
		createGoal,
		updateGoal,
		deleteGoal,
		recordSnapshot,
		goalProgress,
		refresh: load,
	};
};

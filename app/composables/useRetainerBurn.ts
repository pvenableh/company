import type { Project, TimeEntry } from '~~/shared/directus';

interface RetainerBurnBreakdown {
	tickets: number;
	tasks: number;
	other: number;
}

interface RetainerBurnState {
	hoursUsed: Ref<number>;
	hoursAllocated: ComputedRef<number>;
	pct: ComputedRef<number>;
	isOver: ComputedRef<boolean>;
	breakdownMinutes: Ref<RetainerBurnBreakdown>;
	loading: Ref<boolean>;
	periodLabel: ComputedRef<string>;
	periodStart: ComputedRef<string>;
	periodEnd: ComputedRef<string>;
	refresh: () => Promise<void>;
}

function startOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfQuarter(d: Date): Date {
	const q = Math.floor(d.getMonth() / 3);
	return new Date(d.getFullYear(), q * 3, 1);
}

function endOfQuarter(d: Date): Date {
	const q = Math.floor(d.getMonth() / 3);
	return new Date(d.getFullYear(), q * 3 + 3, 0);
}

function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/**
 * Computes the current-period retainer burn for a project.
 * Sums `time_entries.duration_minutes` for the calendar period
 * (month or quarter, per `project.retainer_period`) anchored on today.
 */
export function useRetainerBurn(project: Ref<Project | null | undefined> | ComputedRef<Project | null | undefined>): RetainerBurnState {
	const { getTimeEntries } = useTimeTracker();

	const hoursUsed = ref(0);
	const breakdownMinutes = ref<RetainerBurnBreakdown>({ tickets: 0, tasks: 0, other: 0 });
	const loading = ref(false);

	const hoursAllocated = computed(() => {
		const v = project.value?.retainer_hours_per_period;
		return v != null ? Number(v) : 0;
	});

	const period = computed<'monthly' | 'quarterly'>(() => {
		return project.value?.retainer_period === 'quarterly' ? 'quarterly' : 'monthly';
	});

	const periodStart = computed(() => {
		const now = new Date();
		return isoDate(period.value === 'quarterly' ? startOfQuarter(now) : startOfMonth(now));
	});

	const periodEnd = computed(() => {
		const now = new Date();
		return isoDate(period.value === 'quarterly' ? endOfQuarter(now) : endOfMonth(now));
	});

	const periodLabel = computed(() => {
		const now = new Date();
		if (period.value === 'quarterly') {
			const q = Math.floor(now.getMonth() / 3) + 1;
			return `Q${q} ${now.getFullYear()}`;
		}
		return now.toLocaleString('en-US', { month: 'long' });
	});

	const pct = computed(() => {
		if (hoursAllocated.value <= 0) return 0;
		return Math.min(100, Math.round((hoursUsed.value / hoursAllocated.value) * 1000) / 10);
	});

	const isOver = computed(() => hoursAllocated.value > 0 && hoursUsed.value > hoursAllocated.value);

	async function refresh() {
		const id = project.value?.id;
		if (!id) {
			hoursUsed.value = 0;
			breakdownMinutes.value = { tickets: 0, tasks: 0, other: 0 };
			return;
		}
		loading.value = true;
		try {
			const { data } = await getTimeEntries({
				projectId: String(id),
				dateFrom: periodStart.value,
				dateTo: periodEnd.value,
				status: 'completed',
				limit: 2000,
			});

			let total = 0;
			const breakdown: RetainerBurnBreakdown = { tickets: 0, tasks: 0, other: 0 };

			for (const entry of data as TimeEntry[]) {
				const mins = entry.duration_minutes || 0;
				total += mins;
				if (entry.ticket) breakdown.tickets += mins;
				else if (entry.task) breakdown.tasks += mins;
				else breakdown.other += mins;
			}

			hoursUsed.value = Math.round((total / 60) * 100) / 100;
			breakdownMinutes.value = breakdown;
		} catch (err) {
			console.error('useRetainerBurn refresh failed:', err);
			hoursUsed.value = 0;
			breakdownMinutes.value = { tickets: 0, tasks: 0, other: 0 };
		} finally {
			loading.value = false;
		}
	}

	watch(() => project.value?.id, refresh, { immediate: true });

	return {
		hoursUsed,
		hoursAllocated,
		pct,
		isOver,
		breakdownMinutes,
		loading,
		periodLabel,
		periodStart,
		periodEnd,
		refresh,
	};
}

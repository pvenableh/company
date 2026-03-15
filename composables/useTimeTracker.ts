import type { TimeEntry } from '~/types/directus';

const ACTIVE_TIMER_KEY = 'earnest_active_timer';

interface ActiveTimerState {
	entryId: string;
	startTime: string;
	description: string;
	client?: string | null;
	project?: string | null;
	ticket?: string | null;
	task?: string | null;
	billable: boolean;
}

export function useTimeTracker() {
	const items = useDirectusItems<TimeEntry>('time_entries');
	const { selectedOrg, getOrganizationFilter, organizations } = useOrganization();
	const { getClientFilter } = useClients();
	const { user } = useDirectusAuth();

	// ── Active Timer State ──────────────────────────────────────
	const activeTimer = useState<ActiveTimerState | null>('activeTimer', () => null);
	const elapsed = useState<number>('timerElapsed', () => 0);
	const isTimerRunning = computed(() => !!activeTimer.value);

	let _timerInterval: ReturnType<typeof setInterval> | null = null;

	function _startInterval() {
		_stopInterval();
		_updateElapsed();
		_timerInterval = setInterval(_updateElapsed, 1000);
	}

	function _stopInterval() {
		if (_timerInterval) {
			clearInterval(_timerInterval);
			_timerInterval = null;
		}
	}

	function _updateElapsed() {
		if (!activeTimer.value) {
			elapsed.value = 0;
			return;
		}
		const start = new Date(activeTimer.value.startTime).getTime();
		elapsed.value = Math.floor((Date.now() - start) / 1000);
	}

	function _persistTimer() {
		if (!import.meta.client) return;
		if (activeTimer.value) {
			localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(activeTimer.value));
		} else {
			localStorage.removeItem(ACTIVE_TIMER_KEY);
		}
	}

	// ── Timer Controls ──────────────────────────────────────────

	async function startTimer(params: {
		description?: string;
		client?: string | null;
		project?: string | null;
		ticket?: string | null;
		task?: string | null;
		billable?: boolean;
		hourly_rate?: number | null;
	}): Promise<TimeEntry> {
		// Stop any running timer first
		if (activeTimer.value) {
			await stopTimer();
		}

		const now = new Date().toISOString();
		const orgFilter = getOrganizationFilter();
		const orgId = orgFilter?.organization?._eq || selectedOrg.value;

		const entry = await items.create({
			status: 'running',
			organization: orgId,
			user: user.value?.id,
			client: params.client || null,
			project: params.project || null,
			ticket: params.ticket || null,
			task: params.task || null,
			description: params.description || null,
			start_time: now,
			date: now.split('T')[0],
			billable: params.billable ?? true,
			hourly_rate: params.hourly_rate ?? null,
			billed: false,
		} as any);

		activeTimer.value = {
			entryId: (entry as any).id,
			startTime: now,
			description: params.description || '',
			client: params.client || null,
			project: params.project || null,
			ticket: params.ticket || null,
			task: params.task || null,
			billable: params.billable ?? true,
		};

		_persistTimer();
		_startInterval();

		return entry;
	}

	async function stopTimer(): Promise<TimeEntry | null> {
		if (!activeTimer.value) return null;

		const now = new Date().toISOString();
		const durationMinutes = Math.max(1, Math.round(elapsed.value / 60));

		const entry = await items.update(activeTimer.value.entryId, {
			end_time: now,
			duration_minutes: durationMinutes,
			status: 'completed',
		} as any);

		activeTimer.value = null;
		elapsed.value = 0;
		_persistTimer();
		_stopInterval();

		return entry;
	}

	async function discardTimer(): Promise<void> {
		if (!activeTimer.value) return;

		try {
			await items.remove(activeTimer.value.entryId);
		} catch {
			// Entry may already be deleted
		}

		activeTimer.value = null;
		elapsed.value = 0;
		_persistTimer();
		_stopInterval();
	}

	function restoreTimer(): void {
		if (!import.meta.client) return;

		const saved = localStorage.getItem(ACTIVE_TIMER_KEY);
		if (!saved) return;

		try {
			const state: ActiveTimerState = JSON.parse(saved);
			activeTimer.value = state;
			_startInterval();
		} catch {
			localStorage.removeItem(ACTIVE_TIMER_KEY);
		}
	}

	// ── Manual Entry ────────────────────────────────────────────

	async function createManualEntry(params: {
		date: string;
		duration_minutes: number;
		description?: string;
		client?: string | null;
		project?: string | null;
		ticket?: string | null;
		task?: string | null;
		billable?: boolean;
		hourly_rate?: number | null;
	}): Promise<TimeEntry> {
		const orgFilter = getOrganizationFilter();
		const orgId = orgFilter?.organization?._eq || selectedOrg.value;

		const startTime = `${params.date}T09:00:00.000Z`;
		const endMs = new Date(startTime).getTime() + params.duration_minutes * 60 * 1000;
		const endTime = new Date(endMs).toISOString();

		return items.create({
			status: 'completed',
			organization: orgId,
			user: user.value?.id,
			client: params.client || null,
			project: params.project || null,
			ticket: params.ticket || null,
			task: params.task || null,
			description: params.description || null,
			start_time: startTime,
			end_time: endTime,
			duration_minutes: params.duration_minutes,
			date: params.date,
			billable: params.billable ?? true,
			hourly_rate: params.hourly_rate ?? null,
			billed: false,
		} as any);
	}

	// ── CRUD ────────────────────────────────────────────────────

	async function getTimeEntries(params?: {
		status?: string;
		search?: string;
		dateFrom?: string;
		dateTo?: string;
		userId?: string;
		projectId?: string;
		ticketId?: string;
		clientId?: string;
		billable?: boolean;
		billed?: boolean;
		sort?: string[];
		limit?: number;
		page?: number;
	}): Promise<{ data: TimeEntry[]; total: number }> {
		const filter: any = { _and: [] };

		// Org scope
		const orgFilter = getOrganizationFilter();
		if (orgFilter?.organization) {
			filter._and.push({ organization: orgFilter.organization });
		}

		// Client filter (from header)
		const clientFilter = getClientFilter();
		if (Object.keys(clientFilter).length > 0) {
			filter._and.push(clientFilter);
		}

		// Status
		if (params?.status && params.status !== 'all') {
			filter._and.push({ status: { _eq: params.status } });
		}

		// Date range
		if (params?.dateFrom) {
			filter._and.push({ date: { _gte: params.dateFrom } });
		}
		if (params?.dateTo) {
			filter._and.push({ date: { _lte: params.dateTo } });
		}

		// Specific filters
		if (params?.userId) filter._and.push({ user: { _eq: params.userId } });
		if (params?.projectId) filter._and.push({ project: { _eq: params.projectId } });
		if (params?.ticketId) filter._and.push({ ticket: { _eq: params.ticketId } });
		if (params?.clientId) filter._and.push({ client: { _eq: params.clientId } });
		if (params?.billable !== undefined) filter._and.push({ billable: { _eq: params.billable } });
		if (params?.billed !== undefined) filter._and.push({ billed: { _eq: params.billed } });

		// Search
		if (params?.search) {
			filter._and.push({ description: { _icontains: params.search } });
		}

		const data = await items.list({
			fields: [
				'id', 'status', 'description', 'start_time', 'end_time',
				'duration_minutes', 'date', 'billable', 'hourly_rate', 'billed',
				'user.id', 'user.first_name', 'user.last_name', 'user.avatar',
				'client.id', 'client.name',
				'project.id', 'project.title',
				'ticket.id', 'ticket.title',
				'task.id', 'task.title',
				'invoice.id', 'invoice.invoice_code',
				'tags',
			],
			filter: filter._and.length ? filter : undefined,
			sort: params?.sort || ['-date', '-start_time'],
			limit: params?.limit || 100,
			page: params?.page || 1,
		});

		const total = await items.count(filter._and.length ? filter : undefined);

		return { data, total };
	}

	async function getTimeEntry(id: string): Promise<TimeEntry> {
		return items.get(id, {
			fields: [
				'*',
				'user.id', 'user.first_name', 'user.last_name',
				'client.id', 'client.name',
				'project.id', 'project.title',
				'ticket.id', 'ticket.title',
				'task.id', 'task.title',
				'invoice.id', 'invoice.invoice_code',
			],
		});
	}

	async function updateTimeEntry(id: string, payload: Partial<TimeEntry>): Promise<TimeEntry> {
		await items.update(id, payload as any);
		return getTimeEntry(id);
	}

	async function deleteTimeEntry(id: string): Promise<boolean> {
		return items.remove(id);
	}

	// ── Reporting ───────────────────────────────────────────────

	async function getUnbilledTime(clientId?: string): Promise<{
		entries: TimeEntry[];
		totalMinutes: number;
		totalAmount: number;
	}> {
		const filter: any = {
			_and: [
				{ billable: { _eq: true } },
				{ billed: { _eq: false } },
				{ status: { _eq: 'completed' } },
			],
		};

		const orgFilter = getOrganizationFilter();
		if (orgFilter?.organization) {
			filter._and.push({ organization: orgFilter.organization });
		}

		if (clientId) {
			filter._and.push({ client: { _eq: clientId } });
		}

		const entries = await items.list({
			fields: [
				'id', 'description', 'duration_minutes', 'hourly_rate', 'date',
				'client.id', 'client.name',
				'project.id', 'project.title',
			],
			filter,
			sort: ['-date'],
			limit: 500,
		});

		const totalMinutes = entries.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0);
		const totalAmount = entries.reduce((sum: number, e: any) => {
			const hours = (e.duration_minutes || 0) / 60;
			return sum + hours * (e.hourly_rate || 0);
		}, 0);

		return { entries, totalMinutes, totalAmount };
	}

	// ── Formatting ──────────────────────────────────────────────

	function formatElapsed(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
	}

	function formatDuration(minutes: number): string {
		if (minutes < 60) return `${minutes}m`;
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}

	return {
		// Timer state
		activeTimer: readonly(activeTimer),
		elapsed: readonly(elapsed),
		isTimerRunning,

		// Timer controls
		startTimer,
		stopTimer,
		discardTimer,
		restoreTimer,

		// Manual entry
		createManualEntry,

		// CRUD
		getTimeEntries,
		getTimeEntry,
		updateTimeEntry,
		deleteTimeEntry,

		// Reporting
		getUnbilledTime,

		// Formatting
		formatElapsed,
		formatDuration,
	};
}

import type { TimeEntry, Invoice } from '~~/shared/directus';

const ACTIVE_TIMER_KEY = 'earnest_active_timer';

export interface TeamMemberSummary {
	userId: string;
	userName: string;
	userAvatar: string | null;
	totalMinutes: number;
	billableMinutes: number;
	totalRevenue: number;
	entryCount: number;
}

export interface ProjectTimeStats {
	totalMinutes: number;
	billableMinutes: number;
	unbilledAmount: number;
	billedAmount: number;
	entryCount: number;
}

export interface OrgMemberOption {
	id: string;
	firstName: string;
	lastName: string;
	avatar: string | null;
	label: string;
}

interface ActiveTimerState {
	entryId: string;
	startTime: string;
	description: string;
	client?: string | null;
	project?: string | null;
	ticket?: string | null;
	task?: string | null;
	billable: boolean;
	pausedElapsed?: number | null; // seconds accumulated when paused
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
	const isTimerPaused = computed(() => !!activeTimer.value && activeTimer.value.pausedElapsed != null);

	let _timerInterval: ReturnType<typeof setInterval> | null = null;

	function _startInterval() {
		if (!import.meta.client) return;
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
		const currentElapsed = activeTimer.value.pausedElapsed ?? elapsed.value;
		const durationMinutes = Math.max(1, Math.round(currentElapsed / 60));

		let entry: TimeEntry | null = null;
		try {
			entry = await items.update(activeTimer.value.entryId, {
				end_time: now,
				duration_minutes: durationMinutes,
				status: 'completed',
			} as any);
		} catch {
			// API failed — still clear local state so user isn't stuck.
			// The entry remains 'running' in Directus and can be cleaned up later.
			console.warn('[TimeTracker] Failed to update entry on stop — clearing local timer state');
		}

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

	function pauseTimer(): void {
		if (!activeTimer.value || activeTimer.value.pausedElapsed != null) return;

		activeTimer.value = {
			...activeTimer.value,
			pausedElapsed: elapsed.value,
		};

		_stopInterval();
		_persistTimer();
	}

	function resumeTimer(): void {
		if (!activeTimer.value || activeTimer.value.pausedElapsed == null) return;

		// Adjust startTime so elapsed calculation picks up from where we left off
		const resumedStart = new Date(Date.now() - activeTimer.value.pausedElapsed * 1000).toISOString();

		activeTimer.value = {
			...activeTimer.value,
			startTime: resumedStart,
			pausedElapsed: null,
		};

		_persistTimer();
		_startInterval();
	}

	async function restoreTimer(): Promise<void> {
		if (!import.meta.client) return;

		const saved = localStorage.getItem(ACTIVE_TIMER_KEY);
		if (!saved) return;

		let state: ActiveTimerState;
		try {
			state = JSON.parse(saved);
		} catch {
			localStorage.removeItem(ACTIVE_TIMER_KEY);
			return;
		}

		// Validate the entry still exists in Directus (handles expired tokens, deleted entries)
		try {
			const entry = await items.get(state.entryId, { fields: ['id', 'status'] });
			if (!entry || (entry as any).status !== 'running') {
				// Entry was completed/deleted elsewhere — clean up local state
				localStorage.removeItem(ACTIVE_TIMER_KEY);
				return;
			}
		} catch {
			// API unreachable or token expired — keep local state so user doesn't lose work,
			// but show the timer as paused until connectivity is restored
			state = { ...state, pausedElapsed: state.pausedElapsed ?? Math.floor((Date.now() - new Date(state.startTime).getTime()) / 1000) };
		}

		activeTimer.value = state;

		if (state.pausedElapsed != null) {
			// Restore paused — show frozen elapsed, don't start interval
			elapsed.value = state.pausedElapsed;
		} else {
			_startInterval();
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
		teamView?: boolean;
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
				'invoice.id', 'invoice.invoice_code', 'invoice.status',
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

	// ── Team / Admin Functions ──────────────────────────────────

	async function getOrgMembers(): Promise<OrgMemberOption[]> {
		const memberItems = useDirectusItems('org_memberships');
		const orgFilter = getOrganizationFilter();
		const orgId = orgFilter?.organization?._eq || selectedOrg.value;
		if (!orgId) return [];

		const memberships = await memberItems.list({
			fields: [
				'user.id', 'user.first_name', 'user.last_name', 'user.avatar',
			],
			filter: {
				_and: [
					{ organization: { _eq: orgId } },
					{ status: { _eq: 'active' } },
				],
			},
			limit: 200,
		}) as any[];

		const seen = new Set<string>();
		return memberships
			.filter((m: any) => {
				const uid = m.user?.id;
				if (!uid || seen.has(uid)) return false;
				seen.add(uid);
				return true;
			})
			.map((m: any) => ({
				id: m.user.id,
				firstName: m.user.first_name || '',
				lastName: m.user.last_name || '',
				avatar: m.user.avatar || null,
				label: [m.user.first_name, m.user.last_name].filter(Boolean).join(' ') || 'Unknown',
			}));
	}

	async function getTeamSummary(params: {
		dateFrom: string;
		dateTo: string;
		projectId?: string;
		clientId?: string;
	}): Promise<TeamMemberSummary[]> {
		const { data } = await getTimeEntries({
			dateFrom: params.dateFrom,
			dateTo: params.dateTo,
			projectId: params.projectId,
			clientId: params.clientId,
			status: 'completed',
			teamView: true,
			limit: 2000,
		});

		const byUser = new Map<string, TeamMemberSummary>();

		for (const entry of data) {
			const u = entry.user as any;
			const uid = u?.id || 'unknown';

			if (!byUser.has(uid)) {
				byUser.set(uid, {
					userId: uid,
					userName: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'Unknown',
					userAvatar: u?.avatar || null,
					totalMinutes: 0,
					billableMinutes: 0,
					totalRevenue: 0,
					entryCount: 0,
				});
			}

			const summary = byUser.get(uid)!;
			const mins = entry.duration_minutes || 0;
			summary.totalMinutes += mins;
			summary.entryCount += 1;

			if (entry.billable) {
				summary.billableMinutes += mins;
				summary.totalRevenue += (mins / 60) * (entry.hourly_rate || 0);
			}
		}

		return Array.from(byUser.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
	}

	async function getProjectTimeStats(projectId: string): Promise<ProjectTimeStats> {
		const { data } = await getTimeEntries({
			projectId,
			status: 'completed',
			teamView: true,
			limit: 2000,
		});

		const stats: ProjectTimeStats = {
			totalMinutes: 0,
			billableMinutes: 0,
			unbilledAmount: 0,
			billedAmount: 0,
			entryCount: data.length,
		};

		for (const entry of data) {
			const mins = entry.duration_minutes || 0;
			stats.totalMinutes += mins;

			if (entry.billable) {
				stats.billableMinutes += mins;
				const amount = (mins / 60) * (entry.hourly_rate || 0);
				if (entry.billed) {
					stats.billedAmount += amount;
				} else {
					stats.unbilledAmount += amount;
				}
			}
		}

		return stats;
	}

	async function generateInvoiceFromEntries(params: {
		entryIds: (string | number)[];
		clientId: string;
		invoiceDate: string;
		dueDate: string;
		projectId?: string;
	}): Promise<Invoice> {
		// Fetch the selected entries
		const entries: TimeEntry[] = [];
		for (const id of params.entryIds) {
			const entry = await getTimeEntry(String(id));
			entries.push(entry);
		}

		// Group by project
		const groups = new Map<string, { projectName: string; entries: TimeEntry[] }>();
		for (const entry of entries) {
			const proj = entry.project as any;
			const projId = proj?.id || 'no-project';
			const projName = proj?.title || 'General';

			if (!groups.has(projId)) {
				groups.set(projId, { projectName: projName, entries: [] });
			}
			groups.get(projId)!.entries.push(entry);
		}

		// Build line items — use "Hours" product for time-based billing
		const HOURS_PRODUCT_ID = 'e3b508fc-9a50-4978-aa4a-ccd30451ad85';

		const lineItems: any[] = [];
		for (const [, group] of groups) {
			const totalMins = group.entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
			const totalHours = Math.round((totalMins / 60) * 100) / 100;

			// Use the most common hourly rate in the group
			const rates = group.entries.filter(e => e.hourly_rate).map(e => e.hourly_rate!);
			const rate = rates.length > 0
				? rates.reduce((a, b) => a + b, 0) / rates.length
				: 0;

			const dates = group.entries
				.map(e => e.date)
				.filter(Boolean)
				.sort();
			const dateRange = dates.length > 1
				? `${dates[0]} - ${dates[dates.length - 1]}`
				: dates[0] || '';

			lineItems.push({
				product: HOURS_PRODUCT_ID,
				description: `${group.projectName} — ${dateRange} (${group.entries.length} entries, ${totalHours}h)`,
				quantity: Math.ceil(totalHours),
				rate: Math.round(rate * 100) / 100,
				amount: Math.round(totalHours * rate * 100) / 100,
			});
		}

		// Create the invoice
		const { createInvoice, generateInvoiceCode } = useInvoices();
		const invoiceCode = await generateInvoiceCode(params.clientId, params.invoiceDate);

		const invoice = await createInvoice({
			client: params.clientId,
			projects: params.projectId ? [{ projects_id: params.projectId }] : [],
			invoice_date: params.invoiceDate,
			due_date: params.dueDate,
			invoice_code: invoiceCode,
			line_items: lineItems,
			status: 'pending',
		});

		// Mark entries as billed and link to invoice
		for (const id of params.entryIds) {
			await items.update(String(id), {
				billed: true,
				invoice: (invoice as any).id,
			} as any);
		}

		return invoice;
	}

	async function markEntriesAsBilled(entryIds: (string | number)[], invoiceId: string): Promise<void> {
		for (const id of entryIds) {
			await items.update(String(id), {
				billed: true,
				invoice: invoiceId,
			} as any);
		}
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
		isTimerPaused,

		// Timer controls
		startTimer,
		stopTimer,
		pauseTimer,
		resumeTimer,
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

		// Team / Admin
		getOrgMembers,
		getTeamSummary,
		getProjectTimeStats,
		generateInvoiceFromEntries,
		markEntriesAsBilled,

		// Formatting
		formatElapsed,
		formatDuration,
	};
}

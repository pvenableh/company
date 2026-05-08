/**
 * useUnifiedTimeline - Fetches and unifies Projects, Tickets, and Quick Tasks
 * into a single data structure for the unified Gantt chart.
 *
 * Supports two view modes:
 *   - 'nested': Tickets and tasks grouped under their parent projects
 *   - 'flat': Separate swimlanes for Projects, Tickets, and My Tasks
 */

import type { ProjectWithRelations } from '~~/shared/projects';

export type TimelineViewMode = 'nested' | 'flat';

export interface TimelineTicket {
	id: string;
	title: string;
	status: string;
	priority: string;
	due_date?: string;
	date_created?: string;
	project_id?: string;
	assigned_to?: any[];
	tasks?: any[];
}

export interface TimelineTask {
	id: string;
	title: string;
	completed: boolean;
	due_date?: string;
	schedule?: string;
	priority: string;
	project_id?: string;
	ticket_id?: string;
	category?: string;
}

export interface UnifiedTimelineData {
	projects: ProjectWithRelations[];
	tickets: TimelineTicket[];
	tasks: TimelineTask[];
}

export function useUnifiedTimeline(opts: { portal?: boolean } = {}) {
	const ticketItems = opts.portal ? (usePortalItems('tickets') as any) : useDirectusItems('tickets');
	const taskItems = opts.portal ? (usePortalItems('tasks') as any) : useDirectusItems('tasks');
	const { selectedOrg } = useOrganization();

	const viewMode = ref<TimelineViewMode>('nested');
	const loading = ref(false);
	const data = ref<UnifiedTimelineData>({
		projects: [],
		tickets: [],
		tasks: [],
	});

	// Toggle view mode and persist
	const STORAGE_KEY = 'earnest-timeline-view-mode';

	const setViewMode = (mode: TimelineViewMode) => {
		viewMode.value = mode;
		if (import.meta.client) {
			localStorage.setItem(STORAGE_KEY, mode);
		}
	};

	// Init from localStorage
	if (import.meta.client) {
		const saved = localStorage.getItem(STORAGE_KEY) as TimelineViewMode | null;
		if (saved === 'nested' || saved === 'flat') {
			viewMode.value = saved;
		}
	}

	const fetchAll = async () => {
		// In portal mode, the proxy auto-scopes by org+client; in agency mode
		// we need a selected org before issuing scoped queries.
		if (!opts.portal && !selectedOrg.value) return;
		loading.value = true;

		try {
			const orgId = selectedOrg.value;

			// Projects are loaded by useProjectTimeline (shallow list +
			// per-project lazy detail expand). The unified Gantt only reads
			// tickets and personal tasks from this composable, so we no
			// longer issue a projects query here — keeping it would deep-walk
			// events/tasks/files for every project on cold mount.
			const projects: ProjectWithRelations[] = [];

			// Fetch tickets
			const tickets = await ticketItems.list({
				filter: opts.portal ? undefined : { organization: { _eq: orgId } },
				fields: ['*', 'tasks.*', 'assigned_to.directus_users_id.*'],
				sort: ['-date_created'],
				limit: 100,
			});

			// Fetch quick tasks (personal tasks with due dates).
			// Portal users don't have a personal "quick task" stream — clients
			// don't author standalone tasks — so skip this fetch entirely
			// and the unified-timeline `personalTasks` swimlane stays empty.
			const tasks = opts.portal
				? []
				: await taskItems.list({
					filter: {
						_and: [
							{ organization_id: { _eq: orgId } },
							{ category: { _in: ['quick', 'project', 'event', 'ticket'] } },
						],
					},
					fields: ['*'],
					sort: ['-date_created'],
					limit: 200,
				});

			data.value = {
				projects: projects || [],
				tickets: tickets || [],
				tasks: tasks || [],
			};
		} catch (err) {
			console.error('Failed to fetch unified timeline data:', err);
		} finally {
			loading.value = false;
		}
	};

	// ── Computed: tickets grouped by project (for nested view) ──
	const ticketsByProject = computed(() => {
		const map = new Map<string, TimelineTicket[]>();
		for (const ticket of data.value.tickets) {
			const projectId = ticket.project_id || '__unassigned';
			if (!map.has(projectId)) map.set(projectId, []);
			map.get(projectId)!.push(ticket);
		}
		return map;
	});

	// ── Computed: tasks grouped by project (for nested view) ──
	const tasksByProject = computed(() => {
		const map = new Map<string, TimelineTask[]>();
		for (const task of data.value.tasks) {
			if (task.category === 'quick' || !task.project_id) {
				const key = '__personal';
				if (!map.has(key)) map.set(key, []);
				map.get(key)!.push(task);
			} else {
				const key = task.project_id;
				if (!map.has(key)) map.set(key, []);
				map.get(key)!.push(task);
			}
		}
		return map;
	});

	// ── Computed: standalone quick tasks ──
	const personalTasks = computed(() => {
		return data.value.tasks.filter(
			(t) => t.category === 'quick' || (!t.project_id && !t.ticket_id)
		);
	});

	// ── Computed: unassigned tickets (no project) ──
	const unassignedTickets = computed(() => {
		return data.value.tickets.filter((t) => !t.project_id);
	});

	return {
		viewMode: readonly(viewMode),
		setViewMode,
		loading: readonly(loading),
		data: readonly(data),
		fetchAll,
		ticketsByProject,
		tasksByProject,
		personalTasks,
		unassignedTickets,
	};
}

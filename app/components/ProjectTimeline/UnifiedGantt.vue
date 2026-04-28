<script setup lang="ts">
/**
 * UnifiedGantt — Clean, minimal project timeline
 * Fixed label column + horizontally scrollable track.
 * Labels stay pinned left, scroll vertically with chart.
 */

import type { ProjectWithRelations, ProjectEventWithRelations } from '~~/shared/projects';
import { getEventTimelineDate } from '~~/shared/projects';

// ── Props ──
const props = defineProps<{
	compact?: boolean;
}>();

// ── Data composables ──
const {
	viewMode,
	setViewMode,
	loading: unifiedLoading,
	data: timelineData,
	fetchAll,
	ticketsByProject,
	personalTasks,
} = useUnifiedTimeline();

const { projects, loading: projectsLoading, error, fetchProjects } = useProjectTimeline();
const { user: authUser } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { selectedClient } = useClients();
const { canEdit } = useOrgRole();
const toast = useToast();

const canEditProjects = computed(() => canEdit('projects'));
const canEditEvents = computed(() => canEdit('projects')); // events are part of projects

// ── Event type color map ──
// "General" inherits from the project service color (passed as fallback)
const EVENT_TYPE_COLORS: Record<string, string> = {
	Design: '#f472b6',    // pink
	Content: '#fb923c',   // orange
	Timeline: '#06b6d4',  // cyan
	Financial: '#22c55e', // green
	Hours: '#a78bfa',     // violet
};

function getEventColor(event: any, fallbackColor: string): string {
	const type = event.type || 'General';
	return EVENT_TYPE_COLORS[type] || fallbackColor;
}

// ── Constants ──
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 52; // 24px quarter row + 28px month row
const LABEL_WIDTH = 180;

const scrollWrapper = ref<HTMLElement | null>(null);
const expandedProjects = ref<Set<string>>(new Set());
const selectedEventId = ref<string | null>(null);
const showEventDetail = ref(false);

const loading = computed(() => projectsLoading.value || unifiedLoading.value);

// ── Quarter label ──
const quarterLabel = computed(() => {
	const now = new Date();
	const q = Math.ceil((now.getMonth() + 1) / 3);
	return `Q${q} ${now.getFullYear()}`;
});

// ── Status helpers (uses shared composable) ──
const { getStatusOpacity } = useStatusStyle();
const getBarOpacity = (status?: string) => getStatusOpacity(status);

function statusLabel(status?: string): string {
	const s = status?.toLowerCase().replace(/\s+/g, '') || '';
	if (s === 'completed' || s === 'done') return 'Completed';
	if (s === 'inprogress' || s === 'active') return 'In Progress';
	if (s === 'scheduled' || s === 'pending') return 'Scheduled';
	return status || '';
}

// ── Data fetching ──
async function fetchAllData() {
	await Promise.all([fetchProjects(), fetchAll()]);
}

watch([selectedOrg, selectedClient], () => fetchAllData());

watch(
	() => authUser.value?.id,
	(newId) => {
		if (newId && projects.value.length === 0 && !loading.value) fetchAllData();
	},
	{ immediate: true },
);

onMounted(() => {
	if (authUser.value?.id) fetchAllData();
	// Start in nested mode
	setViewMode('nested');
	// Start collapsed — don't add to expandedProjects
});

// ── Expand / collapse ──
function toggleProject(id: string) {
	const s = new Set(expandedProjects.value);
	if (s.has(id)) s.delete(id); else s.add(id);
	expandedProjects.value = s;
}

function expandAll() {
	expandedProjects.value = new Set(projects.value.map(p => p.id));
}

// ── Sort helper: earliest date for a project ──
function getEarliestDate(project: ProjectWithRelations): number {
	const dates: number[] = [];
	if (project.start_date) dates.push(new Date(project.start_date).getTime());
	if (project.completion_date) dates.push(new Date(project.completion_date).getTime());
	const events = (project.events || []) as ProjectEventWithRelations[];
	for (const e of events) {
		const d = getEventTimelineDate(e);
		if (d) dates.push(new Date(d).getTime());
	}
	return dates.length > 0 ? Math.min(...dates) : Infinity;
}

// ── Filter out dateless projects, sort the rest ──
function projectHasDates(project: ProjectWithRelations): boolean {
	if (project.start_date || project.completion_date) return true;
	const events = (project.events || []) as ProjectEventWithRelations[];
	for (const e of events) {
		if (getEventTimelineDate(e) || e.end_date) return true;
	}
	const tickets = ticketsByProject.value.get(project.id) || [];
	for (const t of tickets) {
		if (t.date_created || t.due_date) return true;
	}
	return false;
}

const sortedProjects = computed(() => {
	return [...projects.value]
		.filter(p => projectHasDates(p))
		.filter(p => {
			if (showCompleted.value) return true;
			const s = p.status?.toLowerCase().replace(/\s+/g, '') || '';
			return s !== 'completed' && s !== 'done' && s !== 'archived';
		})
		.sort((a, b) => {
			const sp = statusPriority(a.status) - statusPriority(b.status);
			if (sp !== 0) return sp;
			return getEarliestDate(b) - getEarliestDate(a); // newest first within group
		});
});

const undatedProjects = computed(() => {
	return projects.value.filter(p => !projectHasDates(p));
});

const showCompleted = ref(false);

const completedProjectCount = computed(() => {
	return projects.value.filter(p => {
		if (!projectHasDates(p)) return false;
		const s = p.status?.toLowerCase().replace(/\s+/g, '') || '';
		return s === 'completed' || s === 'done' || s === 'archived';
	}).length;
});

// ── Status priority for sorting (active first, completed last) ──
function statusPriority(status?: string): number {
	const s = status?.toLowerCase().replace(/\s+/g, '') || '';
	if (s === 'inprogress' || s === 'active') return 0;
	if (s === 'scheduled' || s === 'pending' || s === 'planned') return 1;
	if (s === 'completed' || s === 'done') return 2;
	if (s === 'archived') return 3;
	return 1; // default to scheduled-level
}

// ── Build flat row list ──
interface GanttRow {
	id: string;
	label: string;
	type: 'project' | 'event' | 'ticket' | 'task';
	depth: number;
	color: string;
	status?: string;
	startDate?: string;
	endDate?: string;
	dueDate?: string;
	projectId?: string;
	link?: string;
	hasChildren?: boolean;
	expanded?: boolean;
}

const rows = computed<GanttRow[]>(() => {
	const result: GanttRow[] = [];
	const isNested = viewMode.value === 'nested';

	if (isNested) {
		for (const project of sortedProjects.value) {
			const isExpanded = expandedProjects.value.has(project.id);
			const events = (project.events || []) as ProjectEventWithRelations[];
			const tickets = ticketsByProject.value.get(project.id) || [];
			const childCount = events.length + tickets.length;
			const projectColor = project.service?.color || '#d4d4d8';

			result.push({
				id: project.id,
				label: project.title || 'Untitled Project',
				type: 'project',
				depth: 0,
				color: projectColor,
				status: project.status,
				startDate: project.start_date,
				endDate: project.completion_date,
				hasChildren: childCount > 0,
				expanded: isExpanded,
				link: `/projects/${project.id}`,
			});

			if (isExpanded) {
				// Sort events by date
				const sortedEvents = [...events].sort((a, b) => {
					const aDate = getEventTimelineDate(a);
					const bDate = getEventTimelineDate(b);
					return (aDate ? new Date(aDate).getTime() : 0) - (bDate ? new Date(bDate).getTime() : 0);
				});
				for (const event of sortedEvents) {
					const eventDate = getEventTimelineDate(event);
					result.push({
						id: event.id,
						label: event.title || event.name || 'Event',
						type: 'event',
						depth: 1,
						color: getEventColor(event, projectColor),
						startDate: eventDate,
						endDate: event.end_date || eventDate,
						projectId: project.id,
						status: event.status,
					});
					// Tasks under this event (depth 2)
					const eventTasks = (event as any).tasks || [];
					for (const task of eventTasks) {
						result.push({
							id: task.id,
							label: task.title || 'Task',
							type: 'task',
							depth: 2,
							color: '#8b5cf6', // purple — matches label icon
							status: task.completed ? 'Completed' : 'In Progress',
							dueDate: task.due_date,
							projectId: project.id,
						});
					}
				}
				for (const ticket of tickets) {
					result.push({
						id: ticket.id,
						label: ticket.title || 'Untitled Ticket',
						type: 'ticket',
						depth: 1,
						color: '#f59e0b', // amber — matches label icon
						status: ticket.status,
						startDate: ticket.date_created,
						dueDate: ticket.due_date,
						projectId: project.id,
						link: `/tickets/${ticket.id}`,
					});
				}
			}
		}
	} else {
		for (const project of sortedProjects.value) {
			result.push({
				id: project.id,
				label: project.title || 'Untitled Project',
				type: 'project',
				depth: 0,
				color: project.service?.color || '#d4d4d8',
				status: project.status,
				startDate: project.start_date,
				endDate: project.completion_date,
				link: `/projects/${project.id}`,
			});
		}
		for (const ticket of timelineData.value.tickets) {
			result.push({
				id: ticket.id,
				label: ticket.title || 'Untitled Ticket',
				type: 'ticket',
				depth: 0,
				color: '#f59e0b', // amber — matches label icon
				status: ticket.status,
				startDate: ticket.date_created,
				dueDate: ticket.due_date,
				link: `/tickets/${ticket.id}`,
			});
		}
	}

	if (personalTasks.value.length > 0) {
		result.push({
			id: 'tasks-section',
			label: 'My Tasks',
			type: 'project',
			depth: 0,
			color: '#8b5cf6',
			hasChildren: true,
			expanded: true,
		});
		for (const task of personalTasks.value) {
			result.push({
				id: task.id,
				label: task.title || 'Untitled Task',
				type: 'task',
				depth: 1,
				color: '#8b5cf6',
				startDate: task.createdAt,
				dueDate: task.dueDate,
				status: task.completed ? 'completed' : 'active',
			});
		}
	}

	return result;
});

const filteredRows = computed(() => rows.value);

// ── Date range ──
const dateRange = computed(() => {
	let min = Infinity;
	let max = -Infinity;
	const now = Date.now();

	for (const row of rows.value) {
		for (const d of [row.startDate, row.endDate, row.dueDate]) {
			if (!d) continue;
			const t = new Date(d).getTime();
			if (!isNaN(t)) {
				if (t < min) min = t;
				if (t > max) max = t;
			}
		}
	}

	if (min === Infinity) min = now - 90 * 86400000;
	if (max === -Infinity) max = now + 90 * 86400000;
	if (now > max) max = now;
	if (now < min) min = now;

	const padding = (max - min) * 0.08 || 30 * 86400000;
	return { start: new Date(min - padding), end: new Date(max + padding) };
});

const chartWidth = computed(() => 2200);

function dateToX(dateStr: string | undefined): number {
	if (!dateStr) return 0;
	const t = new Date(dateStr).getTime();
	if (isNaN(t)) return 0;
	const range = dateRange.value.end.getTime() - dateRange.value.start.getTime();
	if (range === 0) return 0;
	return ((t - dateRange.value.start.getTime()) / range) * chartWidth.value;
}

const todayX = computed(() => dateToX(new Date().toISOString()));

// ── Month labels ──
const monthLabels = computed(() => {
	const labels: { x: number; width: number; text: string; isCurrentMonth: boolean }[] = [];
	const now = new Date();
	const current = new Date(dateRange.value.start);
	current.setDate(1);

	while (current <= dateRange.value.end) {
		const nextMonth = new Date(current);
		nextMonth.setMonth(nextMonth.getMonth() + 1);
		const x = dateToX(current.toISOString());
		const x2 = dateToX(nextMonth.toISOString());
		labels.push({
			x,
			width: x2 - x,
			text: current.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
			isCurrentMonth: current.getMonth() === now.getMonth() && current.getFullYear() === now.getFullYear(),
		});
		current.setMonth(current.getMonth() + 1);
	}
	return labels;
});

// ── Quarter labels ──
const quarterLabels = computed(() => {
	const labels: { x: number; width: number; text: string; isCurrent: boolean }[] = [];
	const now = new Date();
	const currentQ = Math.ceil((now.getMonth() + 1) / 3);
	const currentYear = now.getFullYear();

	// Start from the quarter containing dateRange.start
	const startMonth = dateRange.value.start.getMonth();
	const startYear = dateRange.value.start.getFullYear();
	const firstQ = Math.ceil((startMonth + 1) / 3);

	let q = firstQ;
	let y = startYear;

	while (true) {
		const qStartMonth = (q - 1) * 3; // 0, 3, 6, 9
		const qStart = new Date(y, qStartMonth, 1);
		const qEnd = new Date(y, qStartMonth + 3, 1);

		if (qStart > dateRange.value.end) break;

		const x = dateToX(qStart.toISOString());
		const x2 = dateToX(qEnd.toISOString());

		labels.push({
			x,
			width: x2 - x,
			text: `Q${q} ${y}`,
			isCurrent: q === currentQ && y === currentYear,
		});

		q++;
		if (q > 4) { q = 1; y++; }
	}
	return labels;
});

// ── Bar calculations ──
function getBarStyle(row: GanttRow) {
	const start = row.startDate ? dateToX(row.startDate) : 0;
	const end = row.endDate
		? dateToX(row.endDate)
		: row.dueDate
			? dateToX(row.dueDate)
			: start + 60;

	const barWidth = Math.max(end - start, 8);
	return { left: `${start}px`, width: `${barWidth}px` };
}

function hasBar(row: GanttRow) {
	// Tasks only have dueDate — render as checkboxes, not bars
	if (row.type === 'task') return false;
	return row.startDate || row.endDate || row.dueDate;
}

function isTask(row: GanttRow) {
	return row.type === 'task';
}

function getTaskX(row: GanttRow): number {
	if (row.dueDate) return dateToX(row.dueDate);
	// No due date — position at today
	return todayX.value;
}

function isTaskDone(row: GanttRow) {
	return row.status?.toLowerCase() === 'completed' || row.status?.toLowerCase() === 'done';
}

// ── Overflow bar: grey extension showing child dates outside project dates ──
function getOverflowStyle(row: GanttRow): { left: string; width: string } | null {
	if (row.type !== 'project' || row.depth !== 0) return null;
	if (!row.startDate && !row.endDate) return null;

	const project = projects.value.find(p => p.id === row.id);
	if (!project) return null;

	const events = (project.events || []) as ProjectEventWithRelations[];
	const tickets = ticketsByProject.value.get(project.id) || [];

	let childMin = Infinity;
	let childMax = -Infinity;

	for (const e of events) {
		const d = getEventTimelineDate(e);
		if (d) { const t = new Date(d).getTime(); if (t < childMin) childMin = t; if (t > childMax) childMax = t; }
		if (e.end_date) { const t = new Date(e.end_date).getTime(); if (t > childMax) childMax = t; }
	}
	for (const tk of tickets) {
		if (tk.date_created) { const t = new Date(tk.date_created).getTime(); if (t < childMin) childMin = t; }
		if (tk.due_date) { const t = new Date(tk.due_date).getTime(); if (t > childMax) childMax = t; }
	}

	if (childMin === Infinity || childMax === -Infinity) return null;

	const projStart = row.startDate ? new Date(row.startDate).getTime() : Infinity;
	const projEnd = row.endDate ? new Date(row.endDate).getTime() : -Infinity;

	// Only show overflow if children extend beyond project dates
	const overflowStart = Math.min(childMin, projStart);
	const overflowEnd = Math.max(childMax, projEnd);

	if (overflowStart >= projStart && overflowEnd <= projEnd) return null; // no overflow

	const left = dateToX(new Date(overflowStart).toISOString());
	const right = dateToX(new Date(overflowEnd).toISOString());
	const width = Math.max(right - left, 4);

	return { left: `${left}px`, width: `${width}px` };
}

// ── Scroll to today ──
function scrollToToday() {
	nextTick(() => {
		if (!scrollWrapper.value) return;
		const containerWidth = scrollWrapper.value.clientWidth;
		scrollWrapper.value.scrollTo({
			left: Math.max(0, todayX.value - containerWidth / 3),
			behavior: 'smooth',
		});
	});
}

watch(() => projects.value.length, (len) => {
	if (len > 0) {
		// Start collapsed — just scroll to today
		scrollToToday();
	}
});

// ── Friendly date ──
function getFriendlyDate(dateStr?: string): string {
	if (!dateStr) return '';
	const d = new Date(dateStr);
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Event detail ──
const selectedEvent = computed<ProjectEventWithRelations | null>(() => {
	if (!selectedEventId.value) return null;
	for (const project of projects.value) {
		const event = project.events?.find((e) => e.id === selectedEventId.value);
		if (event) return event as ProjectEventWithRelations;
	}
	return null;
});

const selectedEventProject = computed<ProjectWithRelations | null>(() => {
	if (!selectedEventId.value) return null;
	for (const project of projects.value) {
		if (project.events?.find((e) => e.id === selectedEventId.value)) return project;
	}
	return null;
});

// ── Project preview modal ──
const showProjectPreview = ref(false);
const selectedProjectId = ref<string | null>(null);

const selectedProject = computed<ProjectWithRelations | null>(() => {
	if (!selectedProjectId.value) return null;
	return projects.value.find(p => p.id === selectedProjectId.value) || null;
});

const selectedProjectChildCount = computed(() => {
	if (!selectedProject.value) return { events: 0, tickets: 0 };
	const events = (selectedProject.value.events || []).length;
	const tickets = (ticketsByProject.value.get(selectedProject.value.id) || []).length;
	return { events, tickets };
});

const selectedProjectChildren = computed(() => {
	if (!selectedProject.value) return [];
	const items: { id: string; label: string; type: 'event' | 'ticket'; date?: string; status?: string; link?: string }[] = [];
	const events = (selectedProject.value.events || []) as ProjectEventWithRelations[];
	for (const e of events) {
		items.push({
			id: e.id,
			label: e.title || e.name || 'Event',
			type: 'event',
			date: getEventTimelineDate(e) || undefined,
			status: e.status,
		});
	}
	const tickets = ticketsByProject.value.get(selectedProject.value.id) || [];
	for (const t of tickets) {
		items.push({
			id: t.id,
			label: t.title || 'Ticket',
			type: 'ticket',
			date: t.due_date || t.date_created,
			status: t.status,
			link: `/tickets/${t.id}`,
		});
	}
	// Sort by date
	items.sort((a, b) => {
		if (!a.date) return 1;
		if (!b.date) return -1;
		return new Date(a.date).getTime() - new Date(b.date).getTime();
	});
	return items;
});

function handleRowClick(row: GanttRow) {
	if (row.type === 'project' && row.depth === 0 && row.id !== 'tasks-section') {
		// Open project preview modal
		selectedProjectId.value = row.id;
		showProjectPreview.value = true;
	} else if (row.type === 'event') {
		selectedEventId.value = row.id;
		showEventDetail.value = true;
	} else if (row.link) {
		navigateTo(row.link);
	}
}

function closeProjectPreview() {
	showProjectPreview.value = false;
	selectedProjectId.value = null;
}

function handleCloseDetail() {
	showEventDetail.value = false;
	selectedEventId.value = null;
}

// ── Task completion toggle ──
const projectTaskItems = useDirectusItems('project_tasks');
const standaloneTaskItems = useDirectusItems('tasks');
// Optimistic toggles — tracks IDs whose completion state is flipped locally before server confirms
const optimisticToggles = ref(new Set<string>());
// Per-task lock to prevent double-clicking the same task
const togglingTasks = ref(new Set<string>());

function isTaskDoneEffective(row: GanttRow): boolean {
	const serverDone = isTaskDone(row);
	if (optimisticToggles.value.has(row.id)) return !serverDone;
	return serverDone;
}

async function toggleTaskCompleted(row: GanttRow) {
	if (row.type !== 'task' || togglingTasks.value.has(row.id)) return;
	togglingTasks.value.add(row.id);
	const wasCompleted = isTaskDoneEffective(row);

	// Optimistic — flip instantly in UI
	optimisticToggles.value.add(row.id);
	optimisticToggles.value = new Set(optimisticToggles.value);

	try {
		if (row.projectId) {
			await projectTaskItems.update(row.id, {
				completed: !wasCompleted,
				completed_at: !wasCompleted ? new Date().toISOString() : null,
			});
		} else {
			await standaloneTaskItems.update(row.id, {
				status: wasCompleted ? 'in_progress' : 'completed',
			});
		}
		toast.add({ title: wasCompleted ? 'Task reopened' : 'Task completed', color: wasCompleted ? 'blue' : 'green' });
		// Background refetch — don't await, let it sync in the background
		fetchAllData().then(() => {
			optimisticToggles.value.delete(row.id);
			optimisticToggles.value = new Set(optimisticToggles.value);
		});
	} catch (e) {
		// Revert optimistic toggle
		optimisticToggles.value.delete(row.id);
		optimisticToggles.value = new Set(optimisticToggles.value);
		toast.add({ title: 'Failed to update task', color: 'red' });
		console.warn('Failed to toggle task:', e);
	} finally {
		togglingTasks.value.delete(row.id);
	}
}

// ── Full event detail (TimelineEventDetail pattern) ──
const eventItems = useDirectusItems('project_events');
const selectedEventFull = ref<any>(null);
const loadingEventDetail = ref(false);
const eventDetailRef = ref<any>(null);
const { updateEvent, deleteEvent } = useProjectTimeline();

const eventStatusOptions = [
	{ value: 'Pending', label: 'Pending' },
	{ value: 'Scheduled', label: 'Scheduled' },
	{ value: 'In Progress', label: 'In Progress' },
	{ value: 'Completed', label: 'Completed' },
];

const eventProjectProxy = computed(() => {
	if (!selectedEventFull.value || !selectedEventId.value) return null;
	// Find the project this event belongs to
	for (const p of projects.value) {
		if ((p.events || []).some((e: any) => e.id === selectedEventId.value)) {
			return { id: p.id, title: p.title, color: p.service?.color || '#888', client: p.client };
		}
	}
	return null;
});

async function openEventDetailFull() {
	if (!selectedEventId.value) return;
	loadingEventDetail.value = true;
	try {
		const fullEvent = await eventItems.get(selectedEventId.value, {
			fields: ['*', 'tasks.*', 'tasks.assignee_id.id', 'tasks.assignee_id.first_name', 'tasks.assignee_id.last_name', 'tasks.assignee_id.avatar', 'files.directus_files_id.*', 'category_id.id,category_id.name,category_id.color,category_id.text_color', 'invoices.invoices_id.id', 'invoices.invoices_id.invoice_code', 'invoices.invoices_id.total_amount', 'invoices.invoices_id.status', 'approved_by.id', 'approved_by.first_name', 'approved_by.last_name'],
		});
		selectedEventFull.value = fullEvent;
	} catch (err) {
		console.error('Error fetching event details:', err);
		selectedEventFull.value = null;
	} finally {
		loadingEventDetail.value = false;
	}
}

watch(showEventDetail, (open) => {
	if (open && selectedEventId.value) {
		openEventDetailFull();
	} else {
		selectedEventFull.value = null;
	}
});

const handleEventStatusChange = async (e: any) => {
	if (!selectedEventFull.value) return;
	try {
		await updateEvent(selectedEventFull.value.id, { status: e.newStatus });
		selectedEventFull.value.status = e.newStatus;
		fetchAllData();
	} catch (err) {
		console.error('Error updating event status:', err);
	}
};

const handleEventUpdated = () => {
	fetchAllData();
};

const handleDeleteEventFromModal = async () => {
	if (!selectedEventFull.value) return;
	if (!confirm('Are you sure you want to delete this event? This cannot be undone.')) return;
	try {
		await deleteEvent(selectedEventFull.value.id);
		handleCloseDetail();
		fetchAllData();
		toast.add({ title: 'Event deleted', color: 'green' });
	} catch (err) {
		toast.add({ title: 'Failed to delete event', color: 'red' });
	}
};

// ── Editable project fields ──
const projectItems = useDirectusItems('projects');
const projectForm = reactive({ title: '', description: '', start_date: '', completion_date: '', status: '', service: '' as string | null });
const serviceItems = useDirectusItems('services');
const servicesList = ref<{ id: string; name: string; color?: string }[]>([]);

onMounted(async () => {
	try {
		const results = await serviceItems.list({ fields: ['id', 'name', 'color'], filter: { status: { _eq: 'published' } }, sort: ['name'], limit: 100 });
		servicesList.value = (results || []) as any[];
	} catch (e) {
		console.warn('Failed to load services:', e);
	}
});
const savingProject = ref(false);

watch(selectedProject, (p) => {
	if (p) {
		projectForm.title = p.title || '';
		projectForm.description = p.description || '';
		projectForm.start_date = p.start_date?.split('T')[0] || '';
		projectForm.completion_date = p.completion_date?.split('T')[0] || '';
		projectForm.status = p.status || '';
		projectForm.service = typeof p.service === 'string' ? p.service : p.service?.id || null;
	}
});

async function saveProjectChanges() {
	if (!selectedProjectId.value) return;
	savingProject.value = true;
	try {
		await projectItems.update(selectedProjectId.value, {
			title: projectForm.title || undefined,
			description: projectForm.description || undefined,
			start_date: projectForm.start_date || undefined,
			completion_date: projectForm.completion_date || undefined,
			status: projectForm.status || undefined,
			service: projectForm.service || null,
		});
		await fetchAllData();
		toast.add({ title: 'Project updated', color: 'green' });
		closeProjectPreview();
	} catch (err) {
		toast.add({ title: 'Failed to update project', color: 'red' });
		console.error('Failed to update project:', err);
	} finally {
		savingProject.value = false;
	}
}

const showUndated = ref(false);
</script>

<template>
	<div class="gantt" :class="{ 'gantt--compact': compact }">
		<!-- Toolbar -->
		<div class="gantt__toolbar">
			<div class="flex items-center gap-2">
				<div class="flex items-center rounded-lg bg-muted/40 p-0.5">
					<button
						@click="setViewMode('nested')"
						class="px-2.5 py-1 text-[10px] font-medium rounded-md transition-all"
						:class="viewMode === 'nested' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
					>Nested</button>
					<button
						@click="setViewMode('flat')"
						class="px-2.5 py-1 text-[10px] font-medium rounded-md transition-all"
						:class="viewMode === 'flat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
					>Flat</button>
				</div>
				<button @click="scrollToToday" class="px-2 h-6 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
					Today
				</button>
				<button @click="fetchAllData" class="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
					<Icon :name="loading ? 'lucide:loader-2' : 'lucide:refresh-cw'" class="w-3 h-3" :class="loading ? 'animate-spin' : ''" />
				</button>
			</div>
			<div class="flex items-center gap-2">
				<button
					v-if="completedProjectCount > 0"
					@click="showCompleted = !showCompleted"
					class="flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full transition-colors"
					:class="showCompleted
						? 'text-foreground bg-muted/60'
						: 'text-muted-foreground/60 bg-muted/20 hover:bg-muted/40'"
				>
					<Icon :name="showCompleted ? 'lucide:eye' : 'lucide:eye-off'" class="w-2.5 h-2.5" />
					{{ completedProjectCount }} completed
				</button>
				<button
					v-if="undatedProjects.length > 0"
					@click="showUndated = !showUndated"
					class="flex items-center gap-1 text-[9px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 px-2 py-0.5 rounded-full transition-colors"
				>
					<Icon name="lucide:calendar-off" class="w-2.5 h-2.5" />
					{{ undatedProjects.length }} undated
				</button>
				<span class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60 border border-border/40 px-2 py-0.5 rounded-full">
					{{ quarterLabel }}
				</span>
			</div>
		</div>

		<!-- Undated projects panel -->
		<Transition name="fade">
			<div v-if="showUndated && undatedProjects.length > 0" class="mb-4 rounded-xl border border-border/50 bg-muted/20 p-3">
				<div class="flex items-center justify-between mb-2">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Projects without dates</span>
					<button @click="showUndated = false" class="text-muted-foreground hover:text-foreground">
						<Icon name="lucide:x" class="w-3 h-3" />
					</button>
				</div>
				<div class="space-y-1">
					<nuxt-link
						v-for="project in undatedProjects"
						:key="project.id"
						:to="`/projects/${project.id}`"
						class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors"
					>
						<span
							class="w-2 h-2 rounded-full shrink-0"
							:style="{ backgroundColor: project.service?.color || '#d4d4d8' }"
						/>
						<span class="truncate">{{ project.title || 'Untitled Project' }}</span>
						<span v-if="project.status" class="text-[8px] uppercase font-medium text-muted-foreground ml-auto shrink-0">{{ project.status }}</span>
					</nuxt-link>
				</div>
			</div>
		</Transition>

		<!-- Loading (no data yet) -->
		<div v-if="loading && rows.length === 0" class="gantt__empty">
			<div class="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
			<span class="text-[10px] text-muted-foreground mt-2">Loading timeline...</span>
		</div>

		<!-- Error -->
		<div v-else-if="error" class="gantt__empty">
			<p class="text-xs text-destructive">{{ error }}</p>
			<button class="mt-2 text-[10px] text-muted-foreground hover:text-foreground" @click="fetchAllData">Try again</button>
		</div>

		<!-- Empty -->
		<div v-else-if="rows.length === 0 && !loading" class="gantt__empty">
			<Icon name="lucide:gantt-chart" class="h-10 w-10 text-muted-foreground/20 mb-3" />
			<template v-if="undatedProjects.length > 0">
				<p class="text-sm font-medium text-foreground">All projects need dates</p>
				<p class="text-xs text-muted-foreground mt-1">Add start or end dates to your projects to see them on the timeline.</p>
				<button @click="showUndated = true" class="mt-3 text-xs text-primary hover:underline">
					View {{ undatedProjects.length }} undated project{{ undatedProjects.length > 1 ? 's' : '' }}
				</button>
			</template>
			<template v-else>
				<p class="text-sm font-medium text-foreground">No projects on the timeline</p>
				<p class="text-xs text-muted-foreground mt-1">{{ selectedClient ? 'No projects for this client.' : 'Create a project to see it here.' }}</p>
				<NuxtLink
					v-if="!selectedClient"
					to="/projects?new=1"
					class="inline-flex items-center gap-1.5 mt-4 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
				>
					<Icon name="lucide:plus" class="w-3.5 h-3.5" />
					Create your first project
				</NuxtLink>
			</template>
		</div>

		<!-- Gantt body: outer scroll container -->
		<div v-else class="gantt__body relative" ref="scrollWrapper">
			<!-- Loading overlay -->
			<Transition name="fade">
				<div v-if="loading && rows.length > 0" class="absolute inset-0 bg-background/50 z-30 flex items-center justify-center backdrop-blur-[1px] rounded-xl">
					<div class="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
				</div>
			</Transition>

			<!-- Inner scroll area (horizontal scroll here) -->
			<div class="gantt__scroll" :style="{ width: `${LABEL_WIDTH + chartWidth}px` }">

				<!-- Header: Quarter row -->
				<div class="gantt__header gantt__header--quarters">
					<div class="gantt__header-label" />
					<div class="gantt__header-track">
						<div
							v-for="ql in quarterLabels"
							:key="ql.text"
							class="gantt__quarter"
							:class="{ 'gantt__quarter--current': ql.isCurrent }"
							:style="{ left: ql.x + 'px', width: ql.width + 'px' }"
						>
							<span class="gantt__quarter-pill">{{ ql.text }}</span>
						</div>
					</div>
				</div>

				<!-- Header: Month row -->
				<div class="gantt__header gantt__header--months">
					<div class="gantt__header-label">Project</div>
					<div class="gantt__header-track">
						<div
							v-for="label in monthLabels"
							:key="label.text"
							class="gantt__month"
							:class="{ 'gantt__month--current': label.isCurrentMonth }"
							:style="{ left: label.x + 'px', width: label.width + 'px' }"
						>
							{{ label.text }}
						</div>
					</div>
				</div>

				<!-- Quarter grid lines (behind bars) -->
				<div
					v-for="ql in quarterLabels"
					:key="'qline-' + ql.text"
					class="gantt__quarter-line"
					:style="{ left: `${LABEL_WIDTH + ql.x}px`, height: `${HEADER_HEIGHT + filteredRows.length * ROW_HEIGHT}px` }"
				/>

				<!-- Data rows -->
				<div
					v-for="(row, i) in filteredRows"
					:key="row.id"
					class="gantt__row"
					:class="{ 'gantt__row--alt': i % 2 === 1 }"
				>
					<!-- Label (sticky left) -->
					<div
						class="gantt__label"
						:class="{
							'gantt__label--project': row.depth === 0 && row.type === 'project',
							'gantt__label--child': row.depth === 1,
							'gantt__label--depth2': row.depth >= 2,
						}"
						@click="handleRowClick(row)"
					>
						<!-- Absolute toggle button for projects -->
						<button
							v-if="row.hasChildren && row.type === 'project' && row.id !== 'tasks-section'"
							class="gantt__toggle"
							@click.stop="toggleProject(row.id)"
						>
							<Icon :name="row.expanded ? 'lucide:minus' : 'lucide:plus'" class="w-2.5 h-2.5" />
						</button>
						<!-- Type icon (depth > 0, non-task) -->
						<Icon
							v-if="row.depth > 0 && row.type !== 'task'"
							:name="row.type === 'event' ? 'lucide:calendar' : 'lucide:ticket'"
							class="w-3 h-3 shrink-0"
							:class="{ 'text-amber-500': row.type === 'ticket' }"
							:style="{ marginLeft: `${16 + row.depth * 16}px`, ...(row.type === 'event' ? { color: row.color } : {}) }"
						/>
						<!-- Task status icon -->
						<Icon
							v-if="row.type === 'task'"
							:name="isTaskDoneEffective(row) ? 'lucide:check-circle-2' : 'lucide:circle'"
							class="w-3 h-3 shrink-0"
							:class="isTaskDoneEffective(row) ? 'text-emerald-500' : 'text-purple-500'"
							:style="{ marginLeft: `${16 + row.depth * 16}px` }"
						/>
						<!-- Label text -->
						<span
							class="gantt__label-text"
							:class="{ 'gantt__label-text--done': row.type === 'task' && isTaskDoneEffective(row) }"
							:style="{ paddingLeft: row.depth === 0 ? '20px' : '4px' }"
							:title="row.label"
						>{{ row.label }}</span>
					</div>

					<!-- Track -->
					<div class="gantt__track">
						<div class="gantt__track-bg">
							<!-- Overflow bar (grey extension for child dates outside project range) -->
							<div
								v-if="getOverflowStyle(row)"
								class="gantt__overflow"
								:style="getOverflowStyle(row)!"
							/>
							<UTooltip
								v-if="hasBar(row)"
								:text="`${row.label}${row.status ? ' — ' + statusLabel(row.status) : ''}${row.startDate ? ' · ' + getFriendlyDate(row.startDate) : ''}${row.endDate && row.endDate !== row.startDate ? ' → ' + getFriendlyDate(row.endDate) : ''}`"
								:popper="{ placement: 'top', offsetDistance: 6 }"
							>
								<div
									class="gantt__bar"
									:style="{
										...getBarStyle(row),
										backgroundColor: row.color,
										opacity: getBarOpacity(row.status),
									}"
									@click="handleRowClick(row)"
								/>
							</UTooltip>

							<!-- Milestone diamond (events/tickets without date range) -->
							<div
								v-if="!row.startDate && !row.endDate && row.dueDate && row.type !== 'task'"
								class="gantt__milestone"
								:style="{ left: dateToX(row.dueDate) + 'px' }"
								:title="`Due: ${getFriendlyDate(row.dueDate)}`"
							>
								<div class="gantt__diamond" :style="{ backgroundColor: row.color }" />
							</div>

							<!-- Task checkbox -->
							<div
								v-if="isTask(row)"
								class="gantt__task-check"
								:style="{ left: getTaskX(row) + 'px' }"
								:title="`${row.label} — ${isTaskDoneEffective(row) ? 'Done' : 'Incomplete'}${row.dueDate ? ' · Due: ' + getFriendlyDate(row.dueDate) : ''}`"
								@click.stop="toggleTaskCompleted(row)"
							>
								<div
									class="gantt__task-circle"
									:class="{ 'gantt__task-circle--done': isTaskDoneEffective(row) }"
									:style="{
										borderColor: row.color,
										backgroundColor: isTaskDoneEffective(row) ? row.color : 'transparent',
									}"
								>
									<svg v-if="isTaskDoneEffective(row)" class="w-[7px] h-[7px] text-white" viewBox="0 0 12 12" fill="none">
										<path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Today line -->
				<div
					class="gantt__today"
					:style="{ left: `${LABEL_WIDTH + todayX}px`, top: '0', height: `${HEADER_HEIGHT + filteredRows.length * ROW_HEIGHT}px` }"
				>
					<div class="gantt__today-pip" />
				</div>
			</div>
		</div>

		<!-- Event Modal (editable if permitted, read-only otherwise) -->
		<UModal v-model="showEventDetail" class="sm:max-w-xl">
			<template #header>
				<div class="w-full space-y-3">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-bold uppercase tracking-wide">Event Details</h3>
						<button @click="handleCloseDetail" class="p-1 text-muted-foreground hover:text-foreground">
							<Icon name="lucide:x" class="w-4 h-4" />
						</button>
					</div>
					<FormStatusTimeline
						v-if="selectedEventFull && !loadingEventDetail"
						:currentStatus="selectedEventFull.status || 'Active'"
						:statuses="eventStatusOptions.map(s => ({ id: s.value, name: s.label }))"
						collection="project_events"
						:itemId="selectedEventFull.id"
						@status-change="handleEventStatusChange"
					/>
				</div>
			</template>

			<div class="max-h-[70vh] overflow-y-auto px-4 pb-4">
				<div v-if="loadingEventDetail" class="flex items-center justify-center py-20">
					<div class="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
				</div>
				<ProjectTimelineEventDetail
					v-else-if="selectedEventFull"
					ref="eventDetailRef"
					:event="selectedEventFull"
					:project="eventProjectProxy || { id: '', title: '', color: '#888' }"
					@close="handleCloseDetail"
					@updated="handleEventUpdated"
				/>
			</div>

			<template #footer v-if="selectedEventFull && !loadingEventDetail">
				<div class="flex items-center justify-between w-full">
					<div class="flex items-center gap-1">
						<UTooltip text="Delete event">
							<button
								class="p-1.5 rounded-md text-destructive hover:bg-destructive/10 transition-colors"
								@click="handleDeleteEventFromModal"
							>
								<Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
							</button>
						</UTooltip>
					</div>
					<button
						class="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
						:disabled="!eventDetailRef?.dirty || eventDetailRef?.saving"
						@click="eventDetailRef?.save()"
					>
						<Icon v-if="eventDetailRef?.saving" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 inline animate-spin" />
						Save
					</button>
				</div>
			</template>
		</UModal>

		<!-- Project Modal (editable if permitted, read-only otherwise) -->
		<UModal v-model="showProjectPreview" class="sm:max-w-md">
			<template #header>
				<div class="flex items-center justify-between w-full">
					<div class="flex items-center gap-2">
						<span
							class="w-3 h-3 rounded-full shrink-0"
							:style="{ backgroundColor: selectedProject?.service?.color || '#d4d4d8' }"
						/>
						<span class="text-sm font-semibold">{{ selectedProject?.title }}</span>
					</div>
					<button @click="closeProjectPreview" class="p-1 text-muted-foreground hover:text-foreground">
						<Icon name="lucide:x" class="w-4 h-4" />
					</button>
				</div>
			</template>
			<div v-if="selectedProject" class="p-4 space-y-3 text-sm">
				<!-- Service & child counts (always read-only context info) -->
				<div class="flex items-center gap-3 flex-wrap">
					<span v-if="selectedProject.service?.name" class="text-[10px] text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-md">{{ selectedProject.service.name }}</span>
					<span v-if="selectedProjectChildCount.events > 0" class="text-[10px] text-muted-foreground flex items-center gap-1">
						<Icon name="lucide:calendar-days" class="w-2.5 h-2.5 text-cyan-500" />
						{{ selectedProjectChildCount.events }} event{{ selectedProjectChildCount.events > 1 ? 's' : '' }}
					</span>
					<span v-if="selectedProjectChildCount.tickets > 0" class="text-[10px] text-muted-foreground flex items-center gap-1">
						<Icon name="lucide:ticket" class="w-2.5 h-2.5 text-amber-500" />
						{{ selectedProjectChildCount.tickets }} ticket{{ selectedProjectChildCount.tickets > 1 ? 's' : '' }}
					</span>
				</div>

				<!-- Editable fields (or read-only) -->
				<div class="space-y-3">
					<div>
						<label class="gantt-modal-label">Title</label>
						<input v-if="canEditProjects" v-model="projectForm.title" type="text" class="gantt-modal-input" />
						<p v-else class="text-sm text-foreground">{{ projectForm.title }}</p>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="gantt-modal-label">Start Date</label>
							<input v-if="canEditProjects" v-model="projectForm.start_date" type="date" class="gantt-modal-input" />
							<p v-else class="text-xs text-foreground">{{ getFriendlyDate(projectForm.start_date) || '—' }}</p>
						</div>
						<div>
							<label class="gantt-modal-label">End Date</label>
							<input v-if="canEditProjects" v-model="projectForm.completion_date" type="date" class="gantt-modal-input" />
							<p v-else class="text-xs text-foreground">{{ getFriendlyDate(projectForm.completion_date) || '—' }}</p>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="gantt-modal-label">Status</label>
							<select v-if="canEditProjects" v-model="projectForm.status" class="gantt-modal-input">
								<option value="">None</option>
								<option value="Pending">Pending</option>
								<option value="Scheduled">Scheduled</option>
								<option value="In Progress">In Progress</option>
								<option value="Completed">Completed</option>
								<option value="Archived">Archived</option>
							</select>
							<p v-else class="text-xs text-foreground">{{ projectForm.status || '—' }}</p>
						</div>
						<div>
							<label class="gantt-modal-label">Service</label>
							<select v-if="canEditProjects" v-model="projectForm.service" class="gantt-modal-input">
								<option :value="null">None</option>
								<option v-for="svc in servicesList" :key="svc.id" :value="svc.id">
									{{ svc.name }}
								</option>
							</select>
							<p v-else class="text-xs text-foreground">
								{{ servicesList.find(s => s.id === projectForm.service)?.name || selectedProject?.service?.name || '—' }}
							</p>
						</div>
					</div>
					<div>
						<label class="gantt-modal-label">Description</label>
						<textarea v-if="canEditProjects" v-model="projectForm.description" rows="3" class="gantt-modal-input !h-auto py-2 resize-none" />
						<p v-else class="text-xs text-foreground/70 leading-relaxed">{{ projectForm.description || '—' }}</p>
					</div>
				</div>

				<!-- Children list (events, tickets) -->
				<div v-if="selectedProjectChildren.length > 0" class="pt-2 border-t border-border/30">
					<span class="gantt-modal-label">Events &amp; Tickets</span>
					<div class="space-y-0.5 max-h-[160px] overflow-y-auto">
						<component
							v-for="child in selectedProjectChildren"
							:key="child.id"
							:is="child.link ? 'nuxt-link' : 'div'"
							:to="child.link || undefined"
							class="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors"
							:class="child.link ? 'hover:bg-muted/40 cursor-pointer' : ''"
							@click="child.type === 'event' ? (closeProjectPreview(), selectedEventId = child.id, showEventDetail = true) : undefined"
						>
							<Icon
								:name="child.type === 'event' ? 'lucide:calendar' : 'lucide:ticket'"
								class="w-3 h-3 shrink-0"
								:class="child.type === 'event' ? 'text-cyan-500' : 'text-amber-500'"
							/>
							<span class="truncate flex-1 text-foreground/70">{{ child.label }}</span>
							<span v-if="child.date" class="text-[9px] text-muted-foreground shrink-0">{{ getFriendlyDate(child.date) }}</span>
							<span
								v-if="child.status"
								class="text-[8px] uppercase font-medium shrink-0"
								:class="{
									'text-green-500': child.status?.toLowerCase().replace(/\s+/g, '') === 'completed',
									'text-blue-500': child.status?.toLowerCase().replace(/\s+/g, '') === 'inprogress',
									'text-amber-500': child.status?.toLowerCase() === 'scheduled' || child.status?.toLowerCase() === 'pending',
									'text-muted-foreground': !['completed', 'inprogress', 'scheduled', 'pending'].includes(child.status?.toLowerCase().replace(/\s+/g, '') || ''),
								}"
							>{{ child.status }}</span>
						</component>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex items-center gap-2 pt-2 border-t border-border/40">
					<nuxt-link
						:to="`/projects/${selectedProject.id}`"
						class="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-border/50 rounded-lg hover:bg-muted/30 transition-colors"
						@click="closeProjectPreview"
					>
						Open Project
						<Icon name="lucide:arrow-right" class="w-3 h-3" />
					</nuxt-link>
					<button
						v-if="canEditProjects"
						@click="saveProjectChanges"
						:disabled="savingProject"
						class="ml-auto px-4 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
					>{{ savingProject ? 'Saving...' : 'Save Changes' }}</button>
				</div>
			</div>
		</UModal>
	</div>
</template>

<style scoped>
/* ── Container ── */
.gantt {
	background: hsl(var(--background));
	border-radius: 20px;
	padding: 24px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03), 0 4px 12px rgba(0, 0, 0, 0.02);
}
.gantt--compact {
	padding: 0;
	border-radius: 0;
	box-shadow: none;
}

/* ── Toolbar ── */
.gantt__toolbar {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding-bottom: 16px;
	margin-bottom: 8px;
}

/* ── Empty / loading states ── */
.gantt__empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	min-height: 200px;
}

/* ── Body (scroll container — scrolls both axes) ── */
.gantt__body {
	overflow: auto;
	max-height: calc(100vh - 280px);
	scrollbar-width: none;
	-ms-overflow-style: none;
}
.gantt__body::-webkit-scrollbar { display: none; }

/* ── Inner scroll area (sets the total scrollable width) ── */
.gantt__scroll {
	position: relative;
}

/* ── Header row ── */
.gantt__header {
	display: flex;
	height: 28px;
	border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
:is(.dark) .gantt__header {
	border-bottom-color: rgba(255, 255, 255, 0.06);
}

.gantt__header-label {
	width: 180px;
	min-width: 180px;
	position: sticky;
	left: 0;
	z-index: 12;
	display: flex;
	align-items: flex-end;
	padding: 0 14px 4px;
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: hsl(var(--muted-foreground) / 0.6);
	background: hsl(var(--background));
}
.gantt--compact .gantt__header-label {
	background: hsl(var(--card));
}

.gantt__header-track {
	flex: 1;
	position: relative;
	min-width: 0;
}

.gantt__month {
	position: absolute;
	top: 0;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: rgba(0, 0, 0, 0.3);
	border-right: 1px solid rgba(0, 0, 0, 0.04);
	user-select: none;
}
:is(.dark) .gantt__month {
	color: rgba(255, 255, 255, 0.25);
	border-right-color: rgba(255, 255, 255, 0.04);
}
.gantt__month--current {
	color: hsl(var(--primary));
}

/* ── Quarter header ── */
.gantt__header--quarters {
	height: 24px;
	border-bottom: none;
}
.gantt__header--quarters .gantt__header-label {
	height: 24px;
}

.gantt__quarter {
	position: absolute;
	top: 0;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	user-select: none;
}

.gantt__quarter-pill {
	font-size: 8px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: hsl(var(--muted-foreground) / 0.5);
	background: hsl(var(--muted) / 0.3);
	padding: 2px 8px;
	border-radius: 999px;
	white-space: nowrap;
}
.gantt__quarter--current .gantt__quarter-pill {
	color: hsl(var(--primary));
	background: hsl(var(--primary) / 0.08);
}

/* ── Quarter grid lines ── */
.gantt__quarter-line {
	position: absolute;
	top: 0;
	width: 1px;
	background: hsl(var(--border) / 0.5);
	z-index: 0;
	pointer-events: none;
}

/* ── Data row ── */
.gantt__row {
	display: flex;
	height: 32px;
}
.gantt__row--alt .gantt__label {
	background: rgba(0, 0, 0, 0.015);
}
:is(.dark) .gantt__row--alt .gantt__label {
	background: rgba(255, 255, 255, 0.015);
}

/* ── Label column (sticky left) ── */
.gantt__label {
	width: 180px;
	min-width: 180px;
	position: sticky;
	left: 0;
	z-index: 10;
	display: flex;
	align-items: center;
	padding: 0 8px 0 0;
	font-size: 11px;
	font-weight: 400;
	color: hsl(var(--foreground) / 0.55);
	background: hsl(var(--background));
	cursor: pointer;
	overflow: hidden;
	transition: color 0.15s;
	border-right: 1px solid rgba(0, 0, 0, 0.04);
	position: sticky;
	left: 0;
	/* position: relative needed for absolute toggle button */
}
:is(.dark) .gantt__label {
	border-right-color: rgba(255, 255, 255, 0.04);
}
.gantt--compact .gantt__label {
	background: hsl(var(--card));
}
.gantt__label:hover {
	color: hsl(var(--foreground));
}
.gantt__label--project {
	font-weight: 600;
	color: hsl(var(--foreground) / 0.85);
}
.gantt__label--child {
	font-weight: 400;
	color: hsl(var(--foreground) / 0.7);
	font-size: 10px;
}
.gantt__label--depth2 {
	font-weight: 400;
	color: hsl(var(--foreground) / 0.6);
	font-size: 9px;
}

.gantt__label-text {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	flex: 1;
	min-width: 0;
}

/* ── Toggle button (+/-) — absolute so labels align ── */
.gantt__toggle {
	position: absolute;
	left: 2px;
	width: 14px;
	height: 14px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	border-radius: 3px;
	color: hsl(var(--muted-foreground) / 0.5);
	border: 1px solid hsl(var(--border) / 0.5);
	transition: all 0.15s;
	z-index: 1;
}
.gantt__toggle:hover {
	color: hsl(var(--foreground));
	border-color: hsl(var(--border));
	background: hsl(var(--muted) / 0.3);
}

/* ── Track column ── */
.gantt__track {
	flex: 1;
	display: flex;
	align-items: center;
	min-width: 0;
}

.gantt__track-bg {
	width: 100%;
	height: 12px;
	border-radius: 6px;
	position: relative;
}

/* ── Overflow bar (grey extension for child dates outside project range) ── */
.gantt__overflow {
	position: absolute;
	top: 2px;
	height: calc(100% - 4px);
	border-radius: 4px;
	background: rgba(0, 0, 0, 0.04);
	z-index: 0;
}
:is(.dark) .gantt__overflow {
	background: rgba(255, 255, 255, 0.04);
}

/* ── Bar ── */
.gantt__bar {
	position: absolute;
	top: 0;
	height: 100%;
	border-radius: 6px;
	cursor: pointer;
	transition: filter 0.15s;
	z-index: 1;
}
.gantt__bar:hover {
	filter: brightness(0.92);
}

/* ── Milestone ── */
.gantt__milestone {
	position: absolute;
	top: 50%;
	transform: translate(-50%, -50%);
	z-index: 2;
}
.gantt__diamond {
	width: 8px;
	height: 8px;
	transform: rotate(45deg);
	border-radius: 1px;
	opacity: 0.8;
}

.gantt__label-text--done {
	text-decoration: line-through;
	opacity: 0.4;
}

/* ── Task checkbox in track (for tasks with due dates) ── */
.gantt__task-check {
	position: absolute;
	top: 50%;
	transform: translate(-50%, -50%);
	z-index: 2;
	cursor: pointer;
}
.gantt__task-circle {
	width: 12px;
	height: 12px;
	border-radius: 50%;
	border: 2px solid;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.15s ease;
}
.gantt__task-circle:hover {
	transform: scale(1.3);
}
.gantt__task-circle--done {
	opacity: 0.5;
}

/* ── Today line ── */
.gantt__today {
	position: absolute;
	width: 1px;
	background: hsl(var(--primary));
	opacity: 0.2;
	z-index: 5;
	pointer-events: none;
}
.gantt__today-pip {
	position: absolute;
	top: 8px;
	left: -3px;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: hsl(var(--primary));
	opacity: 0.6;
}

/* ── Modal form fields ── */
.gantt-modal-label {
	display: block;
	font-size: 10px;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: hsl(var(--muted-foreground));
	margin-bottom: 4px;
}
.gantt-modal-input {
	width: 100%;
	height: 32px;
	border-radius: 8px;
	border: 1px solid hsl(var(--border));
	background: hsl(var(--background));
	padding: 0 12px;
	font-size: 13px;
	color: hsl(var(--foreground));
	transition: border-color 0.15s;
}
.gantt-modal-input:focus {
	outline: none;
	border-color: hsl(var(--primary) / 0.4);
	box-shadow: 0 0 0 2px hsl(var(--primary) / 0.08);
}

/* ── Fade transition ── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

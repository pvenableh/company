<script setup lang="ts">
/**
 * UnifiedGantt — Asana-style Gantt chart with:
 *   - Left sidebar: project/event/ticket/task list
 *   - Right panel: horizontal bars on time grid
 *   - Dependency arrows between related items
 *   - Today marker, zoom, expand/collapse
 */

import type { ProjectWithRelations, ProjectEventWithRelations } from '~~/shared/projects';
import { getEventTimelineDate } from '~~/shared/projects';

const {
	viewMode,
	setViewMode,
	loading: unifiedLoading,
	data: timelineData,
	fetchAll,
	ticketsByProject,
	personalTasks,
	unassignedTickets,
} = useUnifiedTimeline();

const { projects, loading: projectsLoading, error, fetchProjects } = useProjectTimeline();

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 48;
const SIDEBAR_WIDTH = 280;

const zoom = ref(2);
const scrollContainer = ref<HTMLElement | null>(null);
const sidebarScroll = ref<HTMLElement | null>(null);
const expandedProjects = ref<Set<string>>(new Set());
const selectedEventId = ref<string | null>(null);
const showEventDetail = ref(false);

// ── Sidebar toggle (hidden by default, persisted) ──
const SIDEBAR_STORAGE_KEY = 'earnest-gantt-sidebar';
const showSidebar = ref(false);
if (import.meta.client) {
	const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
	if (stored !== null) showSidebar.value = stored === 'true';
}
function toggleSidebar() {
	showSidebar.value = !showSidebar.value;
	if (import.meta.client) localStorage.setItem(SIDEBAR_STORAGE_KEY, String(showSidebar.value));
}

// ── Status color helpers ──
function statusColor(status?: string): string {
	const s = status?.toLowerCase().replace(/\s+/g, '') || '';
	if (s === 'completed' || s === 'done') return '#22c55e';
	if (s === 'inprogress' || s === 'active') return '#3b82f6';
	if (s === 'scheduled' || s === 'pending') return '#f59e0b';
	return '#9ca3af';
}

function statusLabel(status?: string): string {
	const s = status?.toLowerCase().replace(/\s+/g, '') || '';
	if (s === 'completed' || s === 'done') return 'Completed';
	if (s === 'inprogress' || s === 'active') return 'In Progress';
	if (s === 'scheduled' || s === 'pending') return 'Scheduled';
	return status || '';
}

// ── Data fetching ──
const { user: authUser } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { selectedClient } = useClients();

const loading = computed(() => projectsLoading.value || unifiedLoading.value);

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
	// Auto-expand all projects initially
	nextTick(() => {
		for (const p of projects.value) expandedProjects.value.add(p.id);
	});
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
		// ── NESTED: Projects as parents, events/tickets as expandable children ──
		for (const project of projects.value) {
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
				for (const event of events) {
					const eventDate = getEventTimelineDate(event);
					result.push({
						id: event.id,
						label: event.title || event.name || 'Event',
						type: 'event',
						depth: 1,
						color: projectColor,
						startDate: eventDate,
						endDate: event.end_date || eventDate,
						projectId: project.id,
						status: event.status,
					});
				}
				for (const ticket of tickets) {
					result.push({
						id: ticket.id,
						label: ticket.title || 'Untitled Ticket',
						type: 'ticket',
						depth: 1,
						color: projectColor,
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
		// ── FLAT: All items at the same level, grouped by type ──
		// Projects
		for (const project of projects.value) {
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
		// All tickets (flat, not grouped by project)
		for (const ticket of timelineData.value.tickets) {
			result.push({
				id: ticket.id,
				label: ticket.title || 'Untitled Ticket',
				type: 'ticket',
				depth: 0,
				color: '#3b82f6',
				status: ticket.status,
				startDate: ticket.date_created,
				dueDate: ticket.due_date,
				link: `/tickets/${ticket.id}`,
			});
		}
	}

	// Personal tasks (both views)
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

const chartWidth = computed(() => Math.max(1200, 1400 * zoom.value));
const chartHeight = computed(() => filteredRows.value.length * ROW_HEIGHT + HEADER_HEIGHT);

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
			text: current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
			isCurrentMonth: current.getMonth() === now.getMonth() && current.getFullYear() === now.getFullYear(),
		});
		current.setMonth(current.getMonth() + 1);
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
	return row.startDate || row.endDate || row.dueDate;
}

// ── Scroll sync ──
function syncScroll(e: Event) {
	const target = e.target as HTMLElement;
	if (sidebarScroll.value) {
		sidebarScroll.value.scrollTop = target.scrollTop;
	}
}

// ── Scroll to today ──
function scrollToToday() {
	nextTick(() => {
		if (!scrollContainer.value) return;
		const containerWidth = scrollContainer.value.clientWidth;
		scrollContainer.value.scrollLeft = Math.max(0, todayX.value - containerWidth / 3);
	});
}

watch(() => projects.value.length, (len) => {
	if (len > 0) {
		expandAll();
		scrollToToday();
	}
});

// ── Zoom ──
function handleZoomIn() { zoom.value = Math.min(zoom.value + 0.5, 5); }
function handleZoomOut() { zoom.value = Math.max(zoom.value - 0.5, 1); }

// ── Type filters ──
const activeTypeFilters = ref<Set<string>>(new Set(['project', 'event', 'ticket', 'task']));

const typeFilterOptions = [
	{ key: 'project', label: 'Projects', icon: 'lucide:folder', color: 'text-primary', bg: 'bg-primary/10', activeBg: 'bg-primary/15' },
	{ key: 'event', label: 'Events', icon: 'lucide:calendar', color: 'text-cyan-500', bg: 'bg-cyan-500/10', activeBg: 'bg-cyan-500/15' },
	{ key: 'ticket', label: 'Tickets', icon: 'lucide:ticket', color: 'text-amber-500', bg: 'bg-amber-500/10', activeBg: 'bg-amber-500/15' },
	{ key: 'task', label: 'Tasks', icon: 'lucide:check-square', color: 'text-purple-500', bg: 'bg-purple-500/10', activeBg: 'bg-purple-500/15' },
];

function toggleTypeFilter(type: string) {
	const s = new Set(activeTypeFilters.value);
	if (s.has(type)) {
		// Don't allow deselecting all
		if (s.size > 1) s.delete(type);
	} else {
		s.add(type);
	}
	activeTypeFilters.value = s;
}

const typeCounts = computed(() => {
	const counts: Record<string, number> = { project: 0, event: 0, ticket: 0, task: 0 };
	for (const row of rows.value) {
		if (counts[row.type] !== undefined) counts[row.type]++;
	}
	return counts;
});

const filteredRows = computed(() => {
	const filters = activeTypeFilters.value;
	// If all filters are active, skip filtering
	if (filters.size === 4) return rows.value;

	return rows.value.filter(row => {
		// Always show projects if any of their children are visible
		if (row.type === 'project' && filters.has('project')) return true;
		if (row.type === 'project' && !filters.has('project')) {
			// Still show project header if it has visible children
			if (row.expanded && (filters.has('event') || filters.has('ticket'))) return true;
			return false;
		}
		return filters.has(row.type);
	});
});

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

function getProjectServiceName(projectId: string): string {
	const project = projects.value.find(p => p.id === projectId);
	return project?.service?.name || 'No service';
}

function handleRowClick(row: GanttRow) {
	if (row.type === 'event') {
		selectedEventId.value = row.id;
		showEventDetail.value = true;
	} else if (row.link) {
		navigateTo(row.link);
	}
}

function handleCloseDetail() {
	showEventDetail.value = false;
	selectedEventId.value = null;
}
</script>

<template>
	<div class="gantt-container">
		<!-- Toolbar -->
		<div class="gantt-toolbar">
			<div class="flex items-center gap-3">
				<div class="flex items-center rounded-lg bg-muted/40 p-0.5">
					<button
						@click="setViewMode('nested')"
						class="px-3 py-1 text-[11px] font-medium rounded-md transition-all"
						:class="viewMode === 'nested' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
					>Nested</button>
					<button
						@click="setViewMode('flat')"
						class="px-3 py-1 text-[11px] font-medium rounded-md transition-all"
						:class="viewMode === 'flat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
					>Flat</button>
				</div>
				<!-- Type filters -->
				<div class="flex items-center gap-1 ml-1">
					<button
						v-for="filter in typeFilterOptions"
						:key="filter.key"
						class="gantt-type-filter"
						:class="activeTypeFilters.has(filter.key) ? filter.activeBg : 'bg-transparent hover:bg-muted/30'"
						@click="toggleTypeFilter(filter.key)"
					>
						<Icon :name="filter.icon" class="w-3 h-3" :class="activeTypeFilters.has(filter.key) ? filter.color : 'text-muted-foreground/50'" />
						<span :class="activeTypeFilters.has(filter.key) ? filter.color : 'text-muted-foreground/50'">{{ filter.label }}</span>
						<span
							v-if="typeCounts[filter.key]"
							class="gantt-type-count"
							:class="activeTypeFilters.has(filter.key) ? filter.bg : 'bg-muted/40'"
						>{{ typeCounts[filter.key] }}</span>
					</button>
				</div>
			</div>
			<div class="flex items-center gap-1">
				<Icon v-if="loading" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin text-primary mr-1" />
				<UTooltip :text="showSidebar ? 'Hide sidebar' : 'Show sidebar'" :popper="{ placement: 'bottom' }">
					<button @click="toggleSidebar" class="gantt-ctrl-btn" :class="showSidebar ? 'bg-primary/10 text-primary' : ''">
						<Icon name="lucide:panel-left" class="w-3.5 h-3.5" />
					</button>
				</UTooltip>
				<button @click="handleZoomOut" class="gantt-ctrl-btn" :disabled="zoom <= 1"><Icon name="lucide:minus" class="w-3.5 h-3.5" /></button>
				<button @click="scrollToToday" class="px-2 h-7 rounded-lg text-[10px] font-medium text-muted-foreground hover:bg-muted/50 transition-colors">Today</button>
				<button @click="handleZoomIn" class="gantt-ctrl-btn" :disabled="zoom >= 5"><Icon name="lucide:plus" class="w-3.5 h-3.5" /></button>
				<button @click="fetchAllData" class="gantt-ctrl-btn ml-1"><Icon :name="loading ? 'lucide:loader-2' : 'lucide:refresh-cw'" class="w-3.5 h-3.5" :class="loading ? 'animate-spin' : ''" /></button>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="loading && projects.length === 0" class="flex items-center justify-center min-h-[300px]">
			<div class="flex flex-col items-center gap-3">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
				<span class="text-xs text-muted-foreground">Loading timeline...</span>
			</div>
		</div>

		<!-- Error -->
		<div v-else-if="error" class="flex items-center justify-center min-h-[300px]">
			<div class="text-center">
				<p class="text-sm text-destructive">{{ error }}</p>
				<button class="mt-2 text-xs text-muted-foreground hover:text-foreground" @click="fetchAllData">Try again</button>
			</div>
		</div>

		<!-- Empty: no projects at all -->
		<div v-else-if="projects.length === 0 && !loading" class="flex items-center justify-center min-h-[300px]">
			<div class="text-center max-w-sm">
				<Icon name="lucide:gantt-chart" class="h-14 w-14 text-muted-foreground/25 mx-auto mb-4" />
				<p class="text-base font-medium text-foreground">No projects on the timeline</p>
				<p class="text-sm text-muted-foreground mt-1.5">
					{{ selectedClient ? 'No projects for this client yet.' : 'Create your first project to see it here.' }}
				</p>
			</div>
		</div>

		<!-- Empty: projects exist but all filtered out -->
		<div v-else-if="filteredRows.length === 0 && !loading" class="flex items-center justify-center min-h-[300px]">
			<div class="text-center max-w-sm">
				<Icon name="lucide:filter-x" class="h-14 w-14 text-muted-foreground/25 mx-auto mb-4" />
				<p class="text-base font-medium text-foreground">No items match your filters</p>
				<p class="text-sm text-muted-foreground mt-1.5">Try adjusting the type filters above.</p>
			</div>
		</div>

		<!-- Gantt body -->
		<div v-else class="gantt-body relative">
			<!-- Loading overlay (shown when refreshing with existing data) -->
			<Transition name="fade">
				<div v-if="loading && filteredRows.length > 0" class="absolute inset-0 bg-background/60 z-30 flex items-center justify-center backdrop-blur-[1px]">
					<div class="flex flex-col items-center gap-2">
						<div class="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
						<span class="text-[10px] text-muted-foreground">Updating...</span>
					</div>
				</div>
			</Transition>

			<!-- Left sidebar (toggleable) -->
			<div v-if="showSidebar" class="gantt-sidebar">
				<!-- Sidebar header -->
				<div class="gantt-sidebar-header">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</span>
				</div>
				<!-- Sidebar rows -->
				<div ref="sidebarScroll" class="gantt-sidebar-rows">
					<div
						v-for="row in filteredRows"
						:key="'side-' + row.id"
						class="gantt-sidebar-row"
						:class="{
							'gantt-sidebar-row-project': row.type === 'project',
							'gantt-sidebar-row-child': row.depth > 0,
						}"
						:style="{ paddingLeft: `${12 + row.depth * 20}px` }"
						@click="handleRowClick(row)"
					>
						<!-- Left color bar for nested children -->
						<span
							v-if="row.depth > 0"
							class="gantt-sidebar-color-bar"
							:style="{ backgroundColor: row.color }"
						/>

						<!-- Expand/collapse for projects -->
						<button
							v-if="row.hasChildren && row.type === 'project' && row.id !== 'tasks-section'"
							class="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
							@click.stop="toggleProject(row.id)"
						>
							<Icon :name="row.expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="w-3 h-3" />
						</button>
						<span v-else-if="row.type === 'project' && !row.hasChildren" class="w-4 shrink-0" />

						<!-- Type icon with tooltip -->
						<UTooltip
							:text="row.type === 'project' ? 'Project' : row.type === 'event' ? 'Event' : row.type === 'ticket' ? 'Ticket' : 'Task'"
							:popper="{ placement: 'right', offsetDistance: 6 }"
						>
							<span
								class="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
								:class="{
									'bg-primary/10': row.type === 'project',
									'bg-cyan-500/10': row.type === 'event',
									'bg-amber-500/10': row.type === 'ticket',
									'bg-purple-500/10': row.type === 'task',
								}"
							>
								<Icon
									:name="row.type === 'project' ? 'lucide:folder' : row.type === 'event' ? 'lucide:calendar' : row.type === 'ticket' ? 'lucide:ticket' : 'lucide:check-square'"
									class="w-3 h-3"
									:class="{
										'text-primary': row.type === 'project',
										'text-cyan-500': row.type === 'event',
										'text-amber-500': row.type === 'ticket',
										'text-purple-500': row.type === 'task',
									}"
								/>
							</span>
						</UTooltip>

						<!-- Service color dot with tooltip (projects only) -->
						<UTooltip
							v-if="row.type === 'project' && row.id !== 'tasks-section'"
							:text="getProjectServiceName(row.id)"
							:popper="{ placement: 'right', offsetDistance: 6 }"
						>
							<span
								class="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-border/30"
								:style="{ backgroundColor: row.color }"
							/>
						</UTooltip>

						<!-- Label -->
						<span
							class="text-[11px] truncate flex-1 cursor-pointer"
							:class="row.type === 'project' ? 'font-semibold text-foreground' : 'text-foreground/80'"
							:title="row.label"
						>
							{{ row.label }}
						</span>

						<!-- Status pill -->
						<span
							v-if="row.status"
							class="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
							:class="{
								'text-green-500 bg-green-500/10': row.status?.toLowerCase().replace(/\s+/g, '') === 'completed' || row.status?.toLowerCase() === 'done',
								'text-blue-500 bg-blue-500/10': row.status?.toLowerCase().replace(/\s+/g, '') === 'inprogress' || row.status?.toLowerCase() === 'active',
								'text-amber-500 bg-amber-500/10': row.status?.toLowerCase() === 'scheduled' || row.status?.toLowerCase() === 'pending',
								'text-muted-foreground bg-muted/40': !['completed', 'done', 'inprogress', 'active', 'scheduled', 'pending'].includes(row.status?.toLowerCase().replace(/\s+/g, '') || ''),
							}"
						>
							{{ row.status }}
						</span>
					</div>
				</div>
			</div>

			<!-- Right chart area -->
			<div ref="scrollContainer" class="gantt-chart" @scroll="syncScroll">
				<!-- Chart header (month labels) -->
				<div class="gantt-chart-header" :style="{ width: chartWidth + 'px' }">
					<div
						v-for="label in monthLabels"
						:key="label.text"
						class="gantt-month-label"
						:class="{ 'gantt-month-current': label.isCurrentMonth }"
						:style="{ left: label.x + 'px', width: label.width + 'px' }"
					>
						{{ label.text }}
					</div>
				</div>

				<!-- Chart rows -->
				<div class="gantt-chart-rows" :style="{ width: chartWidth + 'px', height: (filteredRows.length * ROW_HEIGHT) + 'px' }">
					<!-- Grid lines (per month) -->
					<div
						v-for="label in monthLabels"
						:key="'grid-' + label.text"
						class="gantt-grid-line"
						:style="{ left: label.x + 'px' }"
					/>

					<!-- Today line -->
					<div class="gantt-today" :style="{ left: todayX + 'px' }">
						<div class="gantt-today-label">Today</div>
						<div class="gantt-today-line" />
					</div>

					<!-- Row stripes + bars -->
					<div
						v-for="(row, i) in filteredRows"
						:key="'row-' + row.id"
						class="gantt-row"
						:class="{ 'gantt-row-alt': i % 2 === 1, 'gantt-row-project': row.type === 'project' }"
						:style="{ top: (i * ROW_HEIGHT) + 'px', height: ROW_HEIGHT + 'px' }"
					>
						<!-- Inline label (shown when sidebar is hidden) -->
						<span
							v-if="!showSidebar && hasBar(row)"
							class="gantt-inline-label"
							:style="{ left: getBarStyle(row).left }"
						>
							<button
								v-if="row.hasChildren && row.type === 'project'"
								class="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
								@click.stop="toggleProject(row.id)"
							>
								<Icon :name="row.expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="w-2.5 h-2.5" />
							</button>
							<Icon
								:name="row.type === 'project' ? 'lucide:folder' : row.type === 'event' ? 'lucide:calendar' : row.type === 'ticket' ? 'lucide:ticket' : 'lucide:check-square'"
								class="w-3 h-3 shrink-0"
								:class="{
									'text-primary': row.type === 'project',
									'text-cyan-500': row.type === 'event',
									'text-amber-500': row.type === 'ticket',
									'text-purple-500': row.type === 'task',
								}"
							/>
							<span
								class="truncate"
								:class="row.type === 'project' ? 'font-semibold text-[13px]' : 'text-[11px]'"
							>{{ row.label }}</span>
							<span
								class="w-1.5 h-1.5 rounded-full shrink-0"
								:style="{ backgroundColor: statusColor(row.status) }"
							/>
						</span>

						<!-- Bar -->
						<UTooltip
							v-if="hasBar(row)"
							:text="`${row.label}${row.status ? ' — ' + statusLabel(row.status) : ''}${row.startDate ? ' · ' + getFriendlyDateTwo(row.startDate) : ''}${row.endDate && row.endDate !== row.startDate ? ' → ' + getFriendlyDateTwo(row.endDate) : ''}`"
							:popper="{ placement: 'top', offsetDistance: 4 }"
						>
							<div
								class="gantt-bar"
								:class="[
									`gantt-bar-${row.type}`,
									{ 'gantt-bar-completed': row.status?.toLowerCase().replace(/\s+/g, '') === 'completed' },
								]"
								:style="{ ...getBarStyle(row), backgroundColor: row.color, borderLeft: `3px solid ${statusColor(row.status)}` }"
								@click="handleRowClick(row)"
							>
								<span class="gantt-bar-label">{{ row.label }}</span>
							</div>
						</UTooltip>

						<!-- Due date diamond for items with only a due date -->
						<div
							v-if="!row.startDate && !row.endDate && row.dueDate"
							class="gantt-milestone"
							:style="{ left: dateToX(row.dueDate) + 'px' }"
							:title="`Due: ${new Date(row.dueDate).toLocaleDateString()}`"
						>
							<div class="gantt-diamond" :style="{ backgroundColor: row.color }" />
						</div>
					</div>

				</div>
			</div>
		</div>

		<!-- Event Detail Modal -->
		<UModal v-model="showEventDetail" class="sm:max-w-xl">
			<template #header>
				<div class="flex items-center justify-between w-full">
					<div class="flex items-center gap-2">
						<span v-if="selectedEventProject" class="inline-block h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: selectedEventProject.color }" />
						<h3 class="t-label">Event Detail</h3>
					</div>
					<Button variant="ghost" size="icon-sm" @click="handleCloseDetail">
						<Icon name="i-heroicons-x-mark" class="h-4 w-4" />
					</Button>
				</div>
			</template>
			<div class="max-h-[70vh] overflow-y-auto px-4 pb-4">
				<ProjectTimelineEventDetail
					v-if="selectedEvent && selectedEventProject"
					:event="selectedEvent"
					:project="selectedEventProject"
					@close="handleCloseDetail"
					@updated="fetchAllData"
				/>
			</div>
		</UModal>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.gantt-container {
	border: 1px solid hsl(var(--border) / 0.5);
	border-radius: 12px;
	overflow: hidden;
	background: hsl(var(--background));
}

.gantt-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 16px;
	border-bottom: 1px solid hsl(var(--border) / 0.4);
	background: hsl(var(--muted) / 0.15);
}

.gantt-ctrl-btn {
	width: 28px;
	height: 28px;
	border-radius: 8px;
	display: flex;
	align-items: center;
	justify-content: center;
	color: hsl(var(--muted-foreground));
	transition: all 0.15s;
}
.gantt-ctrl-btn:hover { background: hsl(var(--muted) / 0.5); }
.gantt-ctrl-btn:disabled { opacity: 0.3; }

.gantt-type-filter {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 3px 8px;
	border-radius: 8px;
	font-size: 10px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	user-select: none;
}

.gantt-type-count {
	font-size: 9px;
	font-weight: 700;
	min-width: 16px;
	height: 16px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 999px;
	padding: 0 4px;
}

/* ── Body: sidebar + chart ── */
.gantt-body {
	display: flex;
	max-height: calc(100vh - 240px);
	overflow: hidden;
}

/* ── Sidebar ── */
.gantt-sidebar {
	width: 280px;
	min-width: 280px;
	border-right: 1px solid hsl(var(--border) / 0.4);
	display: flex;
	flex-direction: column;
	background: hsl(var(--background));
}

.gantt-sidebar-header {
	height: 48px;
	display: flex;
	align-items: center;
	padding: 0 16px;
	border-bottom: 1px solid hsl(var(--border) / 0.4);
	background: hsl(var(--muted) / 0.1);
}

.gantt-sidebar-rows {
	flex: 1;
	overflow-y: auto;
	overflow-x: hidden;
	scrollbar-width: none;
}
.gantt-sidebar-rows::-webkit-scrollbar { display: none; }

.gantt-sidebar-row {
	height: 36px;
	display: flex;
	align-items: center;
	gap: 6px;
	padding-right: 12px;
	border-bottom: 1px solid hsl(var(--border) / 0.1);
	cursor: default;
	transition: background 0.1s;
	position: relative;
}
.gantt-sidebar-row:hover { background: hsl(var(--muted) / 0.15); }

.gantt-sidebar-row-project {
	background: hsl(var(--muted) / 0.06);
}

.gantt-sidebar-row-child {
	background: transparent;
}

.gantt-sidebar-color-bar {
	position: absolute;
	left: 0;
	top: 4px;
	bottom: 4px;
	width: 2px;
	border-radius: 1px;
	opacity: 0.5;
}

/* ── Chart area ── */
.gantt-chart {
	flex: 1;
	overflow: auto;
	position: relative;
}

.gantt-chart-header {
	position: sticky;
	top: 0;
	z-index: 10;
	height: 48px;
	background: hsl(var(--muted) / 0.1);
	border-bottom: 1px solid hsl(var(--border) / 0.4);
}

.gantt-month-label {
	position: absolute;
	top: 0;
	height: 48px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.04em;
	color: hsl(var(--muted-foreground));
	border-right: 1px solid hsl(var(--border) / 0.2);
	user-select: none;
}

.gantt-month-current {
	color: hsl(var(--primary));
	background: hsl(var(--primary) / 0.04);
}

.gantt-chart-rows {
	position: relative;
	min-height: 100%;
}

.gantt-grid-line {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 1px;
	background: hsl(var(--border) / 0.08);
	pointer-events: none;
}

/* ── Today marker ── */
.gantt-today {
	position: absolute;
	top: 0;
	bottom: 0;
	z-index: 5;
	pointer-events: none;
}

.gantt-today-label {
	position: absolute;
	top: -44px;
	left: 50%;
	transform: translateX(-50%);
	font-size: 8px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: hsl(var(--primary));
	background: hsl(var(--primary) / 0.08);
	padding: 2px 8px;
	border-radius: 999px;
	white-space: nowrap;
}

.gantt-today-line {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	width: 1px;
	background: hsl(var(--primary));
	opacity: 0.35;
}

/* ── Rows ── */
.gantt-row {
	position: absolute;
	left: 0;
	right: 0;
	border-bottom: 1px solid hsl(var(--border) / 0.06);
	transition: background 0.1s;
}
.gantt-row:hover { background: hsl(var(--muted) / 0.12); }
.gantt-row-alt { background: hsl(var(--muted) / 0.02); }
.gantt-row-project { background: hsl(var(--muted) / 0.05); }

/* ── Inline labels (when sidebar is hidden) ── */
.gantt-inline-label {
	position: absolute;
	top: 50%;
	transform: translate(-100%, -50%) translateX(-8px);
	display: flex;
	align-items: center;
	gap: 4px;
	max-width: 200px;
	white-space: nowrap;
	color: hsl(var(--foreground) / 0.85);
	pointer-events: auto;
	z-index: 3;
}

/* ── Fade transition ── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── Bars ── */
.gantt-bar {
	position: absolute;
	top: 50%;
	transform: translateY(-50%);
	height: 20px;
	border-radius: 0 999px 999px 0;
	display: flex;
	align-items: center;
	padding: 0 10px;
	cursor: pointer;
	opacity: 0.8;
	transition: opacity 0.15s;
	overflow: hidden;
	min-width: 8px;
	box-shadow: inset 0 1px 0 rgba(255,255,255,0.15);
}
.gantt-bar:hover {
	opacity: 1;
	z-index: 2;
}

.gantt-bar-project {
	height: 24px;
	font-weight: 600;
	opacity: 0.9;
	border-radius: 0 6px 6px 0;
}

.gantt-bar-event {
	height: 18px;
	opacity: 0.75;
}

.gantt-bar-ticket {
	height: 16px;
	opacity: 0.7;
	border-radius: 0 4px 4px 0;
}

.gantt-bar-task {
	height: 14px;
	opacity: 0.65;
	border-radius: 0 4px 4px 0;
}

.gantt-bar-completed {
	opacity: 0.3;
}

.gantt-bar-label {
	font-size: 10px;
	font-weight: 600;
	color: white;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	text-shadow: 0 1px 2px rgba(0,0,0,0.15);
}

/* ── Milestones (diamond) ── */
.gantt-milestone {
	position: absolute;
	top: 50%;
	transform: translate(-50%, -50%);
	z-index: 2;
}

.gantt-diamond {
	width: 10px;
	height: 10px;
	transform: rotate(45deg);
	border-radius: 2px;
	opacity: 0.8;
}

</style>

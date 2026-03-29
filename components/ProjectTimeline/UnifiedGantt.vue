<script setup lang="ts">
/**
 * UnifiedGantt — Unified Gantt chart showing:
 *   - Project lanes with events (bar-based)
 *   - Ticket swimlanes (nested under projects or flat)
 *   - Quick task swimlane ("My Tasks")
 *
 * Supports two view modes: nested (default) and flat, togglable.
 * Wraps and extends the existing ProjectTimeline system.
 */

import type { ProjectWithRelations, ProjectEventWithRelations } from '~/types/projects';

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

const { projects, loading: projectsLoading, error, refresh, fetchProjects } = useProjectTimeline();

const zoom = ref(1.5);
const selectedEventId = ref<string | null>(null);
const showEventDetail = ref(false);
const scrollContainer = ref<HTMLElement | null>(null);
const expandedProjects = ref<Set<string>>(new Set());

const layout = useTimelineLayout(projects, zoom);

// ── Data fetching ──
const { user: authUser } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { selectedClient } = useClients();

const loading = computed(() => projectsLoading.value || unifiedLoading.value);

async function fetchAllData() {
	await Promise.all([fetchProjects(), fetchAll()]);
}

watch([selectedOrg, selectedClient], () => {
	fetchAllData();
});

watch(
	() => authUser.value?.id,
	(newId) => {
		if (newId && projects.value.length === 0 && !loading.value) {
			fetchAllData();
		}
	},
	{ immediate: true },
);

onMounted(() => {
	if (authUser.value?.id) fetchAllData();
});

// ── Scroll to today ──
function scrollToToday() {
	nextTick(() => {
		if (!scrollContainer.value) return;
		const todayPos = layout.todayX.value;
		const containerWidth = scrollContainer.value.clientWidth;
		scrollContainer.value.scrollLeft = Math.max(0, todayPos - containerWidth / 3);
	});
}

watch(
	() => projects.value.length,
	(len) => { if (len > 0) scrollToToday(); },
);

// ── Event selection ──
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

function handleEventClick(eventId: string) {
	selectedEventId.value = eventId;
	showEventDetail.value = true;
}

function handleCloseDetail() {
	showEventDetail.value = false;
	selectedEventId.value = null;
}

// ── Zoom ──
function handleZoomIn() { zoom.value = Math.min(zoom.value + 0.25, 3); }
function handleZoomOut() { zoom.value = Math.max(zoom.value - 0.25, 1.5); }
function handleZoomReset() { zoom.value = 1.5; }

// ── Expand/collapse project rows ──
function toggleProjectExpand(projectId: string) {
	const s = new Set(expandedProjects.value);
	if (s.has(projectId)) s.delete(projectId);
	else s.add(projectId);
	expandedProjects.value = s;
}

// ── Computed: ticket count per project ──
function getProjectTicketCount(projectId: string): number {
	return ticketsByProject.value.get(projectId)?.length || 0;
}
</script>

<template>
	<div class="unified-gantt relative">
		<!-- Toolbar -->
		<div class="flex items-center justify-between px-4 py-3 border-b border-border/40">
			<div class="flex items-center gap-3">
				<h2 class="text-sm font-semibold t-title">Timeline</h2>

				<!-- View mode toggle -->
				<div class="flex items-center rounded-lg bg-muted/40 p-0.5">
					<button
						@click="setViewMode('nested')"
						class="px-3 py-1 text-[11px] font-medium rounded-md transition-all duration-200"
						:class="viewMode === 'nested' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
					>
						Nested
					</button>
					<button
						@click="setViewMode('flat')"
						class="px-3 py-1 text-[11px] font-medium rounded-md transition-all duration-200"
						:class="viewMode === 'flat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
					>
						Flat
					</button>
				</div>
			</div>

			<!-- Zoom controls -->
			<div class="flex items-center gap-1">
				<button
					v-if="loading"
					class="px-2 py-1 text-[10px] text-muted-foreground"
				>
					Loading...
				</button>
				<button
					@click="handleZoomOut"
					class="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/50 text-muted-foreground transition-colors"
					:disabled="zoom <= 1.5"
				>
					<Icon name="lucide:minus" class="w-3.5 h-3.5" />
				</button>
				<button
					@click="handleZoomReset"
					class="px-2 h-7 rounded-lg text-[10px] font-mono text-muted-foreground hover:bg-muted/50 transition-colors"
				>
					{{ Math.round(zoom * 100) }}%
				</button>
				<button
					@click="handleZoomIn"
					class="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/50 text-muted-foreground transition-colors"
					:disabled="zoom >= 3"
				>
					<Icon name="lucide:plus" class="w-3.5 h-3.5" />
				</button>
				<button
					@click="fetchAllData"
					class="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/50 text-muted-foreground transition-colors ml-1"
				>
					<Icon name="lucide:refresh-cw" class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>

		<!-- Loading state -->
		<div v-if="loading && projects.length === 0" class="flex items-center justify-center min-h-[400px]">
			<div class="flex flex-col items-center gap-3">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
				<span class="text-xs text-muted-foreground">Loading timeline...</span>
			</div>
		</div>

		<!-- Error state -->
		<div v-else-if="error" class="flex items-center justify-center min-h-[400px]">
			<div class="text-center">
				<p class="text-sm text-destructive">{{ error }}</p>
				<button class="mt-2 text-xs text-muted-foreground hover:text-foreground" @click="fetchAllData">
					Try again
				</button>
			</div>
		</div>

		<!-- Empty state -->
		<div v-else-if="projects.length === 0 && !loading" class="flex items-center justify-center min-h-[400px]">
			<div class="text-center">
				<Icon name="lucide:gantt-chart" class="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
				<p class="text-sm text-muted-foreground">No projects on the timeline yet</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Create a project to see it here</p>
			</div>
		</div>

		<!-- Timeline content -->
		<div v-else ref="scrollContainer" class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
			<!-- Existing project timeline canvas -->
			<ProjectTimelineCanvas
				:projects="projects"
				:layout="layout"
				:zoom="zoom"
				:selected-event-id="selectedEventId"
				@event-click="handleEventClick"
			/>

			<!-- Ticket + Task swimlanes (below the canvas) -->
			<div class="px-4 pb-6 space-y-4 mt-4">
				<!-- NESTED VIEW: Tickets and tasks grouped under each project -->
				<template v-if="viewMode === 'nested'">
					<div
						v-for="project in projects"
						:key="project.id"
						class="space-y-1"
					>
						<!-- Project ticket count badge (clickable to expand) -->
						<button
							v-if="getProjectTicketCount(project.id) > 0"
							@click="toggleProjectExpand(project.id)"
							class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted/30 transition-colors text-left w-full"
						>
							<span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: project.color || '#888' }" />
							<span class="text-xs font-medium text-foreground truncate">{{ project.title }}</span>
							<span class="text-[10px] text-muted-foreground ml-auto">
								{{ getProjectTicketCount(project.id) }} ticket{{ getProjectTicketCount(project.id) !== 1 ? 's' : '' }}
							</span>
							<Icon
								:name="expandedProjects.has(project.id) ? 'lucide:chevron-down' : 'lucide:chevron-right'"
								class="w-3 h-3 text-muted-foreground shrink-0"
							/>
						</button>

						<!-- Expanded tickets list -->
						<div v-if="expandedProjects.has(project.id)" class="pl-6 space-y-1">
							<div
								v-for="ticket in ticketsByProject.get(project.id) || []"
								:key="ticket.id"
								class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/30"
							>
								<Icon name="heroicons:queue-list" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
								<NuxtLink :to="`/tickets/${ticket.id}`" class="text-xs font-medium text-foreground hover:text-primary truncate flex-1">
									{{ ticket.title }}
								</NuxtLink>
								<span
									class="text-[10px] px-1.5 py-0.5 rounded-full"
									:class="{
										'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': ticket.status === 'Completed',
										'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': ticket.status === 'In Progress',
										'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': ticket.status === 'Scheduled',
										'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': ticket.status === 'Pending',
									}"
								>
									{{ ticket.status }}
								</span>
								<span v-if="ticket.due_date" class="text-[10px] text-muted-foreground">
									{{ new Date(ticket.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
								</span>
							</div>
						</div>
					</div>
				</template>

				<!-- FLAT VIEW: Separate swimlanes -->
				<template v-else>
					<!-- Tickets swimlane -->
					<div v-if="timelineData.tickets.length > 0" class="space-y-1">
						<h3 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
							Tickets
						</h3>
						<div class="space-y-1">
							<div
								v-for="ticket in timelineData.tickets"
								:key="ticket.id"
								class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/30"
							>
								<Icon name="heroicons:queue-list" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
								<NuxtLink :to="`/tickets/${ticket.id}`" class="text-xs font-medium text-foreground hover:text-primary truncate flex-1">
									{{ ticket.title }}
								</NuxtLink>
								<span
									class="text-[10px] px-1.5 py-0.5 rounded-full"
									:class="{
										'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': ticket.status === 'Completed',
										'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': ticket.status === 'In Progress',
										'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': ticket.status === 'Scheduled',
										'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': ticket.status === 'Pending',
									}"
								>
									{{ ticket.status }}
								</span>
							</div>
						</div>
					</div>
				</template>

				<!-- My Tasks swimlane (both views) -->
				<div v-if="personalTasks.length > 0" class="space-y-1">
					<h3 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
						My Tasks
					</h3>
					<div class="space-y-1">
						<div
							v-for="task in personalTasks"
							:key="task.id"
							class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/30"
						>
							<div
								class="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
								:class="task.completed ? 'border-primary bg-primary' : 'border-muted-foreground/30'"
							>
								<Icon v-if="task.completed" name="lucide:check" class="w-2.5 h-2.5 text-primary-foreground" />
							</div>
							<span
								class="text-xs font-medium flex-1 truncate"
								:class="task.completed ? 'text-muted-foreground line-through' : 'text-foreground'"
							>
								{{ task.title }}
							</span>
							<span v-if="task.due_date" class="text-[10px] text-muted-foreground">
								{{ new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
							</span>
							<span
								v-if="task.priority && task.priority !== 'low'"
								class="text-[9px] px-1.5 py-0.5 rounded-full"
								:class="{
									'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': task.priority === 'urgent',
									'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400': task.priority === 'high',
									'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': task.priority === 'medium',
								}"
							>
								{{ task.priority }}
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Legend -->
			<ProjectTimelineLegend :projects="projects" />
		</div>

		<!-- Event Detail Modal -->
		<UModal v-model="showEventDetail" class="sm:max-w-xl">
			<template #header>
				<div class="flex items-center justify-between w-full">
					<div class="flex items-center gap-2">
						<span
							v-if="selectedEventProject"
							class="inline-block h-2.5 w-2.5 rounded-full"
							:style="{ backgroundColor: selectedEventProject.color }"
						/>
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

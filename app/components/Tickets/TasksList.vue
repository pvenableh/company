<template>
	<div class="task-list-container">
		<ClientOnly>
			<transition name="fade">
				<div
					v-if="isLoading"
					class="absolute inset-0 bg-white/70 dark:bg-gray-800/70 z-50 flex items-center justify-center"
				>
					<LayoutLoader text="Loading Tasks" />
				</div>
			</transition>
		</ClientOnly>

		<ClientOnly>
			<transition name="fade">
				<div v-if="!isConnected && !isLoading && hasEverConnected" class="mb-4 absolute right-0 top-0 connection-alert">
					<EAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
						<template #footer>
							<EButton size="sm" color="yellow" @click="refreshTasks">Retry Connection</EButton>
						</template>
					</EAlert>
				</div>
			</transition>
		</ClientOnly>

		<div v-if="!isLoading" class="space-y-2">
			<!-- Toolbar: view switch (River / Board / List) + task filter.
			     All three views share the same realtime `filteredTasks`. -->
			<div class="flex justify-between items-center mb-3 gap-3 flex-wrap">
				<ETabs
					v-model="viewMode"
					:items="viewTabs"
					class="w-fit"
				/>
				<div class="flex items-center gap-2">
					<h3 class="text-xs font-bold uppercase tracking-wide whitespace-nowrap">
						{{ filteredTasks.length }}{{ totalTaskCount > limit ? '+' : '' }} tasks
					</h3>
					<ESelectMenu
						v-model="activeFilter"
						:options="[
							{ label: 'All Tasks', value: 'all' },
							{ label: 'Active Tasks', value: 'active' },
							{ label: 'Completed Tasks', value: 'completed' },
							{ label: 'Due Today', value: 'today' },
							{ label: 'Overdue', value: 'overdue' },
						]"
						value-attribute="value"
						option-attribute="label"
						size="xs"
						class="w-40"
						@update:modelValue="applyFilter($event)"
					/>
				</div>
			</div>

			<div v-if="debug" class="bg-muted p-2 rounded-lg mb-3 text-xs">
				<div>
					<strong>Org ID:</strong>
					{{ effectiveOrgId }}
				</div>
				<div>
					<strong>Team ID:</strong>
					{{ effectiveTeamId }}
				</div>
				<div>
					<strong>Filter:</strong>
					{{ activeFilter }}
				</div>
				<div>
					<strong>Tasks:</strong>
					{{ tasks.length }} (Filtered: {{ filteredTasks.length }})
				</div>
			</div>

			<!-- ── River view — workload rhythm. Mirrors the active filter so
			     e.g. "Overdue" shows only red leaves. Handles its own empty. -->
			<div v-if="viewMode === 'river'" class="glass-surface p-3 sm:p-4">
				<div class="flex items-center justify-between mb-2 flex-wrap gap-2">
					<h4 class="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
						Workload river
					</h4>
					<div class="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground">
						<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(0 78% 55%)" />overdue</span>
						<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(40 75% 55%)" />in progress</span>
						<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(210 60% 55%)" />new</span>
						<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(145 60% 50%); opacity: 0.6" />done</span>
					</div>
				</div>
				<RiverChart
					:items="tasksRiverItems"
					:days-back="7"
					:days-forward="21"
					:hour-height="14"
					:hide-hours="true"
					:accent-hue="210"
					empty-title="No dated tasks in this window."
					empty-subtitle="Add due dates to surface workload rhythm."
					@select="onTaskLeafSelect"
				/>
			</div>

			<!-- Empty state (board / list only — river shows its own) -->
			<div v-else-if="filteredTasks.length === 0" class="p-8 text-center text-muted-foreground">
				<EIcon name="i-heroicons-document-text" class="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
				<p class="text-sm">No tasks found</p>
				<p class="text-xs text-muted-foreground mt-2">Try changing your filters or create new tasks in your tickets</p>
			</div>

			<!-- ── Board view — kanban, same realtime task set ────────────── -->
			<div v-else-if="viewMode === 'board'" class="ios-card overflow-hidden">
				<TicketsTasksKanban
					:tasks="filteredTasks"
					:updating-tasks="updatingTasks"
					@update-status="updateTaskStatus"
					@toggle="toggleTaskStatus"
					@open-ticket="navigateToTicket"
				/>
			</div>

			<!-- ── List view — flat checklist ─────────────────────────────── -->
			<div v-else>
				<div v-for="task in filteredTasks" :key="task.id" class="task-item">
					<div class="flex items-center space-x-3 group bg-card p-2 rounded-lg shadow-sm">
						<div
							v-if="updatingTasks.has(task.id)"
							class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 rounded-lg flex items-center justify-center z-10"
						>
							<EIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" />
						</div>

						<ECheckbox :model-value="task.status === 'completed'" @update:model-value="toggleTaskStatus(task.id)" />

						<div class="flex-1">
							<div
								:class="{ 'line-through text-gray-400': task.status === 'completed' }"
								class="text-xs leading-4 inline-block"
								v-html="task.description"
							></div>

							<div class="text-[10px] text-muted-foreground uppercase mt-1 flex items-center flex-wrap">
								<span class="mr-2 inline-flex items-center">
									<EIcon name="i-heroicons-document-text" class="w-3 h-3 mr-1" />
									<EButton
										size="xs"
										variant="link"
										color="gray"
										class="!p-0 underline hover:text-blue-500"
										@click="navigateToTicket(task.ticketContext.id)"
									>
										{{ task.ticketContext.title || 'Untitled Ticket' }}
									</EButton>
								</span>

								<span v-if="task.ticketContext.due_date" class="mr-2 inline-flex items-center">
									<EIcon name="i-heroicons-calendar" class="w-3 h-3 mr-1" />
									<span :class="{ 'text-destructive': isTaskOverdue(task) }">
										{{ getFriendlyDateTwo(task.ticketContext.due_date) }}
									</span>
								</span>

								<EBadge size="xs" :color="getStatusColor(task.ticketContext.status)" class="uppercase !text-[9px]">
									{{ task.ticketContext.status }}
								</EBadge>
							</div>

							<div
								v-if="task.status === 'completed' && task.date_updated"
								class="text-[10px] text-muted-foreground mt-0.5 uppercase"
							>
								Completed {{ formatCompletionDate(task.date_updated) }}
								{{ task.user_updated ? `by ${task.user_updated.first_name}` : '' }}
							</div>
						</div>
					</div>
				</div>

				<div v-if="totalTaskCount > limit && filteredTasks.length < totalTaskCount" class="text-center mt-4">
					<EButton size="sm" color="gray" variant="soft" @click="loadMore">
						Load More Tasks ({{ filteredTasks.length }} of {{ totalTaskCount }})
					</EButton>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	organizationId: {
		type: String,
		default: null,
	},
	teamId: {
		type: String,
		default: null,
	},
	projectId: {
		type: String,
		default: null,
	},
	userId: {
		type: String,
		default: null,
	},
	// LOCAL client filter (sentinel: null | 'org' | UUID). Filters the parent
	// tickets by their `client` relation.
	clientId: {
		type: String,
		default: null,
	},
	limit: {
		type: Number,
		default: 20,
	},
	// Add debug prop to help with troubleshooting
	debug: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['stats-update']);

const totalTaskCount = ref(0);
const currentLimit = ref(props.limit);
const activeFilter = ref('all');

// View switch — River (workload rhythm), Board (kanban), or List (flat).
// All three render from the same realtime `filteredTasks`, so switching is
// instant and stays live. Persisted per-user so the choice sticks.
const viewMode = useCookie('tasks-view-mode', { default: () => 'board' });
const viewTabs = [
	{ key: 'river', label: 'River' },
	{ key: 'board', label: 'Board' },
	{ key: 'list', label: 'List' },
];

// Get global context (these are now only used for reacting to changes)
const { selectedOrg } = useOrganization();
const { selectedTeam } = useTeams();

const ticketItems = useDirectusItems('tickets');

// Setup tasks list with the composable, passing initial filter params
const {
	tasks,
	isLoading,
	isConnected,
	error,
	lastUpdated,
	updatingTasks,
	totalCount,
	toggleTaskStatus,
	updateTaskStatus,
	navigateToTicket,
	refresh: refreshTasks, // Use the consistent name
	effectiveOrgId,
	effectiveTeamId,
	cleanup,
	updateParams,
} = useTasksList({
	organizationId: props.organizationId,
	teamId: props.teamId,
	projectId: props.projectId,
	userId: props.userId,
	clientId: props.clientId,
	limit: props.limit,
});

// Suppress "Connection Lost" alert until the websocket has connected at least
// once. Without this, a brief flash appears on first load before the realtime
// subscription opens — confusing for new signups.
const hasEverConnected = ref(false);
watch(isConnected, (val) => {
	if (val) hasEverConnected.value = true;
}, { immediate: true });

// Expose public methods and computed properties
defineExpose({
	refresh: refreshTasks, // Consistent naming
	tasks: computed(() => tasks.value),
	getTasks: () => tasks.value,
	filteredTasks: computed(() => filteredTasks.value),
	updateParentStats: () => {
		emit('stats-update', tasks.value);
	},
	effectiveOrgId,
	effectiveTeamId,
});

// Watch for changes in props and update composable params reactively
watch(
	() => ({
		organizationId: props.organizationId,
		teamId: props.teamId,
		projectId: props.projectId,
		userId: props.userId,
		clientId: props.clientId,
	}),
	(newParams) => {
		updateParams(newParams);
	},
	{ deep: true },
);

// Watch for changes in global organization and team
watch(
	[selectedOrg, selectedTeam],
	([newOrg, newTeam]) => {
		console.log('Global organization or team changed:', { org: newOrg, team: newTeam });
		// No need to refresh here, useTasksList handles it now
	},
	{ deep: true },
);

// Watch for tasks updates to emit stats
watch(
	tasks,
	(newTasks) => {
		console.log('Tasks updated in TasksList, emitting stats-update');
		emit('stats-update', newTasks);
	},
	{ deep: true },
);

// Emit stats after initial load
watch(
	isLoading,
	(loading) => {
		if (loading === false) {
			console.log('Tasks finished loading, emitting stats-update');
			nextTick(() => {
				emit('stats-update', tasks.value);
			});
		}
	},
	{ immediate: true },
);

// Apply filter (client-side only — no server refresh needed)
const applyFilter = (filterValue) => {
	console.log('Applying filter:', filterValue);
	activeFilter.value = filterValue;
};

// Filtered tasks based on active filter
const filteredTasks = computed(() => {
	console.log('Computing filtered tasks with filter:', activeFilter.value);
	console.log('Current tasks:', tasks.value?.length);

	if (!tasks.value || tasks.value.length === 0) return [];

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);

	let result = [];

	switch (activeFilter.value) {
		case 'active':
			result = tasks.value.filter((task) => task.status !== 'completed');
			break;

		case 'completed':
			result = tasks.value.filter((task) => task.status === 'completed');
			break;

		case 'today':
			result = tasks.value.filter((task) => {
				if (!task.ticketContext?.due_date) return false;
				const dueDate = new Date(task.ticketContext.due_date);
				dueDate.setHours(0, 0, 0, 0);
				return dueDate >= today && dueDate < tomorrow;
			});
			break;

		case 'overdue':
			result = tasks.value.filter((task) => {
				if (!task.ticketContext?.due_date) return false;
				const dueDate = new Date(task.ticketContext.due_date);
				dueDate.setHours(0, 0, 0, 0);
				return dueDate < today && task.status !== 'completed';
			});
			break;

		default: // 'all'
			result = tasks.value;
			break;
	}

	console.log('Filtered tasks result:', result.length);
	return result;
});

// ── Tasks river ────────────────────────────────────────────────
// Maps the same filteredTasks to RiverItems so the river reflects the
// active filter (Overdue → only red leaves; Completed → only faded
// green; etc.). Hue per state:
//   overdue (red 0)  ·  new (blue 210)  ·  in_progress (amber 40)
//   completed (green 145, faded via past=true).
// Window leans forward (7 back, 21 fwd) — surface upcoming workload.
function stripHtml(s) {
	if (!s) return '';
	return String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
function taskHue(task) {
	if (isTaskOverdue(task)) return 0;
	if (task.status === 'completed') return 145;
	if (task.status === 'in_progress') return 40;
	return 210;
}
function taskSat(task) {
	if (isTaskOverdue(task)) return 78;
	if (task.status === 'in_progress') return 75;
	return 60;
}
const tasksRiverItems = computed(() => {
	return (filteredTasks.value || [])
		.filter((t) => !!t?.ticketContext?.due_date)
		.map((t) => ({
			id: String(t.id),
			when: t.ticketContext.due_date,
			label: stripHtml(t.description).slice(0, 40) || (t.ticketContext.title || 'Task'),
			sublabel: t.ticketContext.title || undefined,
			hue: taskHue(t),
			sat: taskSat(t),
			icon: t.status === 'completed' ? 'lucide:check-square' : (isTaskOverdue(t) ? 'lucide:alert-octagon' : 'lucide:square'),
			past: t.status === 'completed',
			_raw: t,
		}));
});
function onTaskLeafSelect(item) {
	if (item?._raw?.ticketContext?.id) {
		navigateToTicket(item._raw.ticketContext.id);
	}
}

// Check if a task is overdue (uses isOverdue from utils/dates.ts for the date check)
const isTaskOverdue = (task) => {
	if (!task.ticketContext?.due_date) return false;
	return isOverdue(task.ticketContext.due_date) && task.status !== 'completed';
};

// Load more tasks
const loadMore = () => {
	currentLimit.value += props.limit;
	refreshTasks();
};

// getFriendlyDateTwo and formatDateTimeCompact are auto-imported from utils/dates.ts
const formatCompletionDate = (date) => formatDateTimeCompact(date);

const { getStatusColorName: getStatusColor } = useStatusStyle();

onMounted(() => {
	// Update total count when data changes
	watch(
		totalCount,
		(newCount) => {
			console.log('Total task count updated:', newCount);
			totalTaskCount.value = newCount;
		},
		{ immediate: true },
	);
});

onUnmounted(() => {
	cleanup();
});
</script>

<style scoped>
.task-list-container {
	position: relative;
	width: 100%;
}

.connection-alert {
	max-width: 300px;
	z-index: 100;
}

.task-item {
	position: relative;
	transition: all 0.2s ease;
	margin-bottom: 0.5rem;
}

.task-item:hover {
	transform: translateY(-1px);
	box-shadow:
		0 4px 6px -1px rgba(0, 0, 0, 0.1),
		0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* Animations */
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>

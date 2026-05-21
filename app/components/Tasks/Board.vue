<template>
	<div class="task-board">
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-3">
				<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
					{{ completedCount }}/{{ allTasksCount }} complete
				</span>
				<div v-if="allTasksCount" class="w-24 h-1.5 bg-muted/30 rounded-full overflow-hidden">
					<div
						class="h-full rounded-full transition-all duration-500"
						:class="progressPercent > 75 ? 'bg-success' : progressPercent > 25 ? 'bg-warning' : 'bg-primary'"
						:style="{ width: `${progressPercent}%` }"
					/>
				</div>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="grid grid-cols-3 gap-4">
			<div v-for="n in 3" :key="n" class="space-y-2">
				<div class="h-6 bg-muted/40 rounded animate-pulse w-20" />
				<div v-for="m in 2" :key="m" class="h-20 bg-muted/20 rounded-xl animate-pulse" />
			</div>
		</div>

		<!-- Board Columns -->
		<div v-else class="grid grid-cols-1 md:grid-cols-3 gap-0">
			<div v-for="col in columns" :key="col.key" class="flex flex-col task-board__col">
				<!-- Column Header -->
				<div class="task-board__col-header">
					<div class="flex items-center gap-2 flex-1">
						<span class="h-5 w-1 rounded-full" :class="col.dotColor" />
						<span class="text-xs font-semibold uppercase tracking-wider text-foreground/70">{{ col.label }}</span>
					</div>
					<span
						class="text-[10px] font-bold tabular-nums min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5"
						:class="col.badgeClass"
					>
						{{ getColumnTasks(col.key).length }}
					</span>
				</div>

				<!-- Task Cards -->
				<div class="task-board__col-content">
					<VueDraggable
						v-model="columnTasks[col.key]"
						item-key="id"
						:group="{ name: 'tasks' }"
						ghost-class="ghost"
						chosen-class="chosen"
						drag-class="drag"
						:animation="200"
						class="min-h-[200px]"
						:class="{ 'is-dragging': isDragging }"
						@start="isDragging = true"
						@end="isDragging = false"
						@change="(evt) => handleColumnChange(col.key, evt)"
					>
						<template #item="{ element: task }">
							<div class="task-wrapper">
								<TasksCard
									:task="task"
									:team-members="teamMembers"
									@select="openTaskSlideOver(task)"
									@toggle-complete="toggleComplete(task)"
								/>
							</div>
						</template>
					</VueDraggable>

					<!-- Quick add -->
					<div class="flex gap-1.5 mt-2">
						<input
							v-model="newTaskTitles[col.key]"
							type="text"
							:placeholder="`Add task...`"
							class="flex-1 h-7 rounded-lg border border-border/50 bg-transparent px-2 text-[11px] placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 transition-colors"
							@keydown.enter="quickAdd(col.key)"
						/>
					</div>
				</div>
			</div>
		</div>

	</div>
</template>

<script setup lang="ts">
import VueDraggable from 'vuedraggable';
import { subscribeToCollection } from '~/composables/useEntityStore';

const taskSlide = useAppSlideOver('task');

function openTaskSlideOver(task: any) {
	taskSlide.open(task.id);
}

const props = defineProps<{
	projectId: string;
	organizationId?: string;
	teamMembers?: Array<{ id: string; first_name: string; last_name: string; avatar?: string }>;
}>();

const emit = defineEmits<{
	statsChanged: [];
}>();

const taskItems = useDirectusItems('tasks');

// UX column → tasks.status enum
const COLUMN_TO_STATUS: Record<TaskColumn, 'new' | 'in_progress' | 'completed'> = {
	todo: 'new',
	in_progress: 'in_progress',
	done: 'completed',
};
function statusToColumn(status: string | null | undefined): TaskColumn {
	if (status === 'completed') return 'done';
	if (status === 'in_progress') return 'in_progress';
	return 'todo';
}
// Mine/All from the apps shell header — restricts to tasks the user owns
// or created when 'Mine' is active (and clamps non-admins to Mine).
const { isMine } = useDataScope();
const { user } = useDirectusAuth();

const allTasks = ref<any[]>([]);
const loading = ref(true);
const newTaskTitles = reactive<Record<string, string>>({ todo: '', in_progress: '', done: '' });

const isDragging = ref(false);

type TaskColumn = 'todo' | 'in_progress' | 'done';

const columns: { key: TaskColumn; label: string; dotColor: string; badgeClass: string }[] = [
	{ key: 'todo', label: 'To Do', dotColor: 'bg-blue-500', badgeClass: 'bg-blue-500/15 text-blue-600' },
	{ key: 'in_progress', label: 'In Progress', dotColor: 'bg-warning', badgeClass: 'bg-warning/15 text-warning' },
	{ key: 'done', label: 'Done', dotColor: 'bg-success', badgeClass: 'bg-success/15 text-success' },
];

// Per-column reactive arrays for drag-and-drop. Declared with explicit
// keys rather than `Record<string, any[]>` so index access on a known key
// returns `any[]` instead of `any[] | undefined` — this file references
// columnTasks.todo / .in_progress / .done dozens of times.
const columnTasks = reactive<Record<TaskColumn, any[]>>({ todo: [], in_progress: [], done: [] });

const completedCount = computed(() => columnTasks.done.length);
const allTasksCount = computed(() => columnTasks.todo.length + columnTasks.in_progress.length + columnTasks.done.length);
const progressPercent = computed(() => {
	if (!allTasksCount.value) return 0;
	return Math.round((completedCount.value / allTasksCount.value) * 100);
});

function distributeTasksToColumns() {
	const todo: any[] = [];
	const in_progress: any[] = [];
	const done: any[] = [];

	for (const t of allTasks.value) {
		const col = statusToColumn(t.status);
		if (col === 'done') done.push(t);
		else if (col === 'in_progress') in_progress.push(t);
		else todo.push(t);
	}

	columnTasks.todo = todo;
	columnTasks.in_progress = in_progress;
	columnTasks.done = done;
}

function getColumnTasks(status: string) {
	return columnTasks[status as TaskColumn] || [];
}

async function fetchTasks() {
	loading.value = true;
	try {
		const myId = (user.value as any)?.id;
		const filter: any = {
			_and: [
				{
					_or: [
						{ project_id: { _eq: props.projectId } },
						{ project_event_id: { project: { _eq: props.projectId } } },
					],
				},
			],
		};
		if (isMine.value && myId) {
			filter._and.push({
				_or: [
					{ assigned_to: { directus_users_id: { _eq: myId } } },
					{ user_created: { _eq: myId } },
				],
			});
		}
		const data = await taskItems.list({
			fields: [
				'id', 'title', 'description', 'status', 'priority', 'due_date', 'date_completed', 'sort',
				'project_id', 'project_event_id', 'category',
				'assigned_to.directus_users_id',
			],
			filter,
			sort: ['sort', '-date_created'],
			limit: -1,
		});
		allTasks.value = data || [];
		distributeTasksToColumns();
	} catch (err) {
		console.error('Failed to load project tasks:', err);
		allTasks.value = [];
		distributeTasksToColumns();
	} finally {
		loading.value = false;
	}
}

async function quickAdd(columnStatus: TaskColumn) {
	const title = newTaskTitles[columnStatus]?.trim();
	if (!title) return;

	try {
		const status = COLUMN_TO_STATUS[columnStatus];
		const newTask = await taskItems.create({
			title,
			status,
			project_id: props.projectId,
			organization_id: props.organizationId,
			category: 'project',
			schedule: 'unscheduled',
			priority: 'medium',
			date_completed: status === 'completed' ? new Date().toISOString() : null,
		});
		allTasks.value.push(newTask);
		columnTasks[columnStatus].push(newTask);
		newTaskTitles[columnStatus] = '';
		emit('statsChanged');
	} catch (err) {
		console.error('Failed to create task:', err);
	}
}

async function toggleComplete(task: any) {
	const wasCompleted = task.status === 'completed';
	const fromColumn: TaskColumn = wasCompleted ? 'done' : (task.status === 'in_progress' ? 'in_progress' : 'todo');
	const toColumn: TaskColumn = wasCompleted ? 'todo' : 'done';
	const newStatus = COLUMN_TO_STATUS[toColumn];
	const oldStatus = task.status;

	task.status = newStatus;

	// Splice from the old column and append to the new — no full
	// re-distribution. Avoids tasks shuffling on every checkbox tick.
	const idx = columnTasks[fromColumn].findIndex((t) => t.id === task.id);
	if (idx !== -1) columnTasks[fromColumn].splice(idx, 1);
	columnTasks[toColumn].push(task);

	try {
		await taskItems.update(task.id, {
			status: newStatus,
			date_completed: newStatus === 'completed' ? new Date().toISOString() : null,
		});
		emit('statsChanged');
	} catch (err) {
		// Revert
		task.status = oldStatus;
		const idxBack = columnTasks[toColumn].findIndex((t) => t.id === task.id);
		if (idxBack !== -1) columnTasks[toColumn].splice(idxBack, 1);
		columnTasks[fromColumn].push(task);
	}
}

async function handleColumnChange(columnKey: string, evt: any) {
	if (evt.added) {
		const task = evt.added.element;
		const newStatus = COLUMN_TO_STATUS[columnKey as TaskColumn];
		const isCompleted = newStatus === 'completed';
		task.status = newStatus;
		try {
			await taskItems.update(task.id, {
				status: newStatus,
				date_completed: isCompleted ? new Date().toISOString() : null,
			});
			emit('statsChanged');
		} catch (err) {
			console.error('Failed to update task status:', err);
			await fetchTasks();
		}
	}
}

onMounted(fetchTasks);

// Refetch when the Mine/All toggle flips so the board responds live.
watch(isMine, () => fetchTasks());

// Slide-over edits + deletes notify the entity bus; refetch so the board
// repaints with authoritative state (status changes shuffle columns, etc).
const unsubscribeTasks = subscribeToCollection('tasks', () => {
	fetchTasks().then(() => emit('statsChanged'));
});
onBeforeUnmount(() => unsubscribeTasks());
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.task-board__col {
	@apply border-r border-border/50;
}
.task-board__col:last-child {
	@apply border-r-0;
}

.task-board__col-header {
	@apply flex items-center gap-2 py-4 px-4 border-b border-border sticky top-0 z-10;
	background: rgba(255, 255, 255, 0.78);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	backdrop-filter: saturate(180%) blur(20px);
}
:is(.dark) .task-board__col-header {
	background: rgba(20, 20, 20, 0.78);
}

.task-board__col-content {
	@apply py-3 px-3 bg-muted/20 dark:bg-card/30 min-h-[300px];
}

.task-wrapper {
	@apply mb-2;
	transition: all 0.3s ease;
}

.ghost {
	opacity: 0.5;
	background: #f0f0f0;
}

.chosen {
	box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}

.drag {
	opacity: 0.9;
	box-shadow: 0 15px 25px rgba(0, 0, 0, 0.15);
}

.is-dragging {
	transition: all 0.3s ease;
}
</style>

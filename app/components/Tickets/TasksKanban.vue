<!--
  TasksKanban — board view for the Tasks floor.

  Presentational sibling of the Workload river: renders the SAME task set
  (ticket sub-tasks flattened by useTasksList, already realtime via the
  parent tickets websocket subscription) grouped into To Do / In Progress /
  Done columns. Drag between columns emits `update-status`; the checkbox
  emits `toggle`; the ticket chip emits `open-ticket`. All persistence and
  optimistic state live in the parent (TasksList → useTasksList), so this
  component stays dumb and reflects whatever `tasks` it's handed.

  Styling mirrors the tickets board columns for a consistent feel.
-->
<script setup lang="ts">
import VueDraggable from 'vuedraggable';

type Column = 'todo' | 'in_progress' | 'done';

const props = defineProps<{
	tasks: any[];
	updatingTasks?: Set<string | number>;
}>();

const emit = defineEmits<{
	(e: 'update-status', taskId: string | number, status: string): void;
	(e: 'toggle', taskId: string | number): void;
	(e: 'open-ticket', ticketId: string | number): void;
}>();

const columns: { key: Column; label: string; dotColor: string; badgeClass: string }[] = [
	{ key: 'todo', label: 'To Do', dotColor: 'bg-blue-500', badgeClass: 'bg-blue-500/15 text-blue-600' },
	{ key: 'in_progress', label: 'In Progress', dotColor: 'bg-warning', badgeClass: 'bg-warning/15 text-warning' },
	{ key: 'done', label: 'Done', dotColor: 'bg-success', badgeClass: 'bg-success/15 text-success' },
];

// UX column → tasks.status enum written on drop. 'new' is the canonical
// To Do value (matches the server + toggleTaskStatus reopen), so the two stay consistent.
const COLUMN_TO_STATUS: Record<Column, string> = {
	todo: 'new',
	in_progress: 'in_progress',
	done: 'completed',
};

function statusToColumn(status: string | null | undefined): Column {
	if (status === 'completed') return 'done';
	if (status === 'in_progress') return 'in_progress';
	return 'todo';
}

const columnTasks = reactive<Record<Column, any[]>>({ todo: [], in_progress: [], done: [] });
const isDragging = ref(false);

function distribute() {
	const next: Record<Column, any[]> = { todo: [], in_progress: [], done: [] };
	for (const t of props.tasks || []) next[statusToColumn(t.status)].push(t);
	columnTasks.todo = next.todo;
	columnTasks.in_progress = next.in_progress;
	columnTasks.done = next.done;
}

// Redistribute whenever the parent hands us a new set — but never mid-drag,
// or the reactive splice VueDraggable performs fights the redistribution.
watch(() => props.tasks, () => { if (!isDragging.value) distribute(); }, { immediate: true, deep: true });

function handleChange(col: Column, evt: any) {
	if (evt?.added) {
		const task = evt.added.element;
		emit('update-status', task.id, COLUMN_TO_STATUS[col]);
	}
}

function stripHtml(s: string) {
	if (!s) return '';
	return String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
function isTaskOverdue(task: any) {
	if (!task?.ticketContext?.due_date) return false;
	return isOverdue(task.ticketContext.due_date) && task.status !== 'completed';
}
</script>

<template>
	<div class="grid grid-cols-1 md:grid-cols-3 gap-0 tasks-kanban">
		<div v-for="col in columns" :key="col.key" class="flex flex-col tasks-kanban__col">
			<!-- Column header -->
			<div class="tasks-kanban__col-header">
				<div class="flex items-center gap-2 flex-1">
					<span class="h-5 w-1 rounded-full" :class="col.dotColor" />
					<span class="text-xs font-semibold uppercase tracking-wider text-foreground/70">{{ col.label }}</span>
				</div>
				<span
					class="text-[10px] font-bold tabular-nums min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5"
					:class="col.badgeClass"
				>
					{{ columnTasks[col.key].length }}
				</span>
			</div>

			<!-- Cards -->
			<div class="tasks-kanban__col-content">
				<VueDraggable
					v-model="columnTasks[col.key]"
					item-key="id"
					:group="{ name: 'tasks' }"
					ghost-class="ghost"
					chosen-class="chosen"
					drag-class="drag"
					:animation="200"
					class="min-h-[200px] space-y-2"
					@start="isDragging = true"
					@end="isDragging = false"
					@change="(evt: any) => handleChange(col.key, evt)"
				>
					<template #item="{ element: task }">
						<div class="ios-card p-3 cursor-grab active:cursor-grabbing relative group">
							<div
								v-if="updatingTasks?.has(task.id)"
								class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 rounded-2xl flex items-center justify-center z-10"
							>
								<Icon name="lucide:loader-2" class="w-4 h-4 animate-spin text-muted-foreground" />
							</div>

							<div class="flex items-start gap-2">
								<UCheckbox
									:model-value="task.status === 'completed'"
									class="mt-0.5"
									@update:model-value="emit('toggle', task.id)"
									@click.stop
								/>
								<div class="flex-1 min-w-0">
									<div
										class="text-xs leading-4"
										:class="{ 'line-through text-muted-foreground': task.status === 'completed' }"
										v-html="stripHtml(task.description) || 'Untitled task'"
									/>

									<div class="mt-2 flex items-center flex-wrap gap-x-2 gap-y-1 text-[9px] uppercase tracking-wide text-muted-foreground">
										<button
											v-if="task.ticketContext?.id"
											type="button"
											class="inline-flex items-center gap-1 hover:text-primary transition-colors"
											@click.stop="emit('open-ticket', task.ticketContext.id)"
										>
											<Icon name="lucide:ticket" class="w-3 h-3" />
											<span class="truncate max-w-[120px]">{{ task.ticketContext.title || 'Ticket' }}</span>
										</button>
										<span
											v-if="task.ticketContext?.due_date"
											class="inline-flex items-center gap-1"
											:class="{ 'text-destructive': isTaskOverdue(task) }"
										>
											<Icon name="lucide:calendar" class="w-3 h-3" />
											{{ getFriendlyDateTwo(task.ticketContext.due_date) }}
										</span>
									</div>
								</div>
							</div>
						</div>
					</template>
				</VueDraggable>
			</div>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.tasks-kanban__col {
	@apply border-r border-border/50;
}
.tasks-kanban__col:last-child {
	@apply border-r-0;
}

.tasks-kanban__col-header {
	@apply flex items-center gap-2 py-3 px-4 border-b border-border sticky top-0 z-10;
	background: rgba(255, 255, 255, 0.78);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	backdrop-filter: saturate(180%) blur(20px);
}
:is(.dark) .tasks-kanban__col-header {
	background: rgba(20, 20, 20, 0.78);
}

.tasks-kanban__col-content {
	@apply py-3 px-3 bg-muted/20 dark:bg-card/30 min-h-[300px];
}

.ghost {
	opacity: 0.5;
}
.chosen {
	box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}
.drag {
	opacity: 0.9;
	box-shadow: 0 15px 25px rgba(0, 0, 0, 0.15);
}
</style>

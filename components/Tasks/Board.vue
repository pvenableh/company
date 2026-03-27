<template>
	<div class="task-board">
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-3">
				<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
					{{ completedCount }}/{{ allTasks.length }} complete
				</span>
				<div v-if="allTasks.length" class="w-24 h-1.5 bg-muted/30 rounded-full overflow-hidden">
					<div
						class="h-full rounded-full transition-all duration-500"
						:class="progressPercent > 75 ? 'bg-emerald-500' : progressPercent > 25 ? 'bg-amber-500' : 'bg-primary'"
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
		<div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<div v-for="col in columns" :key="col.key" class="flex flex-col">
				<!-- Column Header -->
				<div class="flex items-center gap-2 mb-3 px-1">
					<span class="w-2 h-2 rounded-full" :class="col.dotColor" />
					<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{{ col.label }}</span>
					<span class="text-[10px] text-muted-foreground/50">{{ getColumnTasks(col.key).length }}</span>
				</div>

				<!-- Task Cards -->
				<div
					class="flex-1 rounded-xl border border-dashed p-2 min-h-[120px] space-y-2"
					:class="col.borderColor"
				>
					<VueDraggable
						:model-value="getColumnTasks(col.key)"
						item-key="id"
						:group="{ name: 'tasks' }"
						ghost-class="opacity-40"
						:animation="200"
						class="space-y-2 min-h-[80px]"
						@change="(evt) => handleColumnChange(col.key, evt)"
					>
						<template #item="{ element: task }">
							<div
								class="ios-card p-3 cursor-pointer hover:ring-1 hover:ring-white/10 transition-all"
								@click="selectedTask = task"
							>
								<div class="flex items-start gap-2">
									<button class="shrink-0 mt-0.5" @click.stop="toggleComplete(task)">
										<div
											class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
											:class="task.completed
												? 'bg-primary border-primary'
												: 'border-border hover:border-primary'"
										>
											<Icon v-if="task.completed" name="lucide:check" class="w-2.5 h-2.5 text-white" />
										</div>
									</button>
									<div class="flex-1 min-w-0">
										<p class="text-xs font-medium" :class="task.completed ? 'line-through text-muted-foreground' : ''">
											{{ task.title }}
										</p>
										<div class="flex items-center gap-2 mt-1.5">
											<span
												v-if="task.priority && task.priority !== 'medium'"
												class="text-[8px] uppercase font-bold"
												:class="{
													'text-red-500': task.priority === 'high',
													'text-blue-400': task.priority === 'low',
												}"
											>
												{{ task.priority }}
											</span>
											<span v-if="task.due_date" class="text-[10px] text-muted-foreground flex items-center gap-0.5">
												<Icon name="lucide:calendar" class="w-2.5 h-2.5" />
												{{ formatDueDate(task.due_date) }}
											</span>
										</div>
									</div>
									<!-- Assignee avatar -->
									<div v-if="task.assignee_id && getAssignee(task.assignee_id)" class="shrink-0">
										<div
											class="w-5 h-5 rounded-full bg-muted/60 flex items-center justify-center text-[8px] font-semibold text-muted-foreground"
											:title="getAssigneeName(task.assignee_id)"
										>
											{{ getAssigneeInitial(task.assignee_id) }}
										</div>
									</div>
								</div>
							</div>
						</template>
					</VueDraggable>

					<!-- Quick add -->
					<div class="flex gap-1.5">
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

		<!-- Task Detail Panel -->
		<TasksDetailPanel
			v-if="selectedTask"
			:task="selectedTask"
			:team-members="teamMembers"
			@close="selectedTask = null"
			@update="handleTaskUpdate"
			@delete="handleTaskDelete"
		/>
	</div>
</template>

<script setup lang="ts">
import VueDraggable from 'vuedraggable';

const props = defineProps<{
	projectId: string;
	organizationId?: string;
	teamMembers?: Array<{ id: string; first_name: string; last_name: string; avatar?: string }>;
}>();

const emit = defineEmits<{
	statsChanged: [];
}>();

const taskItems = useDirectusItems('project_tasks');

const allTasks = ref<any[]>([]);
const loading = ref(true);
const selectedTask = ref<any>(null);
const newTaskTitles = reactive<Record<string, string>>({ todo: '', in_progress: '', done: '' });

const columns = [
	{ key: 'todo', label: 'To Do', dotColor: 'bg-blue-500', borderColor: 'border-blue-500/20' },
	{ key: 'in_progress', label: 'In Progress', dotColor: 'bg-amber-500', borderColor: 'border-amber-500/20' },
	{ key: 'done', label: 'Done', dotColor: 'bg-emerald-500', borderColor: 'border-emerald-500/20' },
];

const completedCount = computed(() => allTasks.value.filter(t => t.completed || t.status === 'done').length);
const progressPercent = computed(() => {
	if (!allTasks.value.length) return 0;
	return Math.round((completedCount.value / allTasks.value.length) * 100);
});

function getColumnTasks(status: string) {
	return allTasks.value.filter(t => {
		// Map legacy statuses
		const s = t.status || 'todo';
		if (status === 'done') return s === 'done' || t.completed;
		if (status === 'todo') return (s === 'todo' || s === 'published' || s === 'draft') && !t.completed;
		if (status === 'in_progress') return s === 'in_progress' && !t.completed;
		return false;
	});
}

async function fetchTasks() {
	loading.value = true;
	try {
		const data = await taskItems.list({
			fields: ['id', 'title', 'description', 'status', 'priority', 'due_date', 'completed', 'completed_at', 'assignee_id', 'sort', 'event_id', 'project'],
			filter: {
				_or: [
					{ project: { _eq: props.projectId } },
					{ event_id: { project: { _eq: props.projectId } } },
				],
			},
			sort: ['sort', '-date_created'],
			limit: -1,
		});
		allTasks.value = data || [];
	} catch (err) {
		console.error('Failed to load project tasks:', err);
		allTasks.value = [];
	} finally {
		loading.value = false;
	}
}

async function quickAdd(columnStatus: string) {
	const title = newTaskTitles[columnStatus]?.trim();
	if (!title) return;

	try {
		const newTask = await taskItems.create({
			title,
			status: columnStatus,
			project: props.projectId,
			completed: columnStatus === 'done',
			priority: 'medium',
		});
		allTasks.value.push(newTask);
		newTaskTitles[columnStatus] = '';
		emit('statsChanged');
	} catch (err) {
		console.error('Failed to create task:', err);
	}
}

async function toggleComplete(task: any) {
	const wasCompleted = task.completed;
	task.completed = !wasCompleted;
	task.status = wasCompleted ? 'todo' : 'done';
	try {
		await taskItems.update(task.id, {
			completed: task.completed,
			status: task.status,
			completed_at: task.completed ? new Date().toISOString() : null,
		});
		emit('statsChanged');
	} catch (err) {
		// Revert
		task.completed = wasCompleted;
		task.status = wasCompleted ? 'done' : 'todo';
	}
}

async function handleColumnChange(columnKey: string, evt: any) {
	if (evt.added) {
		const task = evt.added.element;
		const newStatus = columnKey;
		const isCompleted = newStatus === 'done';
		task.status = newStatus;
		task.completed = isCompleted;
		try {
			await taskItems.update(task.id, {
				status: newStatus,
				completed: isCompleted,
				completed_at: isCompleted ? new Date().toISOString() : null,
			});
			emit('statsChanged');
		} catch (err) {
			console.error('Failed to update task status:', err);
			await fetchTasks();
		}
	}
}

async function handleTaskUpdate(taskId: string, payload: any) {
	try {
		await taskItems.update(taskId, payload);
		const idx = allTasks.value.findIndex(t => t.id === taskId);
		if (idx !== -1) Object.assign(allTasks.value[idx], payload);
		emit('statsChanged');
	} catch (err) {
		console.error('Failed to update task:', err);
	}
}

async function handleTaskDelete(taskId: string) {
	try {
		await taskItems.remove(taskId);
		allTasks.value = allTasks.value.filter(t => t.id !== taskId);
		selectedTask.value = null;
		emit('statsChanged');
	} catch (err) {
		console.error('Failed to delete task:', err);
	}
}

function formatDueDate(d: string) {
	return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getAssignee(id: string) {
	return props.teamMembers?.find(m => m.id === id);
}

function getAssigneeName(id: string) {
	const m = getAssignee(id);
	return m ? `${m.first_name} ${m.last_name}`.trim() : '';
}

function getAssigneeInitial(id: string) {
	const m = getAssignee(id);
	return m?.first_name?.[0]?.toUpperCase() || '?';
}

onMounted(fetchTasks);
</script>

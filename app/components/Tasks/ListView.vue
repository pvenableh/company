<template>
	<div class="w-full">
		<!-- Quick add -->
		<div class="flex gap-2 mb-4">
			<input
				ref="inputRef"
				v-model="newTitle"
				type="text"
				placeholder="Add a task..."
				class="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
				@keydown.enter="handleAdd"
			/>
			<button
				class="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center gap-1"
				:disabled="!newTitle.trim() || adding"
				@click="handleAdd"
			>
				<Icon v-if="adding" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
				<Icon v-else name="lucide:plus" class="w-3.5 h-3.5" />
				Add
			</button>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="space-y-2">
			<div v-for="n in 5" :key="n" class="h-10 bg-muted/30 rounded-xl animate-pulse" />
		</div>

		<!-- Task list -->
		<div v-else-if="sortedTasks.length" class="space-y-1">
			<div
				v-for="task in sortedTasks"
				:key="task.id"
				class="ios-card p-3 flex items-center gap-3 group stagger-item"
			>
				<!-- Checkbox -->
				<button class="shrink-0" @click="toggleComplete(task)">
					<div
						class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
						:class="task.status === 'completed'
							? 'bg-primary border-primary'
							: 'border-border hover:border-primary'"
					>
						<Icon v-if="task.status === 'completed'" name="lucide:check" class="w-2.5 h-2.5 text-white" />
					</div>
				</button>

				<!-- Content -->
				<div class="flex-1 min-w-0">
					<p
						class="text-xs font-medium truncate"
						:class="task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'"
					>
						{{ task.title }}
					</p>
					<div v-if="task.due_date || taskAssigneeId(task)" class="flex items-center gap-2 mt-0.5">
						<span v-if="task.due_date" class="text-[10px] text-muted-foreground flex items-center gap-0.5">
							<Icon name="lucide:calendar" class="w-2.5 h-2.5" />
							{{ getFriendlyDateTwo(task.due_date) }}
						</span>
						<span v-if="taskAssigneeId(task) && getAssignee(taskAssigneeId(task)!)" class="text-[10px] text-muted-foreground">
							{{ getAssigneeName(taskAssigneeId(task)!) }}
						</span>
					</div>
				</div>

				<!-- Priority -->
				<span
					v-if="task.priority && task.priority !== 'medium' && task.status !== 'completed'"
					class="text-[8px] uppercase font-semibold px-1.5 py-0.5 rounded-md shrink-0"
					:class="{
						'text-destructive bg-destructive/10': task.priority === 'high',
						'text-blue-400 bg-blue-500/10': task.priority === 'low',
					}"
				>
					{{ task.priority }}
				</span>

				<!-- Status pill -->
				<span
					class="text-[8px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
					:class="getStatusBadgeClasses(task.status || 'new')"
				>
					{{ task.status === 'completed' ? 'Done' : task.status === 'in_progress' ? 'In Progress' : 'To Do' }}
				</span>

				<!-- Delete -->
				<button
					class="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive shrink-0"
					@click="deleteTask(task.id)"
				>
					<Icon name="lucide:trash-2" class="w-3 h-3" />
				</button>
			</div>
		</div>

		<!-- Empty -->
		<div v-else class="flex flex-col items-center justify-center py-12 text-center">
			<Icon name="lucide:check-square" class="w-8 h-8 text-muted-foreground/30 mb-2" />
			<p class="text-sm text-muted-foreground">No tasks yet</p>
			<p class="text-xs text-muted-foreground/60 mt-1">Add a task above to get started.</p>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	projectId: string;
	organizationId?: string;
	teamMembers?: Array<{ id: string; first_name: string; last_name: string; avatar?: string }>;
}>();

const emit = defineEmits<{
	statsChanged: [];
}>();

const taskItems = useDirectusItems('tasks');
const { getStatusBadgeClasses } = useStatusStyle();
// Mine/All from the apps shell header.
const { isMine } = useDataScope();
const { user } = useDirectusAuth();

const tasks = ref<any[]>([]);
const loading = ref(true);
const adding = ref(false);
const newTitle = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const sortedTasks = computed(() => {
	const active = tasks.value.filter(t => t.status !== 'completed');
	const done = tasks.value.filter(t => t.status === 'completed');
	return [...active, ...done];
});

function taskAssigneeId(task: any): string | null {
	const junction = task?.assigned_to?.[0];
	if (!junction) return null;
	const id = typeof junction === 'string'
		? junction
		: junction?.directus_users_id?.id || junction?.directus_users_id || null;
	return id || null;
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
				'project_id', 'project_event_id',
				'assigned_to.directus_users_id',
			],
			filter,
			sort: ['sort', '-date_created'],
			limit: -1,
		});
		tasks.value = data || [];
	} catch (err) {
		console.error('Failed to load tasks:', err);
		tasks.value = [];
	} finally {
		loading.value = false;
	}
}

async function handleAdd() {
	if (!newTitle.value.trim() || adding.value) return;
	adding.value = true;
	try {
		const newTask = await taskItems.create({
			title: newTitle.value.trim(),
			status: 'new',
			project_id: props.projectId,
			organization_id: props.organizationId,
			category: 'project',
			schedule: 'unscheduled',
			priority: 'medium',
		});
		tasks.value.push(newTask);
		newTitle.value = '';
		emit('statsChanged');
		nextTick(() => inputRef.value?.focus());
	} catch (err) {
		console.error('Failed to create task:', err);
	} finally {
		adding.value = false;
	}
}

async function toggleComplete(task: any) {
	const wasCompleted = task.status === 'completed';
	const newStatus = wasCompleted ? 'new' : 'completed';
	task.status = newStatus;
	try {
		await taskItems.update(task.id, {
			status: newStatus,
			date_completed: newStatus === 'completed' ? new Date().toISOString() : null,
		});
		emit('statsChanged');
	} catch (err) {
		task.status = wasCompleted ? 'completed' : 'new';
	}
}

async function deleteTask(id: string) {
	try {
		await taskItems.remove(id);
		tasks.value = tasks.value.filter(t => t.id !== id);
		emit('statsChanged');
	} catch (err) {
		console.error('Failed to delete task:', err);
	}
}

function getAssignee(id: string) {
	return props.teamMembers?.find(m => m.id === id);
}

function getAssigneeName(id: string) {
	const m = getAssignee(id);
	return m ? `${m.first_name} ${m.last_name}`.trim() : '';
}

onMounted(fetchTasks);

// Refetch when the Mine/All toggle flips.
watch(isMine, () => fetchTasks());
</script>

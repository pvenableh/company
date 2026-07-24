<template>
	<div class="w-full">
		<!-- Quick add -->
		<div class="flex gap-2 mb-4">
			<input
				ref="inputRef"
				v-model="newTitle"
				type="text"
				placeholder="Add a task..."
				class="flex-1 h-9 rounded-lg glass-field px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none transition-colors"
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
				class="ios-card task-row p-3 flex items-center gap-3 group stagger-item"
			>
				<!-- Checkbox -->
				<button class="shrink-0" @click.stop="toggleComplete(task)">
					<div
						class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
						:class="task.status === 'completed'
							? 'bg-primary border-primary'
							: 'border-border hover:border-primary'"
					>
						<Icon v-if="task.status === 'completed'" name="lucide:check" class="w-2.5 h-2.5 text-white" />
					</div>
				</button>

				<!-- Content — clickable area opens the edit sheet via FLIP. -->
				<button
					type="button"
					class="flex-1 min-w-0 text-left"
					@click="openEdit(task, $event)"
				>
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
				</button>

				<!-- Priority -->
				<span
					v-if="task.priority && task.priority !== 'medium' && task.status !== 'completed'"
					class="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-md shrink-0"
					:class="{
						'text-destructive bg-destructive/10': task.priority === 'high',
						'text-blue-400 bg-blue-500/10': task.priority === 'low',
					}"
				>
					{{ task.priority }}
				</span>

				<!-- Status pill -->
				<span
					class="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
					:class="getStatusBadgeClasses(task.status || 'new')"
				>
					{{ task.status === 'completed' ? 'Done' : task.status === 'in_progress' ? 'In Progress' : 'To Do' }}
				</span>

				<!-- Delete -->
				<button
					class="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive shrink-0"
					@click.stop="deleteTask(task.id)"
				>
					<Icon name="lucide:trash-2" class="w-3 h-3" />
				</button>
			</div>
		</div>

		<!-- Edit sheet — FLIPs in from the clicked row.
		     #hero renders a landed pose; the ghost crossfades into it on
		     arrival (see [[project_universal_ios_ux_sweep]] P2.5 slice 1). -->
		<AppsAppBottomSheet
			v-model="editOpen"
			:flip-from="flipFrom"
			:title="editing?.title || 'Edit task'"
			subtitle="Tap a field to update."
		>
			<template v-if="editing" #hero>
				<div class="flex items-center gap-3 p-2">
					<div
						class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
						:class="editing.status === 'completed' ? 'bg-primary border-primary' : 'border-border'"
					>
						<Icon v-if="editing.status === 'completed'" name="lucide:check" class="w-2.5 h-2.5 text-white" />
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-semibold text-foreground truncate">{{ editing.title }}</p>
						<p class="text-[11px] text-muted-foreground mt-0.5">
							{{ editing.status === 'completed' ? 'Done' : editing.status === 'in_progress' ? 'In Progress' : 'To Do' }}
							<span v-if="editing.due_date"> · due {{ getFriendlyDateTwo(editing.due_date) }}</span>
						</p>
					</div>
				</div>
			</template>

			<form
				v-if="editing"
				id="task-edit-form"
				class="space-y-3"
				@submit.prevent="saveEdit"
			>
				<label class="block">
					<span class="text-[11px] uppercase tracking-wide text-muted-foreground">Title</span>
					<input
						v-model="editTitle"
						type="text"
						class="mt-1 w-full h-9 rounded-lg glass-field px-3 text-sm focus:outline-none"
					/>
				</label>

				<label class="block">
					<span class="text-[11px] uppercase tracking-wide text-muted-foreground">Description</span>
					<textarea
						v-model="editDescription"
						rows="3"
						class="mt-1 w-full rounded-lg glass-field px-3 py-2 text-sm focus:outline-none"
					/>
				</label>

				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="text-[11px] uppercase tracking-wide text-muted-foreground">Status</span>
						<select
							v-model="editStatus"
							class="mt-1 w-full h-9 rounded-lg glass-field px-2 text-sm focus:outline-none"
						>
							<option value="new">To Do</option>
							<option value="in_progress">In Progress</option>
							<option value="completed">Done</option>
						</select>
					</label>
					<label class="block">
						<span class="text-[11px] uppercase tracking-wide text-muted-foreground">Priority</span>
						<select
							v-model="editPriority"
							class="mt-1 w-full h-9 rounded-lg glass-field px-2 text-sm focus:outline-none"
						>
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
						</select>
					</label>
				</div>

				<label class="block">
					<span class="text-[11px] uppercase tracking-wide text-muted-foreground">Due date</span>
					<input
						v-model="editDueDate"
						type="date"
						class="mt-1 w-full h-9 rounded-lg glass-field px-3 text-sm focus:outline-none"
					/>
				</label>
			</form>

			<template #footer>
				<button
					type="button"
					class="h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground"
					@click="editOpen = false"
				>
					Cancel
				</button>
				<button
					type="submit"
					form="task-edit-form"
					class="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center gap-1"
					:disabled="saving"
				>
					<Icon v-if="saving" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
					Save
				</button>
			</template>
		</AppsAppBottomSheet>

		<!-- Empty — standalone v-if (not in the loading/list chain) so the
		     edit sheet sibling above doesn't break the v-else binding. -->
		<div v-if="!loading && !sortedTasks.length" class="flex flex-col items-center justify-center py-12 text-center">
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

const tasks = ref<any[]>([]);
const loading = ref(true);
const adding = ref(false);
const newTitle = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

// Pull-from-anywhere edit sheet. Row click captures the rect+outerHTML
// of the .task-row element so the sheet FLIPs it into the hero slot.
const { flipFrom, captureFromEl, clear: clearFlipFrom } = useFlipFromRow();
const editOpen = ref(false);
const editing = ref<any | null>(null);
const editTitle = ref('');
const editDescription = ref('');
const editStatus = ref<'new' | 'in_progress' | 'completed'>('new');
const editPriority = ref<'low' | 'medium' | 'high'>('medium');
const editDueDate = ref<string>('');
const saving = ref(false);

function openEdit(task: any, ev: MouseEvent) {
	const row = (ev.currentTarget as HTMLElement).closest('.task-row') as HTMLElement | null;
	captureFromEl(row);
	editing.value = task;
	editTitle.value = task.title || '';
	editDescription.value = task.description || '';
	editStatus.value = (task.status || 'new') as typeof editStatus.value;
	editPriority.value = (task.priority || 'medium') as typeof editPriority.value;
	editDueDate.value = task.due_date ? String(task.due_date).slice(0, 10) : '';
	editOpen.value = true;
}

watch(editOpen, (open) => {
	if (!open) setTimeout(clearFlipFrom, 350);
});

async function saveEdit() {
	if (!editing.value || saving.value) return;
	saving.value = true;
	const id = editing.value.id;
	const patch: Record<string, any> = {
		title: editTitle.value.trim(),
		description: editDescription.value,
		status: editStatus.value,
		priority: editPriority.value,
		due_date: editDueDate.value || null,
		date_completed: editStatus.value === 'completed'
			? (editing.value.date_completed || new Date().toISOString())
			: null,
	};
	try {
		const updated = await taskItems.update(id, patch);
		const idx = tasks.value.findIndex((t) => t.id === id);
		if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], ...patch, ...updated };
		emit('statsChanged');
		editOpen.value = false;
	} catch (err) {
		console.error('Failed to update task:', err);
	} finally {
		saving.value = false;
	}
}

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
		// Project-scoped view: always show ALL of the project's tasks so the
		// tab matches the project timeline. The global Mine/Everyone lens
		// belongs to the cross-project Tasks floor (<TicketsTasksList>), not
		// inside a single project — filtering here just hid teammates' tasks.
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
</script>

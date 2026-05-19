<template>
	<Teleport to="body">
		<div class="fixed inset-0 z-50 flex justify-end" @click.self="$emit('close')">
			<div class="absolute inset-0 bg-black/30 backdrop-blur-sm" @click="$emit('close')" />
			<div class="relative w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col h-full animate-slide-in">
				<!-- Header -->
				<div class="flex items-center justify-between px-5 py-4 border-b border-border/50">
					<div class="flex items-center gap-2">
						<button @click="toggleComplete" class="shrink-0">
							<div
								class="w-5 h-5 rounded border-2 flex items-center justify-center transition-all"
								:class="isCompleted
									? 'bg-primary border-primary'
									: 'border-border hover:border-primary'"
							>
								<Icon v-if="isCompleted" name="lucide:check" class="w-3 h-3 text-white" />
							</div>
						</button>
						<span
							class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
							:class="getStatusBadgeClasses(localTask.status || 'new')"
						>
							{{ statusLabels[localTask.status || 'new'] }}
						</span>
					</div>
					<div class="flex items-center gap-1">
						<button
							class="p-1.5 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
							title="Delete task"
							@click="confirmingDelete = true"
						>
							<Icon name="lucide:trash-2" class="w-4 h-4" />
						</button>
						<button
							class="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
							@click="$emit('close')"
						>
							<Icon name="lucide:x" class="w-4 h-4" />
						</button>
					</div>
				</div>

				<!-- Body -->
				<div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
					<!-- Title -->
					<div>
						<input
							v-model="localTask.title"
							class="w-full text-base font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/40"
							placeholder="Task title..."
							@blur="saveField('title', localTask.title)"
						/>
					</div>

					<!-- Fields Grid -->
					<div class="space-y-3">
						<!-- Status -->
						<div class="flex items-center gap-3">
							<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20">Status</span>
							<select
								v-model="localTask.status"
								class="flex-1 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
								@change="onStatusChange"
							>
								<option value="new">To Do</option>
								<option value="in_progress">In Progress</option>
								<option value="completed">Done</option>
							</select>
						</div>

						<!-- Priority -->
						<div class="flex items-center gap-3">
							<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20">Priority</span>
							<div class="flex gap-1">
								<button
									v-for="p in priorityOptions"
									:key="p.value"
									class="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors"
									:class="localTask.priority === p.value ? p.activeClass : 'text-muted-foreground hover:bg-muted/40'"
									@click="localTask.priority = p.value; saveField('priority', p.value)"
								>
									{{ p.label }}
								</button>
							</div>
						</div>

						<!-- Assignee — tasks.assigned_to is an m2m junction; we expose
						     the first assignee as a single-pick for backwards compatibility
						     with the prior project_tasks UX. -->
						<div class="flex items-center gap-3">
							<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20">Assignee</span>
							<select
								:value="assigneeId"
								class="flex-1 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
								@change="onAssigneeChange(($event.target as HTMLSelectElement).value || null)"
							>
								<option value="">Unassigned</option>
								<option v-for="m in teamMembers" :key="m.id" :value="m.id">
									{{ m.first_name }} {{ m.last_name }}
								</option>
							</select>
						</div>

						<!-- Due Date -->
						<div class="flex items-center gap-3">
							<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20">Due Date</span>
							<input
								v-model="localTask.due_date"
								type="date"
								class="flex-1 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
								@change="saveField('due_date', localTask.due_date || null)"
							/>
						</div>
					</div>

					<!-- Description -->
					<div>
						<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Description</span>
						<textarea
							v-model="localTask.description"
							rows="4"
							class="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/40 resize-none"
							placeholder="Add details..."
							@blur="saveField('description', localTask.description || null)"
						/>
					</div>
				</div>

				<!-- Delete Confirmation -->
				<div v-if="confirmingDelete" class="px-5 py-4 border-t border-border bg-destructive/5">
					<p class="text-sm text-destructive mb-3">Delete this task? This cannot be undone.</p>
					<div class="flex justify-end gap-2">
						<button class="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground" @click="confirmingDelete = false">Cancel</button>
						<button class="px-3 py-1.5 rounded-lg text-xs bg-destructive text-white hover:bg-destructive" @click="$emit('delete', task.id)">Delete</button>
					</div>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
	task: any;
	teamMembers?: Array<{ id: string; first_name: string; last_name: string; avatar?: string }>;
}>();

const emit = defineEmits<{
	close: [];
	update: [taskId: string, payload: any];
	delete: [taskId: string];
}>();

const localTask = reactive({ ...props.task });
const confirmingDelete = ref(false);

watch(() => props.task, (newTask) => {
	Object.assign(localTask, newTask);
}, { deep: true });

const { getStatusBadgeClasses } = useStatusStyle();

const statusLabels: Record<string, string> = {
	new: 'To Do',
	approved: 'To Do',
	in_progress: 'In Progress',
	completed: 'Done',
};

const isCompleted = computed(() => localTask.status === 'completed');

const assigneeId = computed<string>(() => {
	const junction = localTask.assigned_to?.[0];
	if (!junction) return '';
	const id = typeof junction === 'string'
		? junction
		: junction?.directus_users_id?.id || junction?.directus_users_id || '';
	return id || '';
});

const priorityOptions = [
	{ value: 'low', label: 'Low', activeClass: 'bg-blue-500/10 text-blue-500' },
	{ value: 'medium', label: 'Medium', activeClass: 'bg-warning/10 text-warning' },
	{ value: 'high', label: 'High', activeClass: 'bg-destructive/10 text-destructive' },
];

function saveField(field: string, value: any) {
	emit('update', props.task.id, { [field]: value });
}

function onStatusChange() {
	emit('update', props.task.id, {
		status: localTask.status,
		date_completed: localTask.status === 'completed' ? new Date().toISOString() : null,
	});
}

function onAssigneeChange(newId: string | null) {
	// Replace the m2m array with a single-row payload — Directus accepts an
	// array of partial junction rows to overwrite the relation.
	localTask.assigned_to = newId
		? [{ directus_users_id: newId }]
		: [];
	emit('update', props.task.id, { assigned_to: localTask.assigned_to });
}

function toggleComplete() {
	const newStatus = isCompleted.value ? 'new' : 'completed';
	localTask.status = newStatus;
	emit('update', props.task.id, {
		status: newStatus,
		date_completed: newStatus === 'completed' ? new Date().toISOString() : null,
	});
}
</script>

<style scoped>
.animate-slide-in {
	animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
	from {
		transform: translateX(100%);
	}
	to {
		transform: translateX(0);
	}
}
</style>

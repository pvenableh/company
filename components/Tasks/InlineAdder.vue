<template>
	<div class="task-inline-adder">
		<!-- Header with task count -->
		<div class="flex items-center justify-between mb-2">
			<h3 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
				<Icon name="lucide:check-square" class="w-3.5 h-3.5" />
				Tasks
				<span v-if="tasks.length" class="text-[9px] font-medium text-muted-foreground/60 bg-muted/50 px-1.5 rounded-full">
					{{ completedCount }}/{{ tasks.length }}
				</span>
			</h3>
			<button
				v-if="completedCount > 0"
				class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
				@click="handleClearCompleted"
			>
				Clear done
			</button>
		</div>

		<!-- Add task input -->
		<div class="flex gap-1.5 mb-2">
			<input
				ref="inputRef"
				v-model="newTitle"
				type="text"
				placeholder="Add a task..."
				class="flex-1 h-8 rounded-lg border border-border bg-background px-2.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
				@keydown.enter="handleAdd"
			/>
			<button
				class="h-8 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
				:disabled="!newTitle.trim() || adding"
				@click="handleAdd"
			>
				<Icon v-if="adding" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
				<Icon v-else name="lucide:plus" class="w-3.5 h-3.5" />
			</button>
		</div>

		<!-- Schedule/priority row (when typing) -->
		<div v-if="newTitle.trim()" class="flex items-center gap-3 mb-2 text-[10px]">
			<div class="flex items-center gap-1">
				<button
					v-for="s in scheduleOptions"
					:key="s.value"
					:class="[
						'px-1.5 py-0.5 rounded-full transition-colors',
						newSchedule === s.value
							? 'bg-primary/10 text-primary font-medium'
							: 'text-muted-foreground hover:text-foreground'
					]"
					@click="newSchedule = s.value"
				>
					{{ s.label }}
				</button>
			</div>
			<div class="w-px h-3 bg-border" />
			<div class="flex items-center gap-1">
				<button
					v-for="p in priorityOptions"
					:key="p.value"
					:class="[
						'px-1.5 py-0.5 rounded-full transition-colors',
						newPriority === p.value
							? p.activeClass
							: 'text-muted-foreground hover:text-foreground'
					]"
					@click="newPriority = p.value"
				>
					{{ p.label }}
				</button>
			</div>
		</div>

		<!-- Task list -->
		<div v-if="tasks.length" class="space-y-0.5">
			<div
				v-for="task in sortedTasks"
				:key="task.id"
				class="flex items-center gap-2 px-2 py-1.5 rounded-lg group hover:bg-muted/30 transition-colors"
			>
				<button
					class="shrink-0"
					@click="handleToggle(task.id)"
				>
					<div
						class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
						:class="task.completed
							? 'bg-primary border-primary'
							: 'border-border hover:border-primary'"
					>
						<Icon v-if="task.completed" name="lucide:check" class="w-2.5 h-2.5 text-white" />
					</div>
				</button>
				<span
					class="flex-1 text-xs truncate"
					:class="task.completed ? 'line-through text-muted-foreground' : ''"
				>
					{{ task.title }}
				</span>
				<span
					v-if="task.priority !== 'medium' && !task.completed"
					class="text-[8px] uppercase font-semibold"
					:class="{
						'text-red-500': task.priority === 'high' || task.priority === 'urgent',
						'text-blue-400': task.priority === 'low',
					}"
				>
					{{ task.priority }}
				</span>
				<button
					class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-destructive"
					@click="handleRemove(task.id)"
				>
					<Icon name="lucide:x" class="w-3 h-3" />
				</button>
			</div>
		</div>

		<!-- Empty state -->
		<p v-else class="text-xs text-muted-foreground/50 text-center py-3">No tasks yet</p>
	</div>
</template>

<script setup lang="ts">
import type { TaskSchedule, TaskPriority } from '~/composables/useQuickTasks';

const props = defineProps<{
	/** Context entity type */
	context?: 'project' | 'event' | 'channel' | 'ticket' | 'team' | 'client';
	/** ID of the context entity */
	contextId?: string;
	/** Optional organization scope */
	organizationId?: string;
}>();

const { addTask, toggleTask, removeTask, clearCompleted, tasks: allTasks } = useQuickTasks();

const inputRef = ref<HTMLInputElement | null>(null);
const newTitle = ref('');
const newSchedule = ref<TaskSchedule>('today');
const newPriority = ref<TaskPriority>('medium');
const adding = ref(false);

const scheduleOptions = [
	{ value: 'today' as const, label: 'Today' },
	{ value: 'this_week' as const, label: 'Week' },
	{ value: 'later' as const, label: 'Later' },
];

const priorityOptions = [
	{ value: 'low' as const, label: 'Low', activeClass: 'bg-blue-500/10 text-blue-500 font-medium' },
	{ value: 'medium' as const, label: 'Med', activeClass: 'bg-yellow-500/10 text-yellow-600 font-medium' },
	{ value: 'high' as const, label: 'High', activeClass: 'bg-red-500/10 text-red-500 font-medium' },
];

// Filter tasks to show only those linked to this context
const tasks = computed(() => {
	if (!props.context || !props.contextId) return [];
	return allTasks.value.filter((t) => {
		switch (props.context) {
			case 'project': return t.projectId === props.contextId;
			case 'event': return t.projectEventId === props.contextId;
			case 'channel': return t.channelId === props.contextId;
			case 'ticket': return t.ticketId === props.contextId;
			case 'team': return t.teamId === props.contextId;
			case 'client': return t.clientId === props.contextId;
			default: return false;
		}
	});
});

const sortedTasks = computed(() => {
	// Active first, then completed
	const active = tasks.value.filter((t) => !t.completed);
	const done = tasks.value.filter((t) => t.completed);
	return [...active, ...done];
});

const completedCount = computed(() => tasks.value.filter((t) => t.completed).length);

async function handleAdd() {
	if (!newTitle.value.trim() || adding.value) return;
	adding.value = true;

	const contextOptions: Record<string, any> = {
		priority: newPriority.value,
		schedule: newSchedule.value,
	};

	// Link to context entity
	if (props.context && props.contextId) {
		switch (props.context) {
			case 'project': contextOptions.projectId = props.contextId; break;
			case 'event': contextOptions.projectEventId = props.contextId; break;
			case 'channel': contextOptions.channelId = props.contextId; break;
			case 'ticket': contextOptions.ticketId = props.contextId; break;
			case 'team': contextOptions.teamId = props.contextId; break;
			case 'client': contextOptions.clientId = props.contextId; break;
		}
	}

	try {
		await addTask(newTitle.value, contextOptions);
		newTitle.value = '';
		newPriority.value = 'medium';
		newSchedule.value = 'today';
		nextTick(() => inputRef.value?.focus());
	} finally {
		adding.value = false;
	}
}

async function handleToggle(id: string) {
	await toggleTask(id);
}

async function handleRemove(id: string) {
	await removeTask(id);
}

async function handleClearCompleted() {
	const completedIds = tasks.value.filter((t) => t.completed).map((t) => t.id);
	for (const id of completedIds) {
		await removeTask(id);
	}
}
</script>

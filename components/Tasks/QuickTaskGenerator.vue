<template>
	<div class="quick-tasks">
		<!-- Header -->
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-medium">Quick Tasks</h2>
			<div class="flex items-center gap-2">
				<button
					v-if="completedTasks.length"
					class="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
					@click="clearCompleted"
				>
					Clear done
				</button>
			</div>
		</div>

		<!-- Motivational text -->
		<Transition name="motivate">
			<div v-if="motivationalText" class="motivational-bar">
				<UIcon name="i-heroicons-sparkles" class="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
				<span>{{ motivationalText }}</span>
			</div>
		</Transition>

		<!-- Progress bar (when tasks exist) -->
		<div v-if="progress.total > 0" class="mb-4">
			<div class="flex items-center justify-between text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
				<span>{{ progress.completed }} of {{ progress.total }} done</span>
				<span>{{ Math.round(progress.pct * 100) }}%</span>
			</div>
			<div class="h-1.5 rounded-full bg-muted overflow-hidden">
				<div
					class="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500 ease-out"
					:style="{ width: `${progress.pct * 100}%` }"
				/>
			</div>
		</div>

		<!-- Add task input -->
		<div class="flex gap-2 mb-3">
			<input
				ref="inputRef"
				v-model="newTaskTitle"
				type="text"
				placeholder="Add a task..."
				class="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
				@keydown.enter="handleAddTask"
			/>
			<button
				class="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
				:disabled="!newTaskTitle.trim()"
				@click="handleAddTask"
			>
				Add
			</button>
		</div>

		<!-- Schedule + Priority selector (shown when typing) -->
		<div v-if="newTaskTitle.trim()" class="space-y-2 mb-4">
			<div class="flex items-center gap-2 text-xs">
				<span class="text-muted-foreground uppercase tracking-wide text-[9px] w-14">When:</span>
				<button
					v-for="s in schedules"
					:key="s.value"
					:class="[
						'px-2 py-0.5 rounded-full text-xs font-medium transition-colors border',
						newTaskSchedule === s.value ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
					]"
					@click="newTaskSchedule = s.value"
				>
					{{ s.label }}
				</button>
			</div>
			<div class="flex items-center gap-2 text-xs">
				<span class="text-muted-foreground uppercase tracking-wide text-[9px] w-14">Priority:</span>
				<button
					v-for="p in priorities"
					:key="p.value"
					:class="[
						'px-2 py-0.5 rounded-full text-xs font-medium transition-colors border',
						newTaskPriority === p.value ? p.activeClass : 'border-border text-muted-foreground hover:text-foreground'
					]"
					@click="newTaskPriority = p.value"
				>
					{{ p.label }}
				</button>
			</div>
		</div>

		<!-- AI Suggestions -->
		<div class="mb-4">
			<button
				class="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors group"
				:disabled="aiLoading"
				@click="showAiPrompt = !showAiPrompt"
			>
				<UIcon name="i-heroicons-sparkles" class="w-4 h-4 group-hover:text-primary transition-colors" />
				<span class="uppercase tracking-wide font-medium">AI Suggestions</span>
				<UIcon
					:name="showAiPrompt ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
					class="w-3 h-3"
				/>
			</button>

			<div v-if="showAiPrompt" class="mt-3 space-y-3">
				<div class="flex gap-2">
					<input
						v-model="aiPrompt"
						type="text"
						placeholder="What are you working on? (optional)"
						class="flex-1 h-8 rounded-lg border border-border bg-muted/30 px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
						@keydown.enter="fetchAiSuggestions"
					/>
					<button
						class="h-8 px-3 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
						:disabled="aiLoading"
						@click="fetchAiSuggestions"
					>
						<UIcon v-if="aiLoading" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
						<UIcon v-else name="i-heroicons-sparkles" class="w-3.5 h-3.5" />
						{{ aiLoading ? 'Thinking...' : 'Suggest' }}
					</button>
				</div>

				<!-- Suggestion chips -->
				<div v-if="aiSuggestions.length" class="space-y-1.5">
					<button
						v-for="(suggestion, i) in aiSuggestions"
						:key="i"
						class="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg bg-primary/5 border border-primary/10 text-sm hover:bg-primary/10 hover:border-primary/20 transition-colors group"
						@click="addAiSuggestion(suggestion)"
					>
						<UIcon name="i-heroicons-plus-circle" class="w-4 h-4 text-primary/60 group-hover:text-primary flex-shrink-0" />
						<span class="flex-1 text-foreground/80">{{ suggestion }}</span>
					</button>
				</div>

				<p v-if="aiError" class="text-xs text-destructive">{{ aiError }}</p>
			</div>
		</div>

		<!-- Task list grouped by schedule -->
		<div class="space-y-1">
			<!-- Today -->
			<template v-if="todayTasks.length">
				<div class="schedule-header">
					<UIcon name="i-heroicons-sun" class="w-3.5 h-3.5 text-amber-500" />
					<span>Today</span>
					<span class="schedule-count">{{ todayTasks.length }}</span>
				</div>
				<TaskRow
					v-for="task in todayTasks"
					:key="task.id"
					:task="task"
					@toggle="handleToggle(task.id)"
					@remove="removeTask(task.id)"
					@update-schedule="(s) => updateTask(task.id, { schedule: s })"
				/>
			</template>

			<!-- This Week -->
			<template v-if="thisWeekTasks.length">
				<div class="schedule-header" :class="{ 'mt-3': todayTasks.length }">
					<UIcon name="i-heroicons-calendar-days" class="w-3.5 h-3.5 text-blue-500" />
					<span>This Week</span>
					<span class="schedule-count">{{ thisWeekTasks.length }}</span>
				</div>
				<TaskRow
					v-for="task in thisWeekTasks"
					:key="task.id"
					:task="task"
					@toggle="handleToggle(task.id)"
					@remove="removeTask(task.id)"
					@update-schedule="(s) => updateTask(task.id, { schedule: s })"
				/>
			</template>

			<!-- Later -->
			<template v-if="laterTasks.length">
				<div class="schedule-header" :class="{ 'mt-3': todayTasks.length || thisWeekTasks.length }">
					<UIcon name="i-heroicons-clock" class="w-3.5 h-3.5 text-gray-400" />
					<span>Later</span>
					<span class="schedule-count">{{ laterTasks.length }}</span>
				</div>
				<TaskRow
					v-for="task in laterTasks"
					:key="task.id"
					:task="task"
					@toggle="handleToggle(task.id)"
					@remove="removeTask(task.id)"
					@update-schedule="(s) => updateTask(task.id, { schedule: s })"
				/>
			</template>

			<!-- Unscheduled -->
			<template v-if="unscheduledTasks.length">
				<div class="schedule-header" :class="{ 'mt-3': todayTasks.length || thisWeekTasks.length || laterTasks.length }">
					<UIcon name="i-heroicons-inbox" class="w-3.5 h-3.5 text-gray-400" />
					<span>Unscheduled</span>
					<span class="schedule-count">{{ unscheduledTasks.length }}</span>
				</div>
				<TaskRow
					v-for="task in unscheduledTasks"
					:key="task.id"
					:task="task"
					@toggle="handleToggle(task.id)"
					@remove="removeTask(task.id)"
					@update-schedule="(s) => updateTask(task.id, { schedule: s })"
				/>
			</template>

			<!-- Completed tasks -->
			<template v-if="completedTasks.length">
				<div class="schedule-header mt-3">
					<UIcon name="i-heroicons-check-circle" class="w-3.5 h-3.5 text-emerald-500" />
					<span>Completed</span>
					<span class="schedule-count">{{ completedTasks.length }}</span>
				</div>
				<div
					v-for="task in completedTasks"
					:key="task.id"
					class="task-row group"
				>
					<button class="task-check" @click="handleToggle(task.id)">
						<div class="task-check-box task-check-done">
							<UIcon name="i-heroicons-check" class="w-3 h-3 text-white" />
						</div>
					</button>
					<div class="flex-1 min-w-0">
						<span class="text-sm leading-snug line-through text-muted-foreground">{{ task.title }}</span>
					</div>
					<button
						class="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
						@click="removeTask(task.id)"
					>
						<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
					</button>
				</div>
			</template>

			<!-- Empty state -->
			<div v-if="!activeTasks.length && !completedTasks.length" class="py-8 text-center">
				<UIcon name="i-heroicons-clipboard-document-check" class="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
				<p class="text-sm text-muted-foreground">No tasks yet</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Add one above or try AI suggestions</p>
			</div>
		</div>
	</div>
</template>

<script setup>
import confetti from 'canvas-confetti';

const {
	activeTasks,
	completedTasks,
	todayTasks,
	thisWeekTasks,
	laterTasks,
	unscheduledTasks,
	progress,
	startingMotivation,
	addTask,
	removeTask,
	toggleTask,
	updateTask,
	clearCompleted,
} = useQuickTasks();

const inputRef = ref(null);
const newTaskTitle = ref('');
const newTaskPriority = ref('medium');
const newTaskSchedule = ref('today');
const showAiPrompt = ref(false);
const aiPrompt = ref('');
const aiSuggestions = ref([]);
const aiLoading = ref(false);
const aiError = ref('');
const motivationalText = ref('');
let motivationalTimeout = null;

const schedules = [
	{ value: 'today', label: 'Today' },
	{ value: 'this_week', label: 'This Week' },
	{ value: 'later', label: 'Later' },
];

const priorities = [
	{ value: 'low', label: 'Low', activeClass: 'border-blue-300 bg-blue-50 text-blue-600 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-400' },
	{ value: 'medium', label: 'Medium', activeClass: 'border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:border-yellow-700 dark:text-yellow-400' },
	{ value: 'high', label: 'High', activeClass: 'border-red-300 bg-red-50 text-red-600 dark:bg-red-950 dark:border-red-700 dark:text-red-400' },
];

// Show starting motivation when component mounts with active tasks
onMounted(() => {
	if (startingMotivation.value) {
		motivationalText.value = startingMotivation.value;
		motivationalTimeout = setTimeout(() => {
			motivationalText.value = '';
		}, 5000);
	}
});

onUnmounted(() => {
	if (motivationalTimeout) clearTimeout(motivationalTimeout);
});

function handleAddTask() {
	if (!newTaskTitle.value.trim()) return;
	addTask(newTaskTitle.value, {
		priority: newTaskPriority.value,
		schedule: newTaskSchedule.value,
	});
	newTaskTitle.value = '';
	newTaskPriority.value = 'medium';
	newTaskSchedule.value = 'today';
	nextTick(() => inputRef.value?.focus());
}

function handleToggle(id) {
	const result = toggleTask(id);

	if (result.completed) {
		// Fire confetti
		fireConfetti();

		// Show motivational message
		if (motivationalTimeout) clearTimeout(motivationalTimeout);
		motivationalText.value = result.motivationalMessage;
		motivationalTimeout = setTimeout(() => {
			motivationalText.value = '';
		}, 4000);
	}
}

function fireConfetti() {
	// Small burst from center
	confetti({
		particleCount: 60,
		spread: 55,
		origin: { y: 0.7 },
		colors: ['#6366f1', '#8b5cf6', '#a855f7', '#22c55e', '#eab308'],
		disableForReducedMotion: true,
	});
}

function addAiSuggestion(suggestion) {
	addTask(suggestion, { aiSuggested: true, schedule: 'today' });
	aiSuggestions.value = aiSuggestions.value.filter((s) => s !== suggestion);
}

async function fetchAiSuggestions() {
	aiLoading.value = true;
	aiError.value = '';
	aiSuggestions.value = [];

	try {
		const existingTasks = activeTasks.value.map((t) => t.title);
		const response = await $fetch('/api/ai/task-suggestions', {
			method: 'POST',
			body: {
				prompt: aiPrompt.value || undefined,
				existingTasks: existingTasks.length ? existingTasks : undefined,
			},
		});
		aiSuggestions.value = response.suggestions || [];
	} catch (err) {
		aiError.value = 'Could not generate suggestions. Please try again.';
		console.error('AI suggestions error:', err);
	} finally {
		aiLoading.value = false;
	}
}

// ── TaskRow sub-component ──
const TaskRow = defineComponent({
	props: {
		task: { type: Object, required: true },
	},
	emits: ['toggle', 'remove', 'update-schedule'],
	setup(props, { emit }) {
		const showScheduleMenu = ref(false);

		const scheduleOptions = [
			{ value: 'today', label: 'Today', icon: 'i-heroicons-sun' },
			{ value: 'this_week', label: 'This Week', icon: 'i-heroicons-calendar-days' },
			{ value: 'later', label: 'Later', icon: 'i-heroicons-clock' },
		];

		return () =>
			h('div', { class: 'task-row group' }, [
				h('button', { class: 'task-check', onClick: () => emit('toggle') }, [
					h('div', { class: 'task-check-box' }),
				]),
				h('div', { class: 'flex-1 min-w-0' }, [
					h('span', { class: 'text-sm leading-snug' }, props.task.title),
					h('div', { class: 'flex items-center gap-2 mt-0.5' }, [
						props.task.priority !== 'medium'
							? h('span', {
								class: [
									'text-[8px] uppercase tracking-wider font-semibold',
									props.task.priority === 'high' ? 'text-red-500' : 'text-blue-400',
								].join(' '),
							}, props.task.priority)
							: null,
						props.task.aiSuggested
							? h(resolveComponent('UIcon'), { name: 'i-heroicons-sparkles', class: 'w-3 h-3 text-violet-400' })
							: null,
					]),
				]),
				// Schedule quick-change button
				h('div', { class: 'relative' }, [
					h('button', {
						class: 'opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-primary text-[8px] uppercase tracking-wider',
						onClick: () => { showScheduleMenu.value = !showScheduleMenu.value; },
					}, [
						h(resolveComponent('UIcon'), { name: 'i-heroicons-calendar', class: 'w-3.5 h-3.5' }),
					]),
					showScheduleMenu.value
						? h('div', {
							class: 'absolute right-0 top-6 z-10 bg-card border border-border rounded-lg shadow-lg p-1 min-w-[100px]',
						}, scheduleOptions.map((opt) =>
							h('button', {
								class: [
									'flex items-center gap-2 w-full px-2 py-1 rounded text-xs hover:bg-muted transition-colors',
									props.task.schedule === opt.value ? 'text-primary font-medium' : 'text-foreground/70',
								].join(' '),
								onClick: () => {
									emit('update-schedule', opt.value);
									showScheduleMenu.value = false;
								},
							}, [
								h(resolveComponent('UIcon'), { name: opt.icon, class: 'w-3.5 h-3.5' }),
								opt.label,
							]),
						))
						: null,
				]),
				h('button', {
					class: 'opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive',
					onClick: () => emit('remove'),
				}, [
					h(resolveComponent('UIcon'), { name: 'i-heroicons-x-mark', class: 'w-3.5 h-3.5' }),
				]),
			]);
	},
});
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.quick-tasks {
	padding: 0;
}

/* Motivational bar */
.motivational-bar {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 10px;
	margin-bottom: 12px;
	border-radius: 8px;
	background: linear-gradient(135deg, hsl(var(--primary) / 0.06), hsl(45 100% 50% / 0.06));
	border: 1px solid hsl(45 100% 50% / 0.15);
	font-size: 12px;
	color: hsl(var(--foreground) / 0.8);
	font-weight: 500;
}

.motivate-enter-active {
	transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.motivate-leave-active {
	transition: all 0.3s ease;
}
.motivate-enter-from {
	opacity: 0;
	transform: translateY(-8px);
}
.motivate-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}

/* Schedule headers */
.schedule-header {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 8px 2px;
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: hsl(var(--muted-foreground));
}

.schedule-count {
	font-size: 9px;
	font-weight: 500;
	color: hsl(var(--muted-foreground) / 0.6);
	background: hsl(var(--muted) / 0.5);
	padding: 0 5px;
	border-radius: 9999px;
	line-height: 1.6;
}

.task-row {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 6px 8px;
	border-radius: 8px;
	transition: background 0.15s;
}

.task-row:hover {
	background: hsl(var(--muted) / 0.3);
}

.task-check {
	flex-shrink: 0;
	padding: 2px 0 0;
}

.task-check-box {
	width: 18px;
	height: 18px;
	border-radius: 6px;
	border: 2px solid hsl(var(--border));
	transition: all 0.15s;
	display: flex;
	align-items: center;
	justify-content: center;
}

.task-check:hover .task-check-box {
	border-color: hsl(var(--primary));
}

.task-check-done {
	background: hsl(var(--primary));
	border-color: hsl(var(--primary));
}
</style>

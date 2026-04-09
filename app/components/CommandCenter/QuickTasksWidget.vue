<template>
	<div class="ios-card p-5">
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-clipboard-document-check" class="w-5 h-5 text-primary" />
				<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Quick Tasks</h3>
			</div>
			<div class="flex items-center gap-3">
				<!-- View toggle: list vs grouped -->
				<div class="flex gap-0.5 p-0.5 bg-muted/40 rounded-lg">
					<button
						@click="viewMode = 'list'"
						class="px-2 py-1 rounded-md text-[10px] font-medium transition-all"
						:class="viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
					>
						List
					</button>
					<button
						@click="viewMode = 'grouped'"
						class="px-2 py-1 rounded-md text-[10px] font-medium transition-all"
						:class="viewMode === 'grouped' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
					>
						Grouped
					</button>
				</div>
				<nuxt-link to="/tasks" class="text-xs text-primary hover:underline">
					View all &rarr;
				</nuxt-link>
			</div>
		</div>

		<!-- Completion Stats Bar -->
		<div v-if="tasks.length > 0" class="mb-4">
			<!-- Daily/Weekly progress -->
			<div class="flex items-center gap-3 mb-2">
				<div class="flex-1">
					<div class="flex items-center justify-between mb-1">
						<span class="text-xs font-medium text-foreground/80">
							Today: {{ todayStats.completed }}/{{ todayStats.total }} done
						</span>
						<span class="text-[10px] text-muted-foreground">
							{{ todayStats.pct }}%
						</span>
					</div>
					<div class="h-1.5 rounded-full bg-muted/40 overflow-hidden">
						<div
							class="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
							:style="{ width: `${todayStats.pct}%` }"
						/>
					</div>
				</div>
				<div class="w-px h-8 bg-border" />
				<div class="flex-1">
					<div class="flex items-center justify-between mb-1">
						<span class="text-xs font-medium text-foreground/80">
							This week: {{ weekStats.completed }}/{{ weekStats.total }}
						</span>
						<span class="text-[10px] text-muted-foreground">
							{{ weekStats.pct }}%
						</span>
					</div>
					<div class="h-1.5 rounded-full bg-muted/40 overflow-hidden">
						<div
							class="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500"
							:style="{ width: `${weekStats.pct}%` }"
						/>
					</div>
				</div>
			</div>

			<!-- Motivational text -->
			<Transition name="widget-motivate">
				<div v-if="motivationalText" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-primary/5 text-xs text-foreground/70 font-medium">
					<UIcon name="i-heroicons-sparkles" class="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
					{{ motivationalText }}
				</div>
			</Transition>
		</div>

		<!-- Quick Add (always visible) -->
		<div class="flex gap-2 mb-4">
			<input
				v-model="newTaskTitle"
				type="text"
				placeholder="Add a quick task..."
				class="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
				@keydown.enter="handleAddTask"
			/>
			<USelectMenu
				v-model="newTaskSchedule"
				:options="scheduleOptions"
				option-attribute="label"
				value-attribute="value"
				size="xs"
				class="w-24"
			/>
			<button
				class="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
				:disabled="!newTaskTitle.trim()"
				@click="handleAddTask"
			>
				Add
			</button>
		</div>

		<!-- Empty State -->
		<div v-if="tasks.length === 0" class="space-y-4">
			<div class="text-center py-6">
				<UIcon name="i-heroicons-clipboard-document-check" class="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
				<p class="text-sm text-muted-foreground">No tasks yet</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Add tasks above or let AI suggest some</p>
			</div>

			<!-- AI suggest button -->
			<button
				class="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-gradient-to-r from-violet-500/10 to-purple-600/10 border border-primary/15 text-xs font-medium text-primary hover:from-violet-500/15 hover:to-purple-600/15 transition-all disabled:opacity-50"
				:disabled="aiLoading"
				@click="showAiSuggestions ? (showAiSuggestions = false) : fetchAiSuggestions()"
			>
				<UIcon v-if="aiLoading" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
				<UIcon v-else name="i-heroicons-sparkles" class="w-3.5 h-3.5" />
				{{ aiLoading ? 'Generating...' : showAiSuggestions ? 'Hide suggestions' : 'Generate tasks with AI' }}
			</button>

			<!-- AI suggestions (collapsible) -->
			<Transition name="widget-motivate">
				<div v-if="showAiSuggestions && aiSuggestions.length" class="space-y-1.5">
					<button
						v-for="(suggestion, i) in aiSuggestions"
						:key="i"
						class="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg bg-primary/5 border border-primary/10 text-xs hover:bg-primary/10 hover:border-primary/20 transition-colors group"
						@click="addAiSuggestion(suggestion)"
					>
						<UIcon name="i-heroicons-plus-circle" class="w-4 h-4 text-primary/60 group-hover:text-primary flex-shrink-0" />
						<span class="flex-1 text-foreground/80 line-clamp-2">{{ suggestion }}</span>
					</button>
				</div>
			</Transition>
		</div>

		<!-- Task List: List View -->
		<div v-else-if="viewMode === 'list'" class="space-y-1">
			<div
				v-for="task in displayTasks"
				:key="task.id"
				class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors group"
			>
				<button class="flex-shrink-0" @click="handleToggle(task.id)">
					<div v-if="task.completed" class="w-4 h-4 rounded-[5px] bg-primary flex items-center justify-center">
						<UIcon name="i-heroicons-check" class="w-2.5 h-2.5 text-white" />
					</div>
					<div v-else class="w-4 h-4 rounded-[5px] border-2 border-border hover:border-primary transition-colors" />
				</button>
				<span
					class="flex-1 text-xs truncate"
					:class="task.completed ? 'line-through text-muted-foreground' : 'text-foreground'"
					v-html="task.title"
				/>
				<span v-if="!task.completed && task.schedule" class="text-[8px] text-muted-foreground uppercase tracking-wider flex-shrink-0 px-1.5 py-0.5 bg-muted/40 rounded">
					{{ scheduleLabel(task.schedule) }}
				</span>
				<button
					class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
					@click="removeTask(task.id)"
				>
					<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
				</button>
			</div>

			<!-- Overflow indicator -->
			<div v-if="activeTasks.length > 15" class="text-center pt-2">
				<nuxt-link to="/tasks" class="text-[10px] text-primary hover:underline uppercase tracking-wider">
					+{{ activeTasks.length - 15 }} more tasks
				</nuxt-link>
			</div>

			<!-- Clear completed -->
			<div v-if="completedTasks.length > 0" class="flex items-center justify-between pt-2 mt-2 border-t border-border/50">
				<span class="text-[10px] text-muted-foreground">{{ completedTasks.length }} completed</span>
				<button
					class="text-[10px] text-primary hover:underline"
					@click="clearCompleted"
				>
					Clear completed
				</button>
			</div>
		</div>

		<!-- Task List: Grouped View -->
		<div v-else class="space-y-4">
			<!-- Today -->
			<div v-if="todayTasks.length > 0 || todayCompleted.length > 0">
				<div class="flex items-center gap-2 mb-2">
					<UIcon name="i-heroicons-sun" class="w-3.5 h-3.5 text-amber-500" />
					<span class="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Today</span>
					<span class="text-[10px] text-muted-foreground">({{ todayCompleted.length }}/{{ todayTasks.length + todayCompleted.length }})</span>
				</div>
				<div class="space-y-0.5 pl-1">
					<div
						v-for="task in [...todayTasks, ...todayCompleted].slice(0, 8)"
						:key="task.id"
						class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors group"
					>
						<button class="flex-shrink-0" @click="handleToggle(task.id)">
							<div v-if="task.completed" class="w-4 h-4 rounded-[5px] bg-primary flex items-center justify-center">
								<UIcon name="i-heroicons-check" class="w-2.5 h-2.5 text-white" />
							</div>
							<div v-else class="w-4 h-4 rounded-[5px] border-2 border-border hover:border-primary transition-colors" />
						</button>
						<span
							class="flex-1 text-xs truncate"
							:class="task.completed ? 'line-through text-muted-foreground' : 'text-foreground'"
							v-html="task.title"
						/>
						<button
							class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
							@click="removeTask(task.id)"
						>
							<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
						</button>
					</div>
				</div>
			</div>

			<!-- This Week -->
			<div v-if="thisWeekTasks.length > 0 || weekCompleted.length > 0">
				<div class="flex items-center gap-2 mb-2">
					<UIcon name="i-heroicons-calendar-days" class="w-3.5 h-3.5 text-blue-500" />
					<span class="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">This Week</span>
					<span class="text-[10px] text-muted-foreground">({{ weekCompleted.length }}/{{ thisWeekTasks.length + weekCompleted.length }})</span>
				</div>
				<div class="space-y-0.5 pl-1">
					<div
						v-for="task in [...thisWeekTasks, ...weekCompleted].slice(0, 6)"
						:key="task.id"
						class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors group"
					>
						<button class="flex-shrink-0" @click="handleToggle(task.id)">
							<div v-if="task.completed" class="w-4 h-4 rounded-[5px] bg-primary flex items-center justify-center">
								<UIcon name="i-heroicons-check" class="w-2.5 h-2.5 text-white" />
							</div>
							<div v-else class="w-4 h-4 rounded-[5px] border-2 border-border hover:border-primary transition-colors" />
						</button>
						<span
							class="flex-1 text-xs truncate"
							:class="task.completed ? 'line-through text-muted-foreground' : 'text-foreground'"
							v-html="task.title"
						/>
						<button
							class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
							@click="removeTask(task.id)"
						>
							<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
						</button>
					</div>
				</div>
			</div>

			<!-- Later / Unscheduled -->
			<div v-if="laterTasks.length > 0 || unscheduledTasks.length > 0">
				<div class="flex items-center gap-2 mb-2">
					<UIcon name="i-heroicons-clock" class="w-3.5 h-3.5 text-muted-foreground" />
					<span class="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Later</span>
					<span class="text-[10px] text-muted-foreground">({{ laterTasks.length + unscheduledTasks.length }})</span>
				</div>
				<div class="space-y-0.5 pl-1">
					<div
						v-for="task in [...laterTasks, ...unscheduledTasks].slice(0, 4)"
						:key="task.id"
						class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors group"
					>
						<button class="flex-shrink-0" @click="handleToggle(task.id)">
							<div v-if="task.completed" class="w-4 h-4 rounded-[5px] bg-primary flex items-center justify-center">
								<UIcon name="i-heroicons-check" class="w-2.5 h-2.5 text-white" />
							</div>
							<div v-else class="w-4 h-4 rounded-[5px] border-2 border-border hover:border-primary transition-colors" />
						</button>
						<span class="flex-1 text-xs truncate text-foreground" v-html="task.title" />
						<button
							class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
							@click="removeTask(task.id)"
						>
							<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
						</button>
					</div>
				</div>
			</div>

			<!-- Empty grouped state -->
			<div v-if="activeTasks.length === 0 && completedTasks.length > 0" class="text-center py-4">
				<UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-1 text-green-500" />
				<p class="text-xs font-medium text-foreground">All tasks completed!</p>
				<button class="text-[10px] text-primary hover:underline mt-1" @click="clearCompleted">
					Clear {{ completedTasks.length }} completed
				</button>
			</div>
		</div>

		<!-- AI Suggest (when tasks exist) -->
		<div v-if="tasks.length > 0" class="mt-3 pt-3 border-t border-border/30">
			<button
				class="w-full flex items-center justify-center gap-2 h-8 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50"
				:disabled="aiLoading"
				@click="showAiSuggestions ? (showAiSuggestions = false) : fetchAiSuggestions()"
			>
				<UIcon v-if="aiLoading" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
				<UIcon v-else name="i-heroicons-sparkles" class="w-3.5 h-3.5" />
				{{ aiLoading ? 'Generating...' : showAiSuggestions ? 'Hide suggestions' : 'Suggest tasks with AI' }}
			</button>

			<!-- AI suggestions (collapsible) -->
			<Transition name="widget-motivate">
				<div v-if="showAiSuggestions && aiSuggestions.length" class="space-y-1.5 mt-2">
					<button
						v-for="(suggestion, i) in aiSuggestions"
						:key="i"
						class="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg bg-primary/5 border border-primary/10 text-xs hover:bg-primary/10 hover:border-primary/20 transition-colors group"
						@click="addAiSuggestion(suggestion)"
					>
						<UIcon name="i-heroicons-plus-circle" class="w-4 h-4 text-primary/60 group-hover:text-primary flex-shrink-0" />
						<span class="flex-1 text-foreground/80 line-clamp-2">{{ suggestion }}</span>
					</button>
				</div>
			</Transition>
		</div>
	</div>
</template>

<script setup>
import confetti from 'canvas-confetti';


const {
	tasks,
	activeTasks,
	completedTasks,
	todayTasks,
	thisWeekTasks,
	laterTasks,
	unscheduledTasks,
	progress,
	addTask,
	removeTask,
	toggleTask,
	clearCompleted,
} = useQuickTasks();

const viewMode = ref('list');
const newTaskTitle = ref('');
const newTaskSchedule = ref('today');
const aiLoading = ref(false);
const aiSuggestions = ref([]);
const showAiSuggestions = ref(false);
const motivationalText = ref('');
let motivationalTimeout = null;

const scheduleOptions = [
	{ label: 'Today', value: 'today' },
	{ label: 'This Week', value: 'this_week' },
	{ label: 'Later', value: 'later' },
];

// Display tasks: active sorted by schedule, then completed (list view)
const displayTasks = computed(() => {
	const schedulePriority = { today: 0, this_week: 1, later: 2, unscheduled: 3 };
	const active = [...activeTasks.value]
		.sort((a, b) => (schedulePriority[a.schedule] ?? 3) - (schedulePriority[b.schedule] ?? 3))
		.slice(0, 15);
	const remaining = 15 - active.length;
	const completed = remaining > 0 ? completedTasks.value.slice(0, remaining) : [];
	return [...active, ...completed];
});

// Completed tasks for grouped view
const todayCompleted = computed(() =>
	completedTasks.value.filter((t) => t.schedule === 'today'),
);
const weekCompleted = computed(() =>
	completedTasks.value.filter((t) => t.schedule === 'this_week'),
);

// Stats
const todayStats = computed(() => {
	const todayActive = todayTasks.value.length;
	const todayDone = todayCompleted.value.length;
	const total = todayActive + todayDone;
	return {
		total,
		completed: todayDone,
		pct: total > 0 ? Math.round((todayDone / total) * 100) : 0,
	};
});

const weekStats = computed(() => {
	// "This week" includes today + this_week schedule
	const allActive = todayTasks.value.length + thisWeekTasks.value.length;
	const allDone = todayCompleted.value.length + weekCompleted.value.length;
	const total = allActive + allDone;
	return {
		total,
		completed: allDone,
		pct: total > 0 ? Math.round((allDone / total) * 100) : 0,
	};
});

function scheduleLabel(schedule) {
	const labels = { today: 'Today', this_week: 'Week', later: 'Later', unscheduled: '' };
	return labels[schedule] || '';
}

function handleAddTask() {
	if (!newTaskTitle.value.trim()) return;
	addTask(newTaskTitle.value, { schedule: newTaskSchedule.value });
	newTaskTitle.value = '';
}

function handleToggle(id) {
	const result = toggleTask(id);
	if (result.completed) {
		confetti({
			particleCount: 40,
			spread: 45,
			origin: { y: 0.6 },
			colors: ['#6366f1', '#8b5cf6', '#22c55e', '#eab308'],
			disableForReducedMotion: true,
		});
		if (motivationalTimeout) clearTimeout(motivationalTimeout);
		motivationalText.value = result.motivationalMessage;
		motivationalTimeout = setTimeout(() => {
			motivationalText.value = '';
		}, 4000);
	}
}

function addAiSuggestion(suggestion) {
	addTask(suggestion, { aiSuggested: true, schedule: 'today' });
	aiSuggestions.value = aiSuggestions.value.filter((s) => s !== suggestion);
}

async function fetchAiSuggestions() {
	aiLoading.value = true;
	showAiSuggestions.value = true;
	aiSuggestions.value = [];
	try {
		const response = await $fetch('/api/ai/task-suggestions', {
			method: 'POST',
			body: {},
		});
		aiSuggestions.value = response.suggestions || [];
	} catch (err) {
		console.error('AI suggestions error:', err);
		showAiSuggestions.value = false;
	} finally {
		aiLoading.value = false;
	}
}

onUnmounted(() => {
	if (motivationalTimeout) clearTimeout(motivationalTimeout);
});
</script>

<style scoped>
.widget-motivate-enter-active {
	transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.widget-motivate-leave-active {
	transition: all 0.2s ease;
}
.widget-motivate-enter-from,
.widget-motivate-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}
</style>

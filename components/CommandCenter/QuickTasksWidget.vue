<template>
	<div class="ios-card p-5">
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-clipboard-document-check" class="w-5 h-5 text-primary" />
				<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Quick Tasks</h3>
			</div>
			<nuxt-link to="/tasks" class="text-xs text-primary hover:underline">
				View all &rarr;
			</nuxt-link>
		</div>

		<!-- If user has no tasks: show generator -->
		<div v-if="tasks.length === 0" class="space-y-4">
			<div class="text-center py-4">
				<UIcon name="i-heroicons-clipboard-document-check" class="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
				<p class="text-sm text-muted-foreground">No tasks yet</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Add tasks or let AI suggest some</p>
			</div>

			<!-- Quick add -->
			<div class="flex gap-2">
				<input
					v-model="newTaskTitle"
					type="text"
					placeholder="Add a quick task..."
					class="flex-1 h-8 rounded-lg border border-border bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
					@keydown.enter="handleAddTask"
				/>
				<button
					class="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
					:disabled="!newTaskTitle.trim()"
					@click="handleAddTask"
				>
					Add
				</button>
			</div>

			<!-- AI suggest button -->
			<button
				class="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-gradient-to-r from-violet-500/10 to-purple-600/10 border border-primary/15 text-xs font-medium text-primary hover:from-violet-500/15 hover:to-purple-600/15 transition-all disabled:opacity-50"
				:disabled="aiLoading"
				@click="fetchAiSuggestions"
			>
				<UIcon v-if="aiLoading" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
				<UIcon v-else name="i-heroicons-sparkles" class="w-3.5 h-3.5" />
				{{ aiLoading ? 'Generating...' : 'Generate tasks with AI' }}
			</button>

			<!-- AI suggestions -->
			<div v-if="aiSuggestions.length" class="space-y-1.5">
				<button
					v-for="(suggestion, i) in aiSuggestions"
					:key="i"
					class="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg bg-primary/5 border border-primary/10 text-xs hover:bg-primary/10 hover:border-primary/20 transition-colors group"
					@click="addAiSuggestion(suggestion)"
				>
					<UIcon name="i-heroicons-plus-circle" class="w-4 h-4 text-primary/60 group-hover:text-primary flex-shrink-0" />
					<span class="flex-1 text-foreground/80">{{ suggestion }}</span>
				</button>
			</div>
		</div>

		<!-- If user has tasks: show top 10 -->
		<div v-else class="space-y-1">
			<!-- Motivational text -->
			<Transition name="widget-motivate">
				<div v-if="motivationalText" class="flex items-center gap-1.5 px-2 py-1.5 mb-2 rounded-lg bg-primary/5 text-xs text-foreground/70 font-medium">
					<UIcon name="i-heroicons-sparkles" class="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
					{{ motivationalText }}
				</div>
			</Transition>

			<!-- Progress mini-bar -->
			<div v-if="progress.total > 0" class="flex items-center gap-2 mb-3 px-1">
				<div class="flex-1 h-1 rounded-full bg-muted overflow-hidden">
					<div
						class="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
						:style="{ width: `${progress.pct * 100}%` }"
					/>
				</div>
				<span class="text-[9px] text-muted-foreground uppercase tracking-wider">{{ progress.completed }}/{{ progress.total }}</span>
			</div>

			<!-- Task list -->
			<div
				v-for="task in topTasks"
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
				>
					{{ task.title }}
				</span>
				<span v-if="!task.completed && task.schedule" class="text-[8px] text-muted-foreground uppercase tracking-wider flex-shrink-0">
					{{ scheduleLabel(task.schedule) }}
				</span>
			</div>

			<!-- Overflow indicator -->
			<div v-if="activeTasks.length > 10" class="text-center pt-2">
				<nuxt-link to="/tasks" class="text-[10px] text-primary hover:underline uppercase tracking-wider">
					+{{ activeTasks.length - 10 }} more tasks
				</nuxt-link>
			</div>
		</div>
	</div>
</template>

<script setup>
import confetti from 'canvas-confetti';

const {
	tasks,
	activeTasks,
	completedTasks,
	progress,
	addTask,
	toggleTask,
} = useQuickTasks();

const newTaskTitle = ref('');
const aiLoading = ref(false);
const aiSuggestions = ref([]);
const motivationalText = ref('');
let motivationalTimeout = null;

// Top 10 tasks: active first (sorted by schedule priority), then completed
const topTasks = computed(() => {
	const schedulePriority = { today: 0, this_week: 1, later: 2, unscheduled: 3 };
	const active = [...activeTasks.value]
		.sort((a, b) => (schedulePriority[a.schedule] ?? 3) - (schedulePriority[b.schedule] ?? 3))
		.slice(0, 10);
	const remaining = 10 - active.length;
	const completed = remaining > 0 ? completedTasks.value.slice(0, remaining) : [];
	return [...active, ...completed];
});

function scheduleLabel(schedule) {
	const labels = { today: 'Today', this_week: 'Week', later: 'Later', unscheduled: '' };
	return labels[schedule] || '';
}

function handleAddTask() {
	if (!newTaskTitle.value.trim()) return;
	addTask(newTaskTitle.value, { schedule: 'today' });
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
		motivationalTimeout = setTimeout(() => { motivationalText.value = ''; }, 4000);
	}
}

function addAiSuggestion(suggestion) {
	addTask(suggestion, { aiSuggested: true, schedule: 'today' });
	aiSuggestions.value = aiSuggestions.value.filter((s) => s !== suggestion);
}

async function fetchAiSuggestions() {
	aiLoading.value = true;
	aiSuggestions.value = [];
	try {
		const response = await $fetch('/api/ai/task-suggestions', {
			method: 'POST',
			body: {},
		});
		aiSuggestions.value = response.suggestions || [];
	} catch (err) {
		console.error('AI suggestions error:', err);
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

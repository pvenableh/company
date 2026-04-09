<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Goals | Earnest' });

const { goals, activeGoals, completedGoals, goalsByType, overdueGoals, isLoading, createGoal, updateGoal, deleteGoal, recordSnapshot, goalProgress, refresh } = useGoals();

const activeTab = ref('all');
const showCreateModal = ref(false);
const editingGoal = ref(null);
const showProgressModal = ref(false);
const progressGoal = ref(null);
const progressValue = ref(0);
const progressNotes = ref('');
const savingProgress = ref(false);

const toast = useToast();

// AI Suggestions
const showAISuggestions = ref(false);
const aiSuggestions = ref([]);
const loadingSuggestions = ref(false);
const aiContext = ref('');

const fetchAISuggestions = async () => {
	loadingSuggestions.value = true;
	showAISuggestions.value = true;
	try {
		const { suggestions } = await $fetch('/api/ai/goal-suggestions', {
			method: 'POST',
			body: {
				existingGoals: goals.value.map(g => ({ title: g.title, type: g.type })),
				context: aiContext.value || undefined,
			},
		});
		aiSuggestions.value = suggestions;
	} catch {
		toast.add({ title: 'Error', description: 'Failed to generate suggestions', color: 'error' });
	} finally {
		loadingSuggestions.value = false;
	}
};

const skipFormReset = ref(false);

const adoptSuggestion = (suggestion: any) => {
	editingGoal.value = null;
	skipFormReset.value = true;
	goalForm.value = {
		title: suggestion.title || '',
		description: suggestion.description || '',
		type: suggestion.type || 'custom',
		target_value: suggestion.target_value || null,
		target_unit: suggestion.target_unit || 'USD',
		current_value: 0,
		start_date: new Date().toISOString().split('T')[0],
		end_date: '',
		timeframe: suggestion.timeframe || 'quarterly',
		priority: suggestion.priority || 'medium',
		status: 'active',
	};
	showCreateModal.value = true;
	// Remove from suggestions list
	aiSuggestions.value = aiSuggestions.value.filter((s: any) => s !== suggestion);
};

const goalTypeOptions = [
	{ label: 'Financial', value: 'financial', icon: 'i-heroicons-banknotes' },
	{ label: 'Networking', value: 'networking', icon: 'i-heroicons-user-group' },
	{ label: 'Performance', value: 'performance', icon: 'i-heroicons-chart-bar' },
	{ label: 'Marketing', value: 'marketing', icon: 'i-heroicons-megaphone' },
	{ label: 'Custom', value: 'custom', icon: 'i-heroicons-flag' },
];

const goalUnitOptions = [
	{ label: 'USD ($)', value: 'USD' },
	{ label: 'Percent (%)', value: 'percent' },
	{ label: 'Contacts', value: 'contacts' },
	{ label: 'Projects', value: 'projects' },
	{ label: 'Tasks', value: 'tasks' },
	{ label: 'Campaigns', value: 'campaigns' },
	{ label: 'Custom', value: '' },
];

const defaultForm = () => ({
	title: '',
	description: '',
	type: 'financial',
	target_value: null,
	target_unit: 'USD',
	current_value: 0,
	start_date: new Date().toISOString().split('T')[0],
	end_date: '',
	timeframe: 'quarterly',
	priority: 'medium',
	status: 'active',
});

const goalForm = ref(defaultForm());

watch(showCreateModal, (open) => {
	if (open && skipFormReset.value) {
		skipFormReset.value = false;
		return;
	} else if (open && editingGoal.value) {
		const g = editingGoal.value;
		goalForm.value = {
			title: g.title || '',
			description: g.description || '',
			type: g.type || 'financial',
			target_value: g.target_value,
			target_unit: g.target_unit || 'USD',
			current_value: g.current_value || 0,
			start_date: g.start_date || '',
			end_date: g.end_date || '',
			timeframe: g.timeframe || 'quarterly',
			priority: g.priority || 'medium',
			status: g.status || 'active',
		};
	} else if (open) {
		goalForm.value = defaultForm();
	}
});

const tabs = [
	{ label: 'All', value: 'all' },
	{ label: 'Active', value: 'active' },
	{ label: 'Completed', value: 'completed' },
	{ label: 'Financial', value: 'financial' },
	{ label: 'Networking', value: 'networking' },
	{ label: 'Performance', value: 'performance' },
	{ label: 'Marketing', value: 'marketing' },
];

const filteredGoals = computed(() => {
	switch (activeTab.value) {
		case 'active': return activeGoals.value;
		case 'completed': return completedGoals.value;
		case 'financial':
		case 'networking':
		case 'performance':
		case 'marketing':
			return goalsByType.value[activeTab.value] || [];
		default: return goals.value;
	}
});

const stats = computed(() => ({
	total: goals.value.length,
	active: activeGoals.value.length,
	completed: completedGoals.value.length,
	overdue: overdueGoals.value.length,
	avgProgress: activeGoals.value.length
		? Math.round(activeGoals.value.reduce((sum, g) => sum + goalProgress(g), 0) / activeGoals.value.length)
		: 0,
}));

const handleSaveGoal = async () => {
	if (!goalForm.value.title.trim()) return;
	try {
		if (editingGoal.value?.id) {
			await updateGoal(editingGoal.value.id, goalForm.value);
			toast.add({ title: 'Goal updated', color: 'success' });
		} else {
			await createGoal(goalForm.value);
			toast.add({ title: 'Goal created', color: 'success' });
		}
		showCreateModal.value = false;
		editingGoal.value = null;
	} catch (err) {
		toast.add({ title: 'Error', description: 'Failed to save goal', color: 'error' });
	}
};

const handleEdit = (goal) => {
	editingGoal.value = goal;
	showCreateModal.value = true;
};

const handleDelete = async (goal) => {
	await deleteGoal(goal.id);
	toast.add({ title: 'Goal deleted', color: 'neutral' });
};

const openProgressUpdate = (goal) => {
	progressGoal.value = goal;
	progressValue.value = goal.current_value || 0;
	progressNotes.value = '';
	showProgressModal.value = true;
};

const saveProgress = async () => {
	if (!progressGoal.value) return;
	savingProgress.value = true;
	try {
		await recordSnapshot(progressGoal.value.id, progressValue.value, progressNotes.value);
		toast.add({ title: 'Progress updated', color: 'success' });
		showProgressModal.value = false;
		progressGoal.value = null;
	} catch {
		toast.add({ title: 'Error', description: 'Failed to update progress', color: 'error' });
	} finally {
		savingProgress.value = false;
	}
};
</script>

<template>
	<div class="p-4 md:p-6 max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<h1 class="text-xl font-semibold">Goals</h1>
			<div class="flex items-center gap-2">
				<button
					@click="fetchAISuggestions"
					:disabled="loadingSuggestions"
					class="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-500/10 transition-colors"
				>
					<UIcon :name="loadingSuggestions ? 'i-heroicons-arrow-path' : 'i-heroicons-sparkles'" class="w-4 h-4" :class="loadingSuggestions ? 'animate-spin' : ''" />
					AI Suggest
				</button>
				<button
					@click="editingGoal = null; showCreateModal = true"
					class="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
				>
					<UIcon name="i-heroicons-plus" class="w-4 h-4" />
					New Goal
				</button>
			</div>
		</div>

		<!-- AI Suggestions Panel -->
		<Transition name="fade">
			<div v-if="showAISuggestions" class="mb-6">
				<div class="ios-card p-4">
					<div class="flex items-center justify-between mb-3">
						<div class="flex items-center gap-2">
							<UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-amber-500" />
							<h3 class="text-sm font-semibold text-foreground">AI-Suggested Goals</h3>
						</div>
						<button @click="showAISuggestions = false; aiSuggestions = []" class="text-xs text-muted-foreground hover:text-foreground">
							Dismiss
						</button>
					</div>

					<!-- Context input -->
					<div class="flex gap-2 mb-3">
						<input
							v-model="aiContext"
							type="text"
							placeholder="Optional: describe your focus (e.g., 'grow revenue', 'expand network')"
							class="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
							@keydown.enter="fetchAISuggestions"
						/>
						<button
							@click="fetchAISuggestions"
							:disabled="loadingSuggestions"
							class="px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors"
						>
							{{ loadingSuggestions ? 'Thinking...' : 'Refresh' }}
						</button>
					</div>

					<!-- Loading -->
					<div v-if="loadingSuggestions && !aiSuggestions.length" class="space-y-2">
						<div v-for="i in 3" :key="i" class="h-16 bg-muted/30 rounded-lg animate-pulse" />
					</div>

					<!-- Suggestion cards -->
					<div v-else-if="aiSuggestions.length" class="space-y-2">
						<div
							v-for="(suggestion, idx) in aiSuggestions"
							:key="idx"
							class="flex items-center gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors group"
						>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-foreground">{{ suggestion.title }}</p>
								<p v-if="suggestion.description" class="text-xs text-muted-foreground mt-0.5 truncate">{{ suggestion.description }}</p>
								<div class="flex items-center gap-2 mt-1">
									<span class="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{{ suggestion.type }}</span>
									<span v-if="suggestion.target_value" class="text-[10px] text-muted-foreground">
										Target: {{ suggestion.target_value }} {{ suggestion.target_unit }}
									</span>
								</div>
							</div>
							<button
								@click="adoptSuggestion(suggestion)"
								class="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg opacity-80 group-hover:opacity-100 transition-opacity"
							>
								<UIcon name="i-heroicons-plus" class="w-3 h-3" />
								Add
							</button>
						</div>
					</div>

					<!-- Empty -->
					<p v-else class="text-xs text-muted-foreground text-center py-4">No suggestions yet. Click Refresh to generate.</p>
				</div>
			</div>
		</Transition>

		<!-- Overall Progress + AI Nudge -->
		<div v-if="goals.length" class="mb-6">
			<!-- Big progress bar -->
			<div class="ios-card p-5 mb-3">
				<div class="flex items-center justify-between mb-2">
					<span class="text-sm font-medium">Overall Progress</span>
					<span class="text-2xl font-bold" :class="stats.avgProgress >= 80 ? 'text-emerald-400' : stats.avgProgress >= 50 ? 'text-blue-400' : 'text-amber-400'">{{ stats.avgProgress }}%</span>
				</div>
				<div class="w-full h-3 bg-muted/40 rounded-full overflow-hidden">
					<div
						class="h-full rounded-full transition-all duration-700"
						:class="stats.avgProgress >= 80 ? 'bg-emerald-500' : stats.avgProgress >= 50 ? 'bg-blue-500' : 'bg-amber-500'"
						:style="{ width: stats.avgProgress + '%' }"
					/>
				</div>
				<div class="flex items-center justify-between mt-2 text-xs text-muted-foreground">
					<span>{{ stats.active }} active</span>
					<span>{{ stats.completed }} completed</span>
				</div>
			</div>

			<!-- AI nudge for overdue -->
			<AccentCard v-if="stats.overdue > 0" accent="bg-amber-500" class="ios-card mb-3">
				<div class="flex items-start gap-2">
					<UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
					<p class="text-sm text-foreground">
						<span class="font-medium">{{ stats.overdue }} goal{{ stats.overdue > 1 ? 's are' : ' is' }} past due.</span>
						<span class="text-muted-foreground"> Update your progress or adjust the deadline to stay on track.</span>
					</p>
				</div>
			</AccentCard>

			<!-- Simple filter pills -->
			<div class="flex gap-1.5">
				<button
					v-for="tab in [{ label: 'Active', value: 'active' }, { label: 'Completed', value: 'completed' }, { label: 'All', value: 'all' }]"
					:key="tab.value"
					@click="activeTab = tab.value"
					class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
					:class="activeTab === tab.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
				>
					{{ tab.label }}
					<span v-if="tab.value === 'active'" class="ml-1 opacity-60">{{ stats.active }}</span>
				</button>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="isLoading && !goals.length" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty state -->
		<div v-else-if="!goals.length" class="text-center py-20">
			<div class="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
				<UIcon name="i-heroicons-flag" class="w-7 h-7 text-primary" />
			</div>
			<h3 class="text-base font-semibold mb-1">No goals yet</h3>
			<p class="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">Create your first goal to start tracking your progress. Goals help Earnest AI provide personalized suggestions.</p>
			<button
				@click="showCreateModal = true"
				class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
			>
				Create Your First Goal
			</button>
		</div>

		<!-- Goals Grid -->
		<div v-else-if="filteredGoals.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			<GoalsGoalCard
				v-for="goal in filteredGoals"
				:key="goal.id"
				:goal="goal"
				@edit="handleEdit"
				@update-progress="openProgressUpdate"
				@delete="handleDelete"
			/>
		</div>

		<!-- No results for filter -->
		<div v-else class="text-center py-16 text-sm text-muted-foreground">
			No goals match this filter.
		</div>

		<!-- Create/Edit Modal -->
		<ClientOnly>
		<UModal v-model="showCreateModal">
			<div class="space-y-4 p-1">
				<div>
					<h2 class="text-lg font-semibold text-foreground">{{ editingGoal ? 'Edit Goal' : 'New Goal' }}</h2>
					<p class="text-sm text-muted-foreground mt-0.5">Set a target to track your progress</p>
				</div>
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Title</label>
					<input v-model="goalForm.title" type="text" placeholder="e.g., Reach $50K monthly revenue" class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
				</div>
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Type</label>
					<div class="flex gap-2 flex-wrap">
						<button v-for="opt in goalTypeOptions" :key="opt.value" @click="goalForm.type = opt.value" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" :class="goalForm.type === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'">
							<UIcon :name="opt.icon" class="w-3.5 h-3.5" />
							{{ opt.label }}
						</button>
					</div>
				</div>
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</label>
					<textarea v-model="goalForm.description" rows="2" placeholder="What does success look like?" class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Target</label>
						<input v-model.number="goalForm.target_value" type="number" placeholder="50000" class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
					</div>
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Unit</label>
						<select v-model="goalForm.target_unit" class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
							<option v-for="opt in goalUnitOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
						</select>
					</div>
				</div>
				<div v-if="editingGoal">
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Current Value</label>
					<input v-model.number="goalForm.current_value" type="number" class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Timeframe</label>
						<select v-model="goalForm.timeframe" class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
							<option value="weekly">Weekly</option>
							<option value="monthly">Monthly</option>
							<option value="quarterly">Quarterly</option>
							<option value="yearly">Yearly</option>
							<option value="custom">Custom</option>
						</select>
					</div>
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Priority</label>
						<select v-model="goalForm.priority" class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
						</select>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Start Date</label>
						<input v-model="goalForm.start_date" type="date" class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
					</div>
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">End Date</label>
						<input v-model="goalForm.end_date" type="date" class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
					</div>
				</div>
				<div class="flex justify-end gap-2 pt-2">
					<button @click="showCreateModal = false" class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg">Cancel</button>
					<button @click="handleSaveGoal" :disabled="!goalForm.title.trim()" class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
						{{ editingGoal ? 'Update Goal' : 'Create Goal' }}
					</button>
				</div>
			</div>
		</UModal>
		</ClientOnly>

		<!-- Progress Update Modal -->
		<ClientOnly>
		<UModal v-model="showProgressModal">
			<div class="space-y-4 p-1" v-if="progressGoal">
					<div>
						<h2 class="text-lg font-semibold text-foreground">Update Progress</h2>
						<p class="text-sm text-muted-foreground mt-0.5">{{ progressGoal.title }}</p>
					</div>
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Current Value</label>
						<input
							v-model.number="progressValue"
							type="number"
							class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
						<p class="text-xs text-muted-foreground mt-1">
							Target: {{ progressGoal.target_value }} {{ progressGoal.target_unit }}
						</p>
					</div>
					<div>
						<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Notes (optional)</label>
						<textarea
							v-model="progressNotes"
							rows="2"
							placeholder="What changed?"
							class="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
						/>
					</div>
					<div class="flex justify-end gap-2 pt-2">
						<button
							@click="showProgressModal = false"
							class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg"
						>
							Cancel
						</button>
						<button
							@click="saveProgress"
							:disabled="savingProgress"
							class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
						>
							{{ savingProgress ? 'Saving...' : 'Save Progress' }}
						</button>
					</div>
			</div>
		</UModal>
		</ClientOnly>
	</div>
</template>

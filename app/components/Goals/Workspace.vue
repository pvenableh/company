<script setup lang="ts">
/**
 * GoalsWorkspace — the canonical Goals hub, rendered as a floor of the "Me"
 * (Account) app. Lifted out of the old orphaned /goals page so it follows the
 * universal Apps-Mode pattern: UTabs view switcher (List / Insights /
 * Retrospective), UTabs scope switcher, and iOS-native bottom sheets instead
 * of raw UModals. The standalone /goals route now redirects into the Account
 * floor that mounts this component.
 *
 * Filter + view state stays URL-shareable via the route query (scope /
 * category / status / view) — the Account page's own `section` watcher and
 * this component's watcher both spread `...route.query`, so they coexist.
 */
const { goals, activeGoals, completedGoals, myGoals, goalsByScope, goalsByCategory, overdueGoals, isLoading, deleteGoal, recordSnapshot, goalProgress, refresh } = useGoals();

const route = useRoute();
const router = useRouter();

type ScopeVal = 'all' | 'me' | 'team' | 'client' | 'organization';
type CategoryVal = 'all' | 'revenue' | 'growth' | 'retention' | 'learning' | 'wellbeing' | 'delivery' | 'custom';
type StatusVal = 'active' | 'completed' | 'all';
type ViewKey = 'list' | 'insights' | 'retrospective';

const SCOPE_VALUES: ScopeVal[] = ['all', 'me', 'team', 'client', 'organization'];
const CATEGORY_VALUES: CategoryVal[] = ['all', 'revenue', 'growth', 'retention', 'learning', 'wellbeing', 'delivery', 'custom'];
const STATUS_VALUES: StatusVal[] = ['active', 'completed', 'all'];
const VIEW_VALUES: ViewKey[] = ['list', 'insights', 'retrospective'];

function readQuery<T extends string>(key: string, allowed: T[], fallback: T): T {
	const raw = route.query[key];
	const v = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
	return allowed.includes(v as T) ? (v as T) : fallback;
}

const scopeFilter = ref<ScopeVal>(readQuery<ScopeVal>('scope', SCOPE_VALUES, 'all'));
const categoryFilter = ref<CategoryVal>(readQuery<CategoryVal>('category', CATEGORY_VALUES, 'all'));
const statusFilter = ref<StatusVal>(readQuery<StatusVal>('status', STATUS_VALUES, 'active'));
const view = ref<ViewKey>(readQuery<ViewKey>('view', VIEW_VALUES, 'list'));

// Reflect filter state back into the URL — drop default values so the shared
// URL stays clean (`?section=goals` not `…&scope=all&category=all&status=active`).
watch([scopeFilter, categoryFilter, statusFilter, view], ([scope, cat, status, v]) => {
	const next = { ...route.query };
	if (scope === 'all') delete next.scope; else next.scope = scope;
	if (cat === 'all') delete next.category; else next.category = cat;
	if (status === 'active') delete next.status; else next.status = status;
	if (v === 'list') delete next.view; else next.view = v;
	router.replace({ query: next });
});

const showCreateModal = ref(false);
const editingGoal = ref<any>(null);
const aiPrefill = ref<any>(null);

// Progress update (bottom sheet)
const showProgressSheet = ref(false);
const progressGoal = ref<any>(null);
const progressValue = ref(0);
const progressNotes = ref('');
const savingProgress = ref(false);

const toast = useToast();
const { selectedOrg } = useOrganization();

// AI Suggestions
const showAISuggestions = ref(false);
const aiSuggestions = ref<any[]>([]);
const loadingSuggestions = ref(false);
const aiContext = ref('');

const fetchAISuggestions = async () => {
	loadingSuggestions.value = true;
	showAISuggestions.value = true;
	try {
		const { suggestions } = await $fetch<{ suggestions: any[] }>('/api/ai/goal-suggestions', {
			method: 'POST',
			body: {
				existingGoals: goals.value.map((g: any) => ({ title: g.title, type: g.type })),
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

const adoptSuggestion = (suggestion: any) => {
	editingGoal.value = null;
	aiPrefill.value = {
		title: suggestion.title || '',
		description: suggestion.description || '',
		scope: suggestion.scope || 'user',
		category: suggestion.category || 'custom',
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
	aiSuggestions.value = aiSuggestions.value.filter((s: any) => s !== suggestion);
};

function openNewGoal() {
	editingGoal.value = null;
	aiPrefill.value = null;
	showCreateModal.value = true;
}

async function onGoalSaved() {
	editingGoal.value = null;
	aiPrefill.value = null;
	await refresh();
}

// ── Scope / category / status options ───────────────────────────────────────
const scopeTabs = computed(() => [
	{ key: 'all', label: 'All', count: scopeCounts.value.all },
	{ key: 'me', label: 'For me', icon: 'i-heroicons-user', count: scopeCounts.value.me },
	{ key: 'team', label: 'Team', icon: 'i-heroicons-user-group', count: scopeCounts.value.team },
	{ key: 'client', label: 'Client', icon: 'i-heroicons-briefcase', count: scopeCounts.value.client },
	{ key: 'organization', label: 'Org', icon: 'i-heroicons-building-office-2', count: scopeCounts.value.organization },
]);

const categoryOptions = [
	{ label: 'All', value: 'all' as const },
	{ label: 'Revenue', value: 'revenue' as const },
	{ label: 'Growth', value: 'growth' as const },
	{ label: 'Retention', value: 'retention' as const },
	{ label: 'Learning', value: 'learning' as const },
	{ label: 'Wellbeing', value: 'wellbeing' as const },
	{ label: 'Delivery', value: 'delivery' as const },
	{ label: 'Custom', value: 'custom' as const },
];

const filteredGoals = computed(() => {
	let pool: any[];
	if (scopeFilter.value === 'me') pool = myGoals.value as any[];
	else if (scopeFilter.value === 'all') pool = goals.value as any[];
	else pool = goalsByScope.value[scopeFilter.value] || [];

	if (categoryFilter.value !== 'all') {
		pool = pool.filter((g: any) => (g.category || 'custom') === categoryFilter.value);
	}
	if (statusFilter.value === 'active') pool = pool.filter((g: any) => g.status === 'active');
	else if (statusFilter.value === 'completed') pool = pool.filter((g: any) => g.status === 'completed');
	return pool;
});

const scopeCounts = computed(() => ({
	all: goals.value.length,
	me: myGoals.value.length,
	team: goalsByScope.value.team?.length || 0,
	client: goalsByScope.value.client?.length || 0,
	organization: goalsByScope.value.organization?.length || 0,
}));

const categoryCounts = computed(() => {
	const out: Record<string, number> = { all: goals.value.length };
	for (const opt of categoryOptions) {
		if (opt.value === 'all') continue;
		out[opt.value] = goalsByCategory.value[opt.value]?.length || 0;
	}
	return out;
});

const stats = computed(() => ({
	total: goals.value.length,
	active: activeGoals.value.length,
	completed: completedGoals.value.length,
	overdue: overdueGoals.value.length,
	avgProgress: activeGoals.value.length
		? Math.round(activeGoals.value.reduce((sum: number, g: any) => sum + goalProgress(g), 0) / activeGoals.value.length)
		: 0,
}));

const handleEdit = (goal: any) => {
	editingGoal.value = goal;
	aiPrefill.value = null;
	showCreateModal.value = true;
};

const handleDelete = async (goal: any) => {
	await deleteGoal(goal.id);
	toast.add({ title: 'Goal deleted', color: 'neutral' });
};

// ── Coach Me (bottom sheet) ──────────────────────────────────────────────────
const showCoachSheet = ref(false);
const coachGoal = ref<any>(null);
const coachData = ref<any>(null);
const coachLoading = ref(false);
const coachError = ref<string | null>(null);

const handleCoach = (goal: any) => {
	coachGoal.value = goal;
	coachLoading.value = true;
	coachData.value = null;
	showCoachSheet.value = true;
	void fetchCoachInsight(goal);
};

async function fetchCoachInsight(goal: any) {
	coachLoading.value = true;
	coachError.value = null;
	coachData.value = null;
	try {
		const snapshots = ((goal.snapshots || []) as any[])
			.slice()
			.filter((s: any) => s?.date_created)
			.sort((a: any, b: any) => new Date(a.date_created).getTime() - new Date(b.date_created).getTime())
			.slice(-12)
			.map((s: any) => ({ value: s.value, notes: s.notes, date_created: s.date_created }));
		const res = await $fetch('/api/ai/goal-coach', {
			method: 'POST',
			body: {
				goal: {
					id: goal.id,
					title: goal.title,
					description: goal.description,
					category: goal.category,
					scope: goal.scope,
					target_value: goal.target_value,
					target_unit: goal.target_unit,
					current_value: goal.current_value,
					end_date: goal.end_date,
					start_date: goal.start_date,
					timeframe: goal.timeframe,
					template_id: goal.metadata?.template_id || null,
				},
				snapshots,
				organizationId: selectedOrg.value || undefined,
			},
		}) as any;
		coachData.value = res;
	} catch (err: any) {
		coachError.value = err?.data?.message || err?.message || 'Failed to load coaching';
	} finally {
		coachLoading.value = false;
	}
}

// ── Progress update + reflection ─────────────────────────────────────────────
const reflection = ref<string>('');
const reflectionLoading = ref(false);

const openProgressUpdate = (goal: any) => {
	progressGoal.value = goal;
	progressValue.value = goal.current_value || 0;
	progressNotes.value = '';
	reflection.value = '';
	showProgressSheet.value = true;
};

async function fetchReflection(goal: any) {
	reflectionLoading.value = true;
	reflection.value = '';
	try {
		const fresh = goals.value.find((g: any) => g.id === goal.id) || goal;
		const snapshots = (fresh.snapshots || [])
			.slice()
			.sort((a: any, b: any) => new Date(a.date_created || 0).getTime() - new Date(b.date_created || 0).getTime())
			.slice(-5);
		const { reflection: text } = await $fetch<{ reflection: string }>('/api/ai/goal-reflection', {
			method: 'POST',
			body: {
				goal: {
					id: fresh.id,
					title: fresh.title,
					description: fresh.description,
					category: fresh.category,
					scope: fresh.scope,
					target_value: fresh.target_value,
					target_unit: fresh.target_unit,
					current_value: fresh.current_value,
					end_date: fresh.end_date,
					timeframe: fresh.timeframe,
				},
				snapshots: snapshots.map((s: any) => ({
					value: s.value,
					notes: s.notes,
					date_created: s.date_created,
				})),
				organizationId: selectedOrg.value || undefined,
			},
		});
		reflection.value = text || '';
	} catch (err) {
		// Reflection is a nice-to-have — silently swallow so it never blocks the save path.
		console.warn('[goals] reflection failed:', err);
	} finally {
		reflectionLoading.value = false;
	}
}

const saveProgress = async () => {
	if (!progressGoal.value) return;
	savingProgress.value = true;
	try {
		await recordSnapshot(progressGoal.value.id, progressValue.value, progressNotes.value);
		toast.add({ title: 'Progress updated', color: 'success' });
		// Fire-and-display the AI reflection without blocking the save UX.
		void fetchReflection(progressGoal.value);
	} catch {
		toast.add({ title: 'Error', description: 'Failed to update progress', color: 'error' });
	} finally {
		savingProgress.value = false;
	}
};

function closeProgress() {
	showProgressSheet.value = false;
	progressGoal.value = null;
}

const viewTabs = [
	{ key: 'list', label: 'List', icon: 'i-heroicons-queue-list' },
	{ key: 'insights', label: 'Insights', icon: 'i-heroicons-chart-bar' },
	{ key: 'retrospective', label: 'Retrospective', icon: 'i-heroicons-document-chart-bar' },
];
</script>

<template>
	<div>
		<!-- Header -->
		<div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
			<UTabs
				:model-value="view"
				:items="viewTabs"
				class="w-fit"
				@update:model-value="(v) => (view = v as ViewKey)"
			/>
			<div class="flex items-center gap-2">
				<button
					@click="fetchAISuggestions"
					:disabled="loadingSuggestions"
					class="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border border-warning/30 text-warning dark:text-warning rounded-full hover:bg-warning/10 transition-colors"
				>
					<UIcon v-if="loadingSuggestions" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
					<EarnestIcon v-else class="w-4 h-4" />
					Earnest Suggest
				</button>
				<button
					@click="openNewGoal"
					class="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
				>
					<UIcon name="i-heroicons-plus" class="w-4 h-4" />
					New Goal
				</button>
			</div>
		</div>

		<!-- ═══ Insights view ═══ -->
		<template v-if="view === 'insights'">
			<GoalsInsightsView
				:goals="goals"
				:active-goals="activeGoals"
				:completed-goals="completedGoals"
				:overdue-goals="overdueGoals"
				:goals-by-scope="goalsByScope"
				:goals-by-category="goalsByCategory"
				:goal-progress="goalProgress"
				:loading="isLoading"
			/>
		</template>

		<!-- ═══ Retrospective view ═══ -->
		<template v-else-if="view === 'retrospective'">
			<GoalsRetrospectiveView />
		</template>

		<!-- ═══ List view ═══ -->
		<template v-else>
			<!-- Earnest Suggestions Panel -->
			<Transition name="fade">
				<div v-if="showAISuggestions" class="mb-6">
					<div class="ios-card p-4">
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-2">
								<EarnestIcon class="w-4 h-4 text-warning" />
								<h3 class="text-sm font-semibold text-foreground">Earnest-Suggested Goals</h3>
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
								class="flex-1 glass-field rounded-full px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
								@keydown.enter="fetchAISuggestions"
							/>
							<button
								@click="fetchAISuggestions"
								:disabled="loadingSuggestions"
								class="px-3 py-1.5 text-xs font-medium bg-warning/10 text-warning dark:text-warning rounded-full hover:bg-warning/20 transition-colors"
							>
								{{ loadingSuggestions ? 'Thinking...' : 'Refresh' }}
							</button>
						</div>

						<!-- Loading -->
						<div v-if="loadingSuggestions && !aiSuggestions.length" class="space-y-2">
							<div v-for="i in 3" :key="i" class="h-16 bg-muted/30 rounded-lg animate-pulse"></div>
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
										<span class="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{{ suggestion.category || suggestion.type }}</span>
										<span v-if="suggestion.target_value" class="text-[10px] text-muted-foreground">
											Target: {{ suggestion.target_value }} {{ suggestion.target_unit }}
										</span>
									</div>
								</div>
								<button
									@click="adoptSuggestion(suggestion)"
									class="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
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

			<!-- Overall Progress + filters -->
			<div v-if="goals.length" class="mb-6">
				<!-- Big progress bar -->
				<div class="ios-card p-5 mb-3">
					<div class="flex items-center justify-between mb-2">
						<span class="text-sm font-medium">Overall Progress</span>
						<span class="text-2xl font-bold" :class="stats.avgProgress >= 80 ? 'text-success' : stats.avgProgress >= 50 ? 'text-blue-400' : 'text-warning'">{{ stats.avgProgress }}%</span>
					</div>
					<div class="w-full h-3 bg-muted/40 rounded-full overflow-hidden">
						<div
							class="h-full rounded-full transition-all duration-700"
							:class="stats.avgProgress >= 80 ? 'bg-success' : stats.avgProgress >= 50 ? 'bg-blue-500' : 'bg-warning'"
							:style="{ width: stats.avgProgress + '%' }"
						></div>
					</div>
					<div class="flex items-center justify-between mt-2 text-xs text-muted-foreground">
						<span>{{ stats.active }} active</span>
						<span>{{ stats.completed }} completed</span>
					</div>
				</div>

				<!-- Earnest nudge for overdue -->
				<AccentCard v-if="stats.overdue > 0" accent="bg-warning" class="ios-card mb-3">
					<div class="flex items-start gap-2">
						<EarnestIcon class="w-4 h-4 text-warning shrink-0 mt-0.5" />
						<p class="text-sm text-foreground">
							<span class="font-medium">{{ stats.overdue }} goal{{ stats.overdue > 1 ? 's are' : ' is' }} past due.</span>
							<span class="text-muted-foreground"> Update your progress or adjust the deadline to stay on track.</span>
						</p>
					</div>
				</AccentCard>

				<!-- Scope filter — universal UTabs segmented control -->
				<UTabs
					:model-value="scopeFilter"
					:items="scopeTabs"
					class="w-fit mb-3"
					@update:model-value="(v) => (scopeFilter = v as ScopeVal)"
				/>

				<!-- Category filter -->
				<div class="flex gap-1.5 flex-wrap mb-2">
					<button
						v-for="opt in categoryOptions"
						:key="opt.value"
						@click="categoryFilter = opt.value"
						class="px-3 py-1 rounded-full text-[11px] font-medium transition-colors"
						:class="categoryFilter === opt.value ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'"
					>
						{{ opt.label }}
						<span class="opacity-60">{{ categoryCounts[opt.value] }}</span>
					</button>
				</div>

				<!-- Status filter -->
				<div class="flex gap-1.5">
					<button
						v-for="tab in [{ label: 'Active', value: 'active' }, { label: 'Completed', value: 'completed' }, { label: 'All', value: 'all' }] as const"
						:key="tab.value"
						@click="statusFilter = tab.value"
						class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
						:class="statusFilter === tab.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
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
				<div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-flag" class="w-7 h-7 text-primary" />
				</div>
				<h3 class="text-base font-semibold mb-1">No goals yet</h3>
				<p class="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">Create your first goal to start tracking your progress. Goals help Earnest provide personalized suggestions.</p>
				<button
					@click="openNewGoal"
					class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
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
					@coach="handleCoach"
				/>
			</div>

			<!-- No results for filter -->
			<div v-else class="text-center py-16 text-sm text-muted-foreground">
				No goals match this filter.
			</div>
		</template>

		<!-- Create/Edit Modal -->
		<GoalsGoalCreateModal
			v-model="showCreateModal"
			:goal="editingGoal"
			:prefill="aiPrefill"
			@saved="onGoalSaved"
		/>

		<!-- Progress Update — iOS bottom sheet -->
		<AppBottomSheet
			v-model="showProgressSheet"
			title="Update Progress"
			:subtitle="progressGoal?.title || ''"
		>
			<div v-if="progressGoal" class="space-y-4">
				<div>
					<label class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Current Value</label>
					<input
						v-model.number="progressValue"
						type="number"
						class="w-full glass-field rounded-full px-3 py-2 text-sm text-foreground focus:outline-none"
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
						class="w-full glass-field rounded-2xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none"
					/>
				</div>

				<!-- Earnest reflection — appears after Save fires. Stays grounded in
					 the goal's actual data; see feedback_goal_coaching_lattice_line.md -->
				<div
					v-if="reflectionLoading || reflection"
					class="rounded-lg border border-warning/20 bg-warning/5 p-3"
				>
					<div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-warning dark:text-warning font-semibold mb-1.5">
						<EarnestIcon class="w-3.5 h-3.5" />
						Reflection
					</div>
					<p v-if="reflectionLoading" class="text-xs text-muted-foreground italic">Thinking…</p>
					<p v-else class="text-sm text-foreground leading-relaxed">{{ reflection }}</p>
				</div>
			</div>

			<template #footer>
				<div class="flex justify-end gap-2">
					<button
						@click="closeProgress"
						class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-full"
					>
						{{ reflection || reflectionLoading ? 'Done' : 'Cancel' }}
					</button>
					<button
						v-if="!reflection && !reflectionLoading"
						@click="saveProgress"
						:disabled="savingProgress"
						class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-50 transition-colors"
					>
						{{ savingProgress ? 'Saving...' : 'Save Progress' }}
					</button>
				</div>
			</template>
		</AppBottomSheet>

		<!-- Coach Me — iOS bottom sheet -->
		<AppBottomSheet
			v-model="showCoachSheet"
			title="Coach me"
			:subtitle="coachGoal?.title || ''"
		>
			<div v-if="coachGoal" class="space-y-4">
				<!-- Loading -->
				<div v-if="coachLoading" class="py-8 text-center">
					<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-warning animate-spin mx-auto mb-2" />
					<p class="text-xs text-muted-foreground">Reading your data…</p>
				</div>

				<!-- Error -->
				<div v-else-if="coachError" class="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
					{{ coachError }}
				</div>

				<!-- Coach output -->
				<div v-else-if="coachData" class="space-y-3">
					<div v-if="coachData.insight" class="rounded-md border border-warning/20 bg-warning/5 p-3">
						<p class="text-sm leading-relaxed">{{ coachData.insight }}</p>
					</div>

					<div v-if="coachData.questions?.length" class="space-y-1.5">
						<h4 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Questions to sit with</h4>
						<ul class="space-y-1.5">
							<li v-for="(q, i) in coachData.questions" :key="i" class="text-sm flex gap-2">
								<span class="text-warning">·</span>
								<span>{{ q }}</span>
							</li>
						</ul>
					</div>

					<div v-if="coachData.next_step" class="rounded-md border border-primary/20 bg-primary/5 p-3">
						<div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">
							<UIcon name="i-heroicons-arrow-right-circle" class="w-3 h-3" />
							Next step
						</div>
						<p class="text-sm leading-relaxed">{{ coachData.next_step }}</p>
					</div>
				</div>
			</div>
		</AppBottomSheet>
	</div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>

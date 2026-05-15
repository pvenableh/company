<script setup lang="ts">
definePageMeta({ layout: false, middleware: 'auth' });
useHead({ title: 'Home | Earnest' });

const { user } = useDirectusAuth();
const config = useRuntimeConfig();

// ── Layout mode ──
const { currentMode } = useLayoutMode();
// Apps mode users land here as their Dashboard surface — wrap content in
// the apps shell so the rail/chrome stays visible. Classic mode keeps the
// default sidebar.
const { isAppsMode } = useAppsMode();
const layout = computed(() => (isAppsMode.value ? 'apps' : 'default'));

// ── Widget gating (legacy hat hooks; useHatLayout is now a no-op shim) ──
const { showWidget, hatModules } = useHatLayout();

// ── Productivity Engine (existing) ──
const { suggestions, metrics, isAnalyzing, greeting, subtitle, analyze, loadModule } = useAIProductivityEngine();
const { enabledModules } = useAIPreferences();
const { selectedPersona } = useAIPersona();

// Active engine modules = user-enabled ∩ hat-allowed. Hat-aware gating means
// e.g. the Accountant hat only triggers tickets/tasks/invoices/deals/goals on
// cold mount instead of all 11 analyzers.
const activeEngineModules = computed<Set<string>>(() => {
	const userEnabled = enabledModules.value;
	const hatAllowed = hatModules.value;
	if (!hatAllowed) return new Set(userEnabled);
	return new Set([...userEnabled].filter((m) => hatAllowed.includes(m)));
});

// Update greeting when persona changes
watch(selectedPersona, () => {
	if (user.value) runAnalysis();
});

// ── CRM Intelligence Engine ──
// snapshot = instant algorithmic data (no AI, loads on mount)
// analyze = on-demand AI deep analysis (user clicks button)
const { snapshot: crmSnapshot, snapshotLoading: crmSnapshotLoading, analyze: crmAnalyze, overview: crmOverview, isLoading: crmLoading, lastAIAnalysis: crmLastAI } = useCRMIntelligence();

// ── Earnest Score ──
const { state: earnestState, syncState, fetchState, fetchTeamRanking, fetchHistory, newBadges, leveledUp, getScoreTier } = useEarnestScore();

const badgeColor = (id: string): string => {
	const colors: Record<string, string> = {
		'first-flame': 'bg-orange-500/10 text-orange-600 ring-1 ring-orange-500/20',
		'keeper-of-promises': 'bg-green-500/10 text-green-600 ring-1 ring-green-500/20',
		'seven-day-resolve': 'bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/20',
		'thirty-day-pillar': 'bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20',
		'rapid-responder': 'bg-yellow-500/10 text-yellow-600 ring-1 ring-yellow-500/20',
		'deep-current': 'bg-cyan-500/10 text-cyan-600 ring-1 ring-cyan-500/20',
		'the-preparator': 'bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20',
		'team-anchor': 'bg-teal-500/10 text-teal-600 ring-1 ring-teal-500/20',
		'first-close': 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20',
		'pipeline-builder': 'bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20',
		'follow-up-master': 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20',
		'quick-closer': 'bg-pink-500/10 text-pink-600 ring-1 ring-pink-500/20',
		'iron-will': 'bg-red-500/10 text-red-600 ring-1 ring-red-500/20',
		'century': 'bg-purple-500/10 text-purple-600 ring-1 ring-purple-500/20',
	};
	return colors[id] || 'bg-primary/10 text-primary ring-1 ring-primary/20';
};
const { celebrate } = useConfetti();

// ── Context ──
const { selectedOrg } = useOrganization();
const { selectedTeam } = useTeams();
const { selectedClient } = useClients();
const router = useRouter();

// ── Marketing pulse (drives compact-vs-rich widget swap below) ──
const marketingPulse = useMarketingPulse();
watch(selectedOrg, () => marketingPulse.load(), { immediate: true });

// ── View lens ("Me" lens initiative, Stage 2) ──
// Persists per-user via `directus_users.view_lens`. Re-ranks the YOU vs US
// bands below — same content, different emphasis. REFERENCE band is always
// last regardless of lens.
const { lens: viewLens, setLens: setViewLens } = useViewLens();
const youOrder = computed(() => (viewLens.value === 'me' ? 1 : 2));
const usOrder = computed(() => (viewLens.value === 'me' ? 2 : 1));

// ── My Goals (scope=user) for the YOU band's right column ──
// Shares state with the rest of useGoals consumers (e.g. GoalsSummaryWidget),
// so this doesn't add a separate fetch. weeklyCheckinStreak (Stage 2.5)
// is derived from snapshots already loaded by useGoals.
const { myGoals, goalProgress: goalProgressFn, weeklyCheckinStreak } = useGoals();
const topMyGoals = computed(() =>
	(myGoals.value || [])
		.filter((g: any) => g.status === 'active')
		.slice(0, 3),
);

// ── Org/Team goal counts for the US band's chip strip ──
const { goalsByScope } = useGoals();
const orgTeamGoalCount = computed(() => {
	const byScope = goalsByScope.value || {} as Record<string, any[]>;
	return ((byScope.team || []).length) + ((byScope.organization || []).length);
});

// ── Weekly check-in modal (Stage 2.5) ──
// Modal lives at the bottom of <template>; trigger pill in YOU's right column
// flips this ref. Lazy v-if keeps the modal tree out of the SSR payload.
const checkinOpen = ref(false);

// ── AI Tray ──
const aiTrayOpen = ref(false);
const aiTrayPrompt = ref('');

const handleTrayClose = () => {
	aiTrayOpen.value = false;
	aiTrayPrompt.value = '';
};

// ── Prioritized Actions ──
const topActions = computed(() => {
	return suggestions.value.filter(s => s.priority === 'urgent' || s.priority === 'high').slice(0, 6);
});

const otherSuggestions = computed(() => {
	return suggestions.value.filter(s => s.priority !== 'urgent' && s.priority !== 'high').slice(0, 4);
});

// ── CRM Health (prefer AI result if available, otherwise use algorithmic snapshot) ──
const healthScore = computed(() => crmOverview.value?.healthScore ?? crmSnapshot.value?.healthScore ?? null);
const healthBreakdown = computed(() => crmOverview.value?.healthBreakdown ?? crmSnapshot.value?.breakdown ?? null);
const crmInsights = computed(() => crmOverview.value?.insights?.slice(0, 4) ?? []);
const growthOpportunities = computed(() => crmOverview.value?.growthOpportunities?.slice(0, 3) ?? []);
const crmActions = computed(() => crmOverview.value?.topActions?.slice(0, 4) ?? []);
const crmAlerts = computed(() => crmSnapshot.value?.alerts ?? []);

// ── Health Score Color ──
const healthColor = computed(() => {
	const score = healthScore.value;
	if (score === null) return 'text-muted-foreground';
	if (score >= 75) return 'text-green-500';
	if (score >= 50) return 'text-amber-500';
	return 'text-red-500';
});

const healthBg = computed(() => {
	const score = healthScore.value;
	if (score === null) return 'bg-muted/30';
	if (score >= 75) return 'bg-green-50 dark:bg-green-900/10';
	if (score >= 50) return 'bg-amber-50 dark:bg-amber-900/10';
	return 'bg-red-50 dark:bg-red-900/10';
});

// ── Insight Icons ──
const insightIcons: Record<string, string> = {
	strength: 'i-heroicons-check-circle',
	risk: 'i-heroicons-exclamation-triangle',
	trend: 'i-heroicons-arrow-trending-up',
	opportunity: 'i-heroicons-light-bulb',
};

const insightColors: Record<string, string> = {
	strength: 'text-green-500',
	risk: 'text-red-500',
	trend: 'text-blue-500',
	opportunity: 'text-amber-500',
};

// ── Priority Styles ──
const { getPriorityIconClass: priorityIconColor, getPriorityBadgeClasses: priorityChipClasses } = useStatusStyle();

// ── Analysis Flow ──
// Dedupes overlapping calls from onMounted + the user/org/team/persona
// watchers that all fire during cold mount. Without this, `analyze()` —
// ~12 Directus reads — runs 2-3× before the page settles.
let analysisInflight: Promise<void> | null = null;
const runAnalysis = (): Promise<void> => {
	if (analysisInflight) return analysisInflight;
	analysisInflight = (async () => {
		try {
			await Promise.all([
				analyze(activeEngineModules.value),
				syncState(metrics.value),
			]);
			// Replay enter handlers for any deferred widgets already in view so
			// a hat switch doesn't drop their lazy modules' suggestions/metrics.
			replayLazyLoaders();
			await fetchTeamRanking();
			if (leveledUp.value || (newBadges.value && newBadges.value.length > 0)) {
				celebrate();
			}
		} finally {
			analysisInflight = null;
		}
	})();
	return analysisInflight;
};

// CRM AI analysis is now on-demand only (user clicks "Run AI Analysis")
// The algorithmic snapshot loads automatically via the composable
const runCRMAnalysis = () => {
	if (selectedOrg.value) {
		crmAnalyze('overview');
	}
};

// Lazy module loaders for the three deferred widgets. The corresponding hat
// `HAT_MODULES` entries omit these so cold mount stays cheap; once the
// `<DeferUntilVisible @enter>` fires, we top up suggestions/metrics with the
// modules each widget actually exercises.
//
// `_lazyEntered` remembers which deferred slots have already become visible
// in this session so that a hat switch (which clears `_moduleResults` and
// re-runs `analyze()`) re-merges those modules' suggestions instead of
// dropping them — DeferUntilVisible's observer stops after first hit, so
// `@enter` never fires twice for the same instance.
const _lazyEntered = reactive({ chatDesk: false, financial: false });
const onChatDeskEnter = () => {
	_lazyEntered.chatDesk = true;
	if (showWidget('realtime-chat')) loadModule('channels');
	if (showWidget('card-desk')) loadModule('carddesk');
};
const onFinancialEnter = () => {
	_lazyEntered.financial = true;
	loadModule('invoices');
	loadModule('deals');
};
const replayLazyLoaders = () => {
	if (_lazyEntered.chatDesk) {
		if (showWidget('realtime-chat')) loadModule('channels');
		if (showWidget('card-desk')) loadModule('carddesk');
	}
	if (_lazyEntered.financial && showWidget('financial-quarter')) {
		loadModule('invoices');
		loadModule('deals');
	}
};

onMounted(async () => {
	if (user.value) {
		// Fetch state and history in parallel, then run analysis
		await Promise.all([fetchState(), fetchHistory(7)]);
		runAnalysis();
	}
});

watch(user, (newUser) => {
	if (newUser) {
		runAnalysis();
	}
});

watch([selectedOrg, selectedClient, selectedTeam], () => {
	if (user.value) {
		runAnalysis();
	}
});

// Show leaderboard when a team is selected
const showLeaderboard = computed(() => !!selectedTeam.value);

const goTo = (route: string) => {
	router.push(route);
};

// ── Tabs: Command Center / Timeline / Statistics ──
const activeTab = ref<'commander' | 'statistics'>('commander');

// Mount Statistics tab content only after the user clicks it once.
// Both tabs use v-show so the DOM persists across toggles, but we gate
// the Statistics panel behind v-if to skip its 500-invoice fetch +
// LazyTicketsDashboard fan-out on cold mount of /.
const statisticsLoaded = ref(false);
watch(activeTab, (t) => {
	if (t === 'statistics') statisticsLoaded.value = true;
});
</script>

<template>
	<NuxtLayout :name="layout">
	<!-- Focus mode: streamlined Spark/Superhuman-style inbox -->
	<LayoutFocusInbox v-if="currentMode === 'focus'" />

	<div v-else class="min-h-screen t-bg t-text">
		<!-- Action Board: shown when user IS logged in -->
		<div v-if="user" class="min-h-screen bg-background">
			<!-- Apps Layout per-app header — shows the dashboard accent
			     chip + page title, matching the rest of /apps/*. Only
			     rendered in apps mode; classic mode keeps its own chrome. -->
			<AppHeader v-if="isAppsMode" title="Dashboard" />
			<div class="max-w-screen-xl mx-auto px-4 pb-8 sm:px-6 lg:px-8 space-y-6">
				<!-- Greeting + Lens Toggle + Assistant Button -->
				<div class="flex items-end justify-between gap-3 pt-2">
					<div class="min-w-0">
						<h1 class="text-[28px] font-bold text-foreground tracking-tight leading-tight truncate">{{ greeting }}</h1>
						<p class="text-[15px] text-muted-foreground mt-0.5 truncate">{{ subtitle }}</p>
					</div>
					<div class="flex items-center gap-2 shrink-0">
						<!-- Lens toggle: re-ranks YOU vs US bands. No effect on what's shown,
						     only the emphasis. -->
						<div
							class="flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-full text-[12px] font-medium"
							role="radiogroup"
							aria-label="Command Center lens"
						>
							<button
								type="button"
								role="radio"
								:aria-checked="viewLens === 'me'"
								@click="setViewLens('me')"
								class="px-2.5 sm:px-3 py-1 rounded-full transition-colors duration-150"
								:class="viewLens === 'me' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
							>
								<span class="hidden sm:inline">For me</span>
								<span class="sm:hidden">Me</span>
							</button>
							<button
								type="button"
								role="radio"
								:aria-checked="viewLens === 'org'"
								@click="setViewLens('org')"
								class="px-2.5 sm:px-3 py-1 rounded-full transition-colors duration-150"
								:class="viewLens === 'org' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
							>
								<span class="hidden sm:inline">For org</span>
								<span class="sm:hidden">Org</span>
							</button>
						</div>
						<button
							@click="aiTrayPrompt = ''; aiTrayOpen = true"
							class="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-full shadow-sm transition-all duration-200 text-[13px] font-medium ios-press"
						>
							<EarnestIcon class="w-4 h-4" />
							<span class="hidden sm:inline">Earnest</span>
						</button>
					</div>
				</div>

				<!-- Tab Switcher -->
				<div class="flex gap-1 p-1 bg-muted/40 rounded-xl w-full sm:w-fit">
					<button
						@click="activeTab = 'commander'"
						class="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
						:class="activeTab === 'commander'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'"
					>
						<span class="flex items-center justify-center gap-1.5">
							<UIcon name="i-heroicons-command-line" class="w-3.5 h-3.5" />
							<span class="hidden sm:inline">Command Center</span>
							<span class="sm:hidden">Command</span>
						</span>
					</button>
	<button
						@click="activeTab = 'statistics'"
						class="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
						:class="activeTab === 'statistics'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'"
					>
						<span class="flex items-center justify-center gap-1.5">
							<UIcon name="i-heroicons-squares-2x2" class="w-3.5 h-3.5" />
							<span class="hidden sm:inline">Statistics</span>
							<span class="sm:hidden">Stats</span>
						</span>
					</button>
				</div>

				<!-- ═══ Command Center Tab ═══ -->
				<div v-show="activeTab === 'commander'" class="space-y-6">

				<!-- Badge Highlights + Score Stat (always above the bands — user identity strip) -->
				<div class="flex items-center gap-2 overflow-x-auto py-1 hide-scrollbar">
					<!-- Earnest Score pill -->
					<UTooltip :text="`Level ${earnestState.level} — ${earnestState.levelTitle} (${earnestState.totalEP.toLocaleString()} EP)`">
						<div
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 ring-1 ring-primary/30"
							:class="getScoreTier(earnestState.currentScore).bg + '/10'"
						>
							<EarnestIcon class="w-3.5 h-3.5 text-primary" />
							<span class="text-[11px] font-bold tabular-nums" :class="getScoreTier(earnestState.currentScore).color">{{ earnestState.currentScore }}</span>
							<span class="text-[10px] text-muted-foreground">/100</span>
						</div>
					</UTooltip>
					<div class="w-px h-5 bg-border/60 shrink-0"></div>
					<!-- Badges -->
					<UTooltip
						v-for="badge in earnestState.badges"
						:key="badge.id"
						:text="badge.unlocked ? `${badge.name} — ${badge.description}` : `${badge.name} (Locked) — ${badge.description}`"
					>
						<div
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 transition-all cursor-default"
							:class="badge.unlocked
								? badgeColor(badge.id)
								: 'bg-muted/30 text-muted-foreground/40'"
						>
							<UIcon :name="badge.icon" class="w-3.5 h-3.5" />
							<span class="text-[11px] font-medium whitespace-nowrap">{{ badge.name }}</span>
						</div>
					</UTooltip>
				</div>

				<!-- Three-band layout. CSS `order` is reactive to the lens toggle —
				     YOU/US swap; REFERENCE always last. Preserves DOM state across
				     toggles so deferred widgets don't re-mount. -->
				<div class="flex flex-col gap-6">

				<!-- ─── YOU band ─── -->
				<section :style="{ order: youOrder }" class="space-y-4">
					<div class="flex items-center gap-2">
						<UIcon name="i-heroicons-user-circle" class="w-4 h-4 text-primary" />
						<h2 class="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">You</h2>
						<div class="flex-1 h-px bg-border/40"></div>
					</div>

				<!-- Priority Actions + Quick Tasks | Earnest Score + My Goals -->
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<!-- Left Column: Priority Actions + Quick Tasks (2/3 width) -->
					<div class="lg:col-span-2 space-y-6">
						<!-- Priority Actions -->
						<div class="space-y-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<UIcon name="i-heroicons-bolt" class="w-5 h-5 text-primary" />
									<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">
										Priority Actions
									</h3>
								</div>
								<button
									@click="runAnalysis"
									:disabled="isAnalyzing"
									class="text-xs text-primary hover:underline disabled:opacity-50"
								>
									Refresh
								</button>
							</div>

							<!-- Loading State -->
							<div v-if="isAnalyzing && topActions.length === 0" class="space-y-2">
								<div v-for="n in 4" :key="n" class="h-16 bg-muted rounded-xl animate-pulse"></div>
							</div>

							<!-- Empty State -->
							<div v-else-if="topActions.length === 0 && !isAnalyzing" class="ios-card p-8 text-center">
								<UIcon name="i-heroicons-check-circle" class="w-12 h-12 mx-auto mb-3 text-green-500" />
								<p class="text-sm font-medium text-foreground">You're all caught up!</p>
								<p class="text-xs text-muted-foreground mt-1">No urgent or high-priority items need your attention right now.</p>
							</div>

							<!-- Action Cards -->
							<div v-else class="space-y-3">
								<div
									v-for="action in topActions"
									:key="action.id"
									class="ios-card p-4 hover:shadow-md transition-all duration-200 cursor-pointer group"
									@click="action.actionRoute && goTo(action.actionRoute)"
								>
									<div class="flex items-start gap-3">
										<div
											class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
											:class="priorityChipClasses(action.priority)"
										>
											<UIcon
												:name="action.icon"
												class="w-4 h-4"
												:class="priorityIconColor(action.priority)"
											/>
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-foreground truncate">{{ action.title }}</p>
											<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{{ action.description }}</p>
										</div>
										<div class="flex-shrink-0 flex items-center gap-2">
											<span
												class="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
												:class="priorityChipClasses(action.priority)"
											>
												{{ action.priority }}
											</span>
											<span class="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
												{{ action.actionLabel }} &rarr;
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>

						<!-- Quick Tasks Widget (full width under Priority Actions) -->
						<CommandCenterQuickTasksWidget v-if="showWidget('quick-tasks')" />
					</div>

					<!-- Right Column: Earnest Score + My Goals (1/3 width). CRM Health
					     relocated to US band so this column is now purely personal. -->
					<div class="space-y-4 flex flex-col">
						<!-- Earnest Score (lifted to top of column since CRM Health left) -->
						<EarnestScoreWidget
							:current-score="earnestState.currentScore"
							:level="earnestState.level"
							:level-title="earnestState.levelTitle"
							:total-e-p="earnestState.totalEP"
							:next-level-e-p="earnestState.nextLevelEP"
							:level-progress="earnestState.levelProgress"
							:streak="earnestState.streak"
							:team-rank="earnestState.teamRank"
							:team-size="earnestState.teamSize"
							:dimensions="earnestState.dimensions"
							:weekly-checkin-streak="weeklyCheckinStreak"
						/>

						<!-- Stage 2.5: weekly check-in trigger pill. Renders only when
						     >=1 of the user's active personal goals is stale (no snapshot
						     in 7 days, created >=7 days ago). Quiet state = no DOM. -->
						<GoalsCheckinTriggerPill @open="checkinOpen = true" />

						<!-- My Goals (scope=user) — small inline mini-widget reusing
						     useGoals state already loaded by GoalsSummaryWidget in US. -->
						<div class="ios-card p-5">
							<div class="flex items-center justify-between mb-3">
								<div class="flex items-center gap-2">
									<UIcon name="i-heroicons-flag" class="w-4 h-4 text-amber-500" />
									<h3 class="text-xs font-semibold uppercase tracking-wide text-foreground/70">My Goals</h3>
								</div>
								<NuxtLink to="/goals?scope=user" class="text-[11px] text-primary hover:underline">
									{{ topMyGoals.length > 0 ? 'View all' : 'Set one' }} &rarr;
								</NuxtLink>
							</div>
							<div v-if="topMyGoals.length === 0" class="py-3 text-center">
								<p class="text-xs text-muted-foreground">No personal goals yet.</p>
								<p class="text-[10px] text-muted-foreground/70 mt-0.5">Set one to track what's yours.</p>
							</div>
							<div v-else class="space-y-3">
								<NuxtLink
									v-for="g in topMyGoals"
									:key="g.id"
									:to="`/goals?id=${g.id}`"
									class="block group"
								>
									<div class="flex items-center justify-between gap-2 mb-1">
										<p class="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{{ g.title }}</p>
										<span class="text-[10px] font-medium text-muted-foreground tabular-nums">{{ Math.round(goalProgressFn(g)) }}%</span>
									</div>
									<div class="h-1.5 bg-muted/40 rounded-full overflow-hidden">
										<div
											class="h-full rounded-full transition-all duration-500"
											:class="{
												'bg-emerald-500': goalProgressFn(g) >= 90,
												'bg-blue-500': goalProgressFn(g) >= 50 && goalProgressFn(g) < 90,
												'bg-amber-500': goalProgressFn(g) >= 25 && goalProgressFn(g) < 50,
												'bg-red-500': goalProgressFn(g) < 25,
											}"
											:style="{ width: `${Math.max(goalProgressFn(g), 4)}%` }"
										/>
									</div>
								</NuxtLink>
							</div>
						</div>
					</div>
				</div>

				<!-- Other Suggestions (lower priority) — personal AI nudges, lives in YOU -->
				<div v-if="showWidget('suggestions') && otherSuggestions.length > 0" class="ios-card p-5">
					<div class="flex items-center justify-between mb-4">
						<div class="flex items-center gap-2">
							<UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary" />
							<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">
								Suggestions
							</h3>
						</div>
						<button
							v-if="suggestions.length > 10"
							@click="aiTrayPrompt = ''; aiTrayOpen = true"
							class="text-xs text-primary hover:underline"
						>
							View all {{ suggestions.length }} &rarr;
						</button>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
						<CommandCenterSuggestionCard
							v-for="suggestion in otherSuggestions"
							:key="suggestion.id"
							:suggestion="suggestion"
						/>
					</div>
				</div>

				<!-- Team Leaderboard (shown when a team is selected) -->
				<div v-if="showLeaderboard" class="ios-card p-5">
					<EarnestTeamLeaderboard />
				</div>
				</section>

				<!-- ─── US band ─── -->
				<section :style="{ order: usOrder }" class="space-y-4">
					<div class="flex items-center gap-2">
						<UIcon name="i-heroicons-building-office-2" class="w-4 h-4 text-primary" />
						<h2 class="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Us</h2>
						<div class="flex-1 h-px bg-border/40"></div>
					</div>

					<!-- CRM Health (relocated from YOU's right column; now full width) -->
					<div v-if="showWidget('crm-health')" :class="healthBg" class="ios-card p-5 text-center">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">CRM Health</h3>

							<!-- Loading (snapshot) -->
							<div v-if="crmSnapshotLoading && healthScore === null" class="py-4">
								<div class="w-20 h-20 mx-auto bg-muted rounded-full animate-pulse"></div>
								<div class="w-24 h-3 mx-auto bg-muted rounded mt-3 animate-pulse"></div>
							</div>

							<!-- Score Display -->
							<div v-else-if="healthScore !== null" class="py-2">
								<div class="relative w-24 h-24 mx-auto">
									<svg class="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
										<path class="stroke-muted/30" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke-width="3" />
										<path
											:class="healthColor.replace('text-', 'stroke-')"
											d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
											fill="none"
											stroke-width="3"
											stroke-linecap="round"
											:stroke-dasharray="`${healthScore}, 100`"
										/>
									</svg>
									<div class="absolute inset-0 flex items-center justify-center">
										<span :class="healthColor" class="text-2xl font-bold">{{ healthScore }}</span>
									</div>
								</div>
								<p class="text-xs text-muted-foreground mt-2">Overall Score</p>

								<!-- Breakdown bars -->
								<div v-if="healthBreakdown" class="mt-4 space-y-2 text-left">
									<div v-for="(value, key) in healthBreakdown" :key="key" class="flex items-center gap-2">
										<span class="text-[10px] text-muted-foreground w-20 truncate capitalize">{{ String(key).replace(/([A-Z])/g, ' $1').trim() }}</span>
										<div class="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
											<div
												class="h-full rounded-full transition-all duration-500"
												:class="{
													'bg-green-500': value >= 75,
													'bg-amber-500': value >= 50 && value < 75,
													'bg-red-500': value < 50,
												}"
												:style="{ width: `${value}%` }"
											/>
										</div>
										<span class="text-[10px] font-medium text-muted-foreground w-6 text-right">{{ value }}</span>
									</div>
								</div>

								<!-- Algorithmic alerts (shown when no AI insights) -->
								<div v-if="crmAlerts.length > 0 && crmInsights.length === 0" class="mt-4 space-y-1.5 text-left">
									<div
										v-for="(alert, i) in crmAlerts.slice(0, 4)"
										:key="i"
										class="flex items-start gap-1.5 text-[10px]"
									>
										<UIcon
											:name="alert.type === 'danger' ? 'i-heroicons-exclamation-triangle' : alert.type === 'warning' ? 'i-heroicons-exclamation-circle' : alert.type === 'success' ? 'i-heroicons-check-circle' : 'i-heroicons-information-circle'"
											:class="alert.type === 'danger' ? 'text-red-500' : alert.type === 'warning' ? 'text-amber-500' : alert.type === 'success' ? 'text-green-500' : 'text-blue-500'"
											class="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
										/>
										<span class="text-muted-foreground leading-tight">{{ alert.message }}</span>
									</div>
								</div>

								<!-- On-demand AI Analysis button -->
								<button
									v-if="!crmOverview"
									@click="runCRMAnalysis"
									:disabled="crmLoading"
									class="mt-3 inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
								>
									<UIcon v-if="crmLoading" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
									<UIcon v-else name="i-heroicons-sparkles" class="w-3 h-3" />
									{{ crmLoading ? 'Analyzing...' : 'Run Analysis' }}
								</button>
								<p v-if="crmLastAI" class="text-[9px] text-muted-foreground mt-1">
									Analysis {{ new Date(crmLastAI).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
								</p>
							</div>

							<!-- No data state -->
							<div v-else class="py-6">
								<UIcon name="i-heroicons-user-group" class="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
								<p class="text-xs text-muted-foreground">No clients yet</p>
								<p class="text-[10px] text-muted-foreground/70 mt-1">Add your first client to see CRM health.</p>
								<NuxtLink
									to="/clients?new=1"
									class="inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 transition-colors"
								>
									<UIcon name="i-heroicons-plus" class="w-3 h-3" />
									Add your first client
								</NuxtLink>
							</div>
						</div>

				<!-- Today's Briefs (org-wide project digests) -->
				<ClientOnly v-if="showWidget('project-digests')">
					<CommandCenterProjectDigestsWidget />
				</ClientOnly>

				<!-- Marketing & Social Pulse — full width when we have social/email data -->
				<CommandCenterMarketingPulseWidget v-if="showWidget('marketing-pulse') && marketingPulse.hasRichData.value" />

				<!-- CRM Insights + Growth Opportunities -->
				<div v-if="showWidget('crm-insights') && (crmInsights.length > 0 || crmActions.length > 0)" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<!-- Insights -->
					<div v-if="crmInsights.length > 0" class="ios-card p-5">
						<div class="flex items-center gap-2 mb-4">
							<UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-primary" />
							<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Insights</h3>
						</div>

						<div class="space-y-3">
							<div
								v-for="(insight, i) in crmInsights"
								:key="i"
								class="flex items-start gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
							>
								<UIcon
									:name="insightIcons[insight.type] || 'i-heroicons-information-circle'"
									class="w-5 h-5 flex-shrink-0 mt-0.5"
									:class="insightColors[insight.type] || 'text-muted-foreground'"
								/>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-foreground">{{ insight.title }}</p>
									<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{{ insight.description }}</p>
									<span class="text-[10px] text-muted-foreground/60 mt-1 block">{{ insight.dataPoint }}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- CRM Actions or Growth Opportunities -->
					<div v-if="crmActions.length > 0" class="ios-card p-5">
						<div class="flex items-center gap-2 mb-4">
							<UIcon name="i-heroicons-rocket-launch" class="w-5 h-5 text-primary" />
							<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">
								{{ growthOpportunities.length > 0 ? 'Growth Opportunities' : 'CRM Actions' }}
							</h3>
						</div>

						<!-- Growth Opportunities -->
						<div v-if="growthOpportunities.length > 0" class="space-y-3">
							<div
								v-for="(opp, i) in growthOpportunities"
								:key="i"
								class="p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
							>
								<div class="flex items-start justify-between gap-2">
									<p class="text-sm font-medium text-foreground">{{ opp.title }}</p>
									<span class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0"
										:class="{
											'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': opp.effort === 'low',
											'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': opp.effort === 'medium',
											'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': opp.effort === 'high',
										}"
									>
										{{ opp.effort }} effort
									</span>
								</div>
								<p class="text-xs text-muted-foreground mt-1">{{ opp.description }}</p>
								<p class="text-xs text-primary mt-1">{{ opp.potentialImpact }}</p>
							</div>
						</div>

						<!-- Fallback: CRM Actions -->
						<div v-else class="space-y-3">
							<div
								v-for="(action, i) in crmActions"
								:key="i"
								class="flex items-start gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
								@click="action.link && goTo(action.link)"
							>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<p class="text-sm font-medium text-foreground">{{ action.title }}</p>
										<span class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full"
											:class="priorityChipClasses(action.priority)"
										>
											{{ action.priority }}
										</span>
									</div>
									<p class="text-xs text-muted-foreground mt-0.5">{{ action.description }}</p>
									<p class="text-xs text-primary/80 mt-1">{{ action.impact }}</p>
								</div>
							</div>
						</div>
					</div>
				</div>

					<!-- Marketing actions — compact (only when no social/email data) -->
					<CommandCenterMarketingActionsWidget v-if="showWidget('marketing-actions') && !marketingPulse.hasRichData.value" />

					<!-- Org/Team Goals chip strip — links to filtered /goals -->
					<div v-if="orgTeamGoalCount > 0" class="ios-card p-4 flex flex-wrap items-center gap-3">
						<div class="flex items-center gap-2">
							<UIcon name="i-heroicons-flag" class="w-4 h-4 text-amber-500" />
							<h3 class="text-xs font-semibold uppercase tracking-wide text-foreground/70">Shared Goals</h3>
						</div>
						<NuxtLink
							to="/goals?scope=team"
							class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 hover:bg-muted/70 text-[11px] font-medium transition-colors"
						>
							Team
							<span class="text-muted-foreground tabular-nums">{{ (goalsByScope.team || []).length }}</span>
						</NuxtLink>
						<NuxtLink
							to="/goals?scope=organization"
							class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 hover:bg-muted/70 text-[11px] font-medium transition-colors"
						>
							Organization
							<span class="text-muted-foreground tabular-nums">{{ (goalsByScope.organization || []).length }}</span>
						</NuxtLink>
						<NuxtLink to="/goals" class="ml-auto text-[11px] text-primary hover:underline">View all &rarr;</NuxtLink>
					</div>

					<!-- Goals Summary (org-wide snapshot — shows all scopes) -->
					<DeferUntilVisible v-if="showWidget('goals')" min-height="120px">
						<GoalsSummaryWidget />
					</DeferUntilVisible>

					<!-- Financial Analysis (full width) — deferred until scrolled near.
					     `invoices` / `deals` are dropped from accountant's default
					     module set and lazy-loaded here when the slot enters view. -->
					<DeferUntilVisible
						v-if="showWidget('financial-quarter')"
						min-height="320px"
						@enter="onFinancialEnter"
					>
						<CommandCenterFinancialQuarter />
					</DeferUntilVisible>
				</section>

				<!-- ─── REFERENCE band ─── -->
				<section
					v-if="showWidget('realtime-chat') || showWidget('card-desk')"
					style="order: 3"
					class="space-y-2"
				>
					<details class="group">
						<summary class="flex items-center gap-2 cursor-pointer list-none py-1 select-none">
							<UIcon name="i-heroicons-chevron-right" class="w-3.5 h-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
							<h2 class="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Less-used</h2>
							<div class="flex-1 h-px bg-border/40"></div>
						</summary>
						<div class="pt-4">
							<DeferUntilVisible min-height="500px" @enter="onChatDeskEnter">
								<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
									<div v-if="showWidget('realtime-chat')" class="h-[500px]">
										<CommandCenterRealtimeChat />
									</div>
									<CommandCenterCardDeskPipeline v-if="showWidget('card-desk')" />
								</div>
							</DeferUntilVisible>
						</div>
					</details>
				</section>

				</div><!-- /three-band wrapper -->

				</div><!-- /Commander tab -->

	<!-- ═══ Activity Feed (hidden — kept for future use) ═══ -->
				<!--
				<div v-show="false" class="lg:grid lg:grid-cols-[1fr_380px] lg:gap-6 lg:items-start">
					<div class="space-y-6">
						<CommandCenterTimeline />
					</div>
					<div class="hidden lg:block">
						<div class="lg:sticky lg:top-20 lg:self-start space-y-4">
							<CommandCenterTimelineMotivation
								:greeting="greeting"
								:tasks-completed="metrics?.tasksCompletedToday ?? 0"
								:current-score="earnestState.currentScore"
								:streak="earnestState.streak"
							/>
							<CommandCenterTimelineQuickStats :metrics="metrics" />
							<CommandCenterTimelineTrendChart :history="earnestState.history" />
						</div>
					</div>
				</div>
				-->

				<!-- ═══ Statistics Tab ═══ -->
				<div v-if="statisticsLoaded" v-show="activeTab === 'statistics'" class="space-y-6">
					<LazyDashboardStatisticsEmbed />
				</div>
			</div>

			<!-- AI Tray -->
			<CommandCenterAITray :is-open="aiTrayOpen" :initial-prompt="aiTrayPrompt" @close="handleTrayClose" />

			<!-- Weekly check-in modal (Stage 2.5). Mounted at root so the trigger
			     pill in YOU's right column doesn't have to portal out of its
			     stacking context. -->
			<GoalsWeeklyCheckinModal v-model="checkinOpen" />
		</div>
	</div>
	</NuxtLayout>
</template>

<style>
@reference "~/assets/css/tailwind.css";
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.hide-scrollbar::-webkit-scrollbar { display: none; }
.home {
	.building {
		max-width: 350px;

		@media (min-width: theme('screens.sm')) {
			max-width: 575px;
		}

		@media (min-width: theme('screens.md')) {
			max-width: 575px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 600px;
		}
	}

	.temp-heading {
		font-size: 12px;
		bottom: 0px;
		@apply uppercase tracking-wide;
		max-width: 400px;

		@media (min-width: theme('screens.md')) {
			max-width: 400px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 440px;
		}
	}

	.logo {
		max-width: 400px;
		@apply px-6 mt-8;

		@media (min-width: theme('screens.md')) {
			max-width: 400px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 600px;
		}

		path {
			opacity: 0.4;
			animation-name: example;
			animation-duration: 5s;
			animation-timing-function: var(--curve);
			animation-iteration-count: infinite;
		}

		path:nth-of-type(1) { animation-delay: 0.1s; }
		path:nth-of-type(2) { animation-delay: 0.2s; }
		path:nth-of-type(3) { animation-delay: 0.3s; }
		path:nth-of-type(4) { animation-delay: 0.4s; }
		path:nth-of-type(5) { animation-delay: 0.5s; }
		path:nth-of-type(6) { animation-delay: 0.6s; }
		path:nth-of-type(7) { animation-delay: 0.7s; }
		path:nth-of-type(8) { animation-delay: 0.8s; }
		path:nth-of-type(9) { animation-delay: 0.9s; }
		path:nth-of-type(10) { animation-delay: 1s; }
	}

	@keyframes example {
		0% { opacity: 0.4; }
		50% { opacity: 1; }
		100% { opacity: 0.4; }
	}
}
</style>

<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ title: 'Home | Earnest' });

const { user } = useDirectusAuth();
const config = useRuntimeConfig();

// Redirect unauthenticated users to login
if (!user.value) {
	await navigateTo('/auth/signin');
}

const layout = 'default';

// ── Layout mode ──
const { currentMode } = useLayoutMode();

// ── Hats ──
const { hats, activeHat, setHat } = useNavPreferences();

// ── Productivity Engine (existing) ──
const { suggestions, metrics, isAnalyzing, greeting, subtitle, analyze } = useAIProductivityEngine();
const { enabledModules } = useAIPreferences();
const { selectedPersona } = useAIPersona();

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
const priorityBg: Record<string, string> = {
	urgent: 'bg-red-50/50 dark:bg-red-900/10',
	high: 'bg-amber-50/50 dark:bg-amber-900/10',
	medium: 'bg-blue-50/30 dark:bg-blue-900/10',
	low: 'bg-gray-50/30 dark:bg-gray-800/30',
};

const priorityAccent: Record<string, string> = {
	urgent: 'bg-red-500',
	high: 'bg-amber-500',
	medium: 'bg-blue-500',
	low: 'bg-gray-300',
};

const priorityIconColor: Record<string, string> = {
	urgent: 'text-red-500',
	high: 'text-amber-500',
	medium: 'text-blue-500',
	low: 'text-gray-400',
};

// ── Analysis Flow ──
const runAnalysis = async () => {
	await Promise.all([
		analyze(new Set(enabledModules.value)),
		syncState(metrics.value),
	]);
	await fetchTeamRanking();
	if (leveledUp.value || (newBadges.value && newBadges.value.length > 0)) {
		celebrate();
	}
};

// CRM AI analysis is now on-demand only (user clicks "Run AI Analysis")
// The algorithmic snapshot loads automatically via the composable
const runCRMAnalysis = () => {
	if (selectedOrg.value) {
		crmAnalyze('overview');
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
</script>

<template>
	<NuxtLayout :name="layout">
	<div class="min-h-screen t-bg t-text">
		<!-- Action Board: shown when user IS logged in -->
		<div v-if="user" class="min-h-screen bg-background">
			<div class="max-w-screen-xl mx-auto px-4 pb-8 sm:px-6 lg:px-8 space-y-6">
				<!-- Greeting + Assistant Button -->
				<div class="flex items-end justify-between pt-2">
					<div>
						<h1 class="text-[28px] font-bold text-foreground tracking-tight leading-tight">{{ greeting }}</h1>
						<p class="text-[15px] text-muted-foreground mt-0.5">{{ subtitle }}</p>
					</div>
					<button
						@click="aiTrayPrompt = ''; aiTrayOpen = true"
						class="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-full shadow-sm transition-all duration-200 text-[13px] font-medium ios-press"
					>
						<EarnestIcon class="w-4 h-4" />
						<span class="hidden sm:inline">Earnest</span>
					</button>
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

				<!-- Badge Highlights + Score Stat -->
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
					<div class="w-px h-5 bg-border/60 shrink-0" />
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

				<!-- Hat Modes (hidden in Spaces layout — sidebar provides navigation) -->
				<div v-if="currentMode !== 'spaces'" class="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
					<button
						v-for="hat in hats"
						:key="hat.id"
						class="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition-all ios-press flex-shrink-0"
						:class="activeHat.id === hat.id
							? 'bg-primary/10 text-primary ring-1 ring-primary/20'
							: 'bg-card text-muted-foreground hover:bg-muted/50 border border-border/40'"
						@click="setHat(hat.id)"
					>
						<UIcon :name="hat.icon" class="w-[18px] h-[18px] flex-shrink-0" />
						<span>{{ hat.name }}</span>
					</button>
				</div>

				<!-- Unified Gantt Timeline -->
				<ClientOnly>
					<div class="ios-card p-4 overflow-hidden">
						<div class="flex items-center gap-2 mb-3">
							<UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-primary" />
							<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Project Timeline</h3>
						</div>
						<ProjectTimelineUnifiedGantt compact />
					</div>
				</ClientOnly>

				<!-- Priority Actions + Quick Tasks | CRM Health + Earnest Score -->
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
								<div v-for="n in 4" :key="n" class="h-16 bg-muted rounded-xl animate-pulse" />
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
											:class="{
												'bg-red-500/10': action.priority === 'urgent',
												'bg-amber-500/10': action.priority === 'high',
												'bg-blue-500/10': action.priority === 'medium',
												'bg-muted/60': action.priority === 'low',
											}"
										>
											<UIcon
												:name="action.icon"
												class="w-4 h-4"
												:class="priorityIconColor[action.priority] || priorityIconColor.low"
											/>
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-foreground truncate">{{ action.title }}</p>
											<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{{ action.description }}</p>
										</div>
										<div class="flex-shrink-0 flex items-center gap-2">
											<span
												class="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
												:class="{
													'text-red-500 bg-red-500/10': action.priority === 'urgent',
													'text-amber-500 bg-amber-500/10': action.priority === 'high',
													'text-blue-500 bg-blue-500/10': action.priority === 'medium',
													'text-muted-foreground bg-muted/40': action.priority === 'low',
												}"
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
						<CommandCenterQuickTasksWidget />
					</div>

					<!-- Right Column: CRM Health + Earnest Score (1/3 width, stretch to match) -->
					<div class="space-y-4 flex flex-col">
						<div :class="healthBg" class="ios-card p-5 text-center flex-1">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">CRM Health</h3>

							<!-- Loading (snapshot) -->
							<div v-if="crmSnapshotLoading && healthScore === null" class="py-4">
								<div class="w-20 h-20 mx-auto bg-muted rounded-full animate-pulse" />
								<div class="w-24 h-3 mx-auto bg-muted rounded mt-3 animate-pulse" />
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
								<UIcon name="i-heroicons-chart-bar" class="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
								<p class="text-xs text-muted-foreground">CRM analysis will appear here</p>
								<button
									@click="runCRMAnalysis"
									class="mt-2 text-xs text-primary hover:underline"
								>
									Run Analysis
								</button>
							</div>
						</div>

						<!-- Earnest Score -->
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
						/>
					</div>
				</div>

				<!-- CRM Insights + Growth Opportunities -->
				<div v-if="crmInsights.length > 0 || crmActions.length > 0" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
											:class="{
												'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': action.priority === 'urgent',
												'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': action.priority === 'high',
												'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': action.priority === 'medium',
												'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400': action.priority === 'low',
											}"
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

				<!-- Goals Summary -->
				<GoalsSummaryWidget />

	
				<!-- Other Suggestions (lower priority) -->
				<div v-if="otherSuggestions.length > 0" class="ios-card p-5">
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

				<!-- Bottom Section: Chat + CardDesk -->
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div class="h-[500px]">
						<CommandCenterRealtimeChat />
					</div>
					<CommandCenterCardDeskPipeline />
				</div>

				<!-- Financial Analysis (full width) -->
				<CommandCenterFinancialQuarter />

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
				<div v-show="activeTab === 'statistics'" class="space-y-6">
					<LazyDashboardStatisticsEmbed />
				</div>
			</div>

			<!-- AI Tray -->
			<CommandCenterAITray :is-open="aiTrayOpen" :initial-prompt="aiTrayPrompt" @close="handleTrayClose" />
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

<script setup lang="ts">
const { user } = useDirectusAuth();

// ── Productivity Engine (existing) ──
const { suggestions, metrics, isAnalyzing, greeting, subtitle, analyze } = useAIProductivityEngine();
const { enabledModules } = useAIPreferences();
const { selectedPersona } = useAIPersona();

// Update greeting when persona changes
watch(selectedPersona, () => {
	if (user.value) runAnalysis();
});

// ── CRM Intelligence Engine ──
const { analyze: crmAnalyze, overview: crmOverview, isLoading: crmLoading } = useCRMIntelligence();

// ── Earnest Score ──
const { state: earnestState, syncState, fetchState, fetchTeamRanking, fetchHistory, newBadges, leveledUp } = useEarnestScore();
const { celebrate } = useConfetti();

// ── Context ──
const { selectedOrg } = useOrganization();
const { selectedTeam } = useTeams();
const { selectedClient } = useClients();
const router = useRouter();

// ── AI Prompt ──
const promptInput = ref('');
const promptFocused = ref(false);
const aiTrayOpen = ref(false);
const aiTrayPrompt = ref('');

const handlePromptSubmit = () => {
	const query = promptInput.value.trim();
	if (!query) return;
	// Open AI tray and send the prompt
	aiTrayPrompt.value = query;
	aiTrayOpen.value = true;
	promptInput.value = '';
};

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

// ── CRM Health ──
const healthScore = computed(() => crmOverview.value?.healthScore ?? null);
const healthBreakdown = computed(() => crmOverview.value?.healthBreakdown ?? null);
const crmInsights = computed(() => crmOverview.value?.insights?.slice(0, 4) ?? []);
const growthOpportunities = computed(() => crmOverview.value?.growthOpportunities?.slice(0, 3) ?? []);
const crmActions = computed(() => crmOverview.value?.topActions?.slice(0, 4) ?? []);

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
	urgent: 'bg-red-50/50 dark:bg-red-900/10 border-l-red-500',
	high: 'bg-amber-50/50 dark:bg-amber-900/10 border-l-amber-500',
	medium: 'bg-blue-50/30 dark:bg-blue-900/10 border-l-blue-500',
	low: 'bg-gray-50/30 dark:bg-gray-800/30 border-l-gray-300',
};

const priorityIconColor: Record<string, string> = {
	urgent: 'text-red-500',
	high: 'text-amber-500',
	medium: 'text-blue-500',
	low: 'text-gray-400',
};

// ── Analysis Flow ──
const runAnalysis = async () => {
	await analyze(new Set(enabledModules.value));
	await syncState(metrics.value);
	await fetchTeamRanking();
	if (leveledUp.value || (newBadges.value && newBadges.value.length > 0)) {
		celebrate();
	}
};

const runCRMAnalysis = () => {
	if (selectedOrg.value) {
		crmAnalyze('overview');
	}
};

onMounted(async () => {
	if (user.value) {
		await fetchState();
		runAnalysis();
		runCRMAnalysis();
		fetchHistory(7);
	}
});

watch(user, (newUser) => {
	if (newUser) {
		runAnalysis();
		runCRMAnalysis();
	}
});

watch([selectedOrg, selectedClient, selectedTeam], () => {
	if (user.value) {
		runAnalysis();
		runCRMAnalysis();
	}
});

// Show leaderboard when a team is selected
const showLeaderboard = computed(() => !!selectedTeam.value);

const navigateTo = (route: string) => {
	router.push(route);
};

// ── Tabs: Command Center / Timeline / Statistics ──
const activeTab = ref<'commander' | 'timeline' | 'statistics'>('commander');
</script>

<template>
	<div class="min-h-screen" :class="user ? 't-bg t-text' : ''">
		<!-- Marketing Page: shown when user is NOT logged in -->
		<PagesSellSheet v-if="!user" />

		<!-- Action Board: shown when user IS logged in -->
		<div v-else class="min-h-screen bg-background">
			<div class="max-w-screen-xl mx-auto px-4 pt-16 pb-8 sm:px-6 lg:px-8 space-y-6">
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
						<UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
						<span class="hidden sm:inline">Earnest AI</span>
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
						@click="activeTab = 'timeline'"
						class="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
						:class="activeTab === 'timeline'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'"
					>
						<span class="flex items-center justify-center gap-1.5">
							<UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" />
							Timeline
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

				<!-- Smart Prompt -->
				<div class="ios-card p-1">
					<form @submit.prevent="handlePromptSubmit" class="relative">
						<div class="flex items-center">
							<UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary ml-4 flex-shrink-0" />
							<input
								v-model="promptInput"
								type="text"
								placeholder="What do you need help with?"
								class="flex-1 bg-transparent px-3 py-3.5 text-[15px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
								@focus="promptFocused = true"
								@blur="promptFocused = false"
							/>
							<button
								v-if="promptInput.trim()"
								type="submit"
								class="mr-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-full text-xs font-medium transition-all ios-press"
							>
								Go
							</button>
						</div>
					</form>
				</div>

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
							<div v-else class="space-y-2">
								<div
									v-for="action in topActions"
									:key="action.id"
									:class="[priorityBg[action.priority] || priorityBg.low]"
									class="relative rounded-lg p-3 pl-5 border-l-[3px] hover:shadow-md transition-all duration-200 cursor-pointer group overflow-hidden ios-card"
									@click="action.actionRoute && navigateTo(action.actionRoute)"
								>
									<div class="flex items-start gap-3">
										<div class="flex-shrink-0 mt-0.5">
											<UIcon
												:name="action.icon"
												class="w-5 h-5"
												:class="priorityIconColor[action.priority] || priorityIconColor.low"
											/>
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-foreground truncate">{{ action.title }}</p>
											<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{{ action.description }}</p>
										</div>
										<div class="flex-shrink-0 flex items-center gap-2">
											<span class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full"
												:class="{
													'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': action.priority === 'urgent',
													'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': action.priority === 'high',
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

							<!-- Loading -->
							<div v-if="crmLoading && healthScore === null" class="py-4">
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
					<!-- AI Insights -->
					<div v-if="crmInsights.length > 0" class="ios-card p-5">
						<div class="flex items-center gap-2 mb-4">
							<UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-primary" />
							<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">AI Insights</h3>
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
								@click="action.link && navigateTo(action.link)"
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

				<!-- Bottom Section: Chat + CardDesk + Financials -->
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div class="h-[500px]">
						<CommandCenterRealtimeChat />
					</div>
					<CommandCenterCardDeskPipeline />
					<CommandCenterFinancialQuarter />
				</div>

				</div><!-- /Commander tab -->

				<!-- ═══ Timeline Tab ═══ -->
				<div v-show="activeTab === 'timeline'" class="lg:grid lg:grid-cols-[1fr_380px] lg:gap-6 lg:items-start">
					<div class="space-y-6">
						<CommandCenterTimeline />
					</div>
					<div class="hidden lg:block">
						<div class="lg:sticky lg:top-20 lg:self-start space-y-4">
							<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70 flex items-center gap-2">
								<UIcon name="i-heroicons-chart-bar-square" class="w-4 h-4 text-primary" />
								Insights
							</h3>
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

				<!-- ═══ Statistics Tab ═══ -->
				<div v-show="activeTab === 'statistics'" class="space-y-6">
					<LazyDashboardStatisticsEmbed />
				</div>
			</div>

			<!-- AI Tray -->
			<CommandCenterAITray :is-open="aiTrayOpen" :initial-prompt="aiTrayPrompt" @close="handleTrayClose" />
		</div>
	</div>
</template>

<style>
@reference "~/assets/css/tailwind.css";
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

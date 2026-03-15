<script setup lang="ts">
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

// ── Command Center (logged-in) ──
const { suggestions, metrics, isAnalyzing, greeting, analyze } = useAIProductivityEngine();
const { enabledModules } = useAIPreferences();
const aiTrayOpen = ref(false);

// ── Earnest Score ──
const { state: earnestState, syncState, fetchState, fetchTeamRanking, newBadges, leveledUp } = useEarnestScore();
const { celebrate } = useConfetti();

const badges = computed(() => {
	const b: Record<string, number> = {};
	if (metrics.value.overdueItems > 0) b.tasks = metrics.value.overdueItems;
	if (metrics.value.overdueProjects > 0) b.projects = metrics.value.overdueProjects;
	if (metrics.value.unreadChannelMessages > 0) b.messages = metrics.value.unreadChannelMessages;
	if (metrics.value.failedSocialPosts > 0) b.social = metrics.value.failedSocialPosts;
	if (metrics.value.upcomingMeetings > 0) b.scheduler = metrics.value.upcomingMeetings;
	return b;
});

const topSuggestions = computed(() => {
	return suggestions.value.slice(0, 5);
});

const runAnalysis = async () => {
	await analyze(new Set(enabledModules.value));
	// Sync earnest score after productivity analysis completes
	await syncState(metrics.value);
	await fetchTeamRanking();
	// Celebrate achievements
	if (leveledUp.value || (newBadges.value && newBadges.value.length > 0)) {
		celebrate();
	}
};

onMounted(async () => {
	if (user.value) {
		await fetchState();
		runAnalysis();
	}
});

watch(user, (newUser) => {
	if (newUser) {
		runAnalysis();
	}
});

// Re-run analysis when org/client/team changes
const { selectedOrg } = useOrganization();
const { selectedTeam } = useTeams();
const { selectedClient } = useClients();

// Show leaderboard when a team is selected
const showLeaderboard = computed(() => !!selectedTeam.value);

watch([selectedOrg, selectedClient, selectedTeam], () => {
	if (user.value) {
		runAnalysis();
	}
});
</script>

<template>
	<div class="min-h-screen t-bg t-text">
		<!-- Marketing Page: shown when user is NOT logged in -->
		<PagesSellSheet v-if="!user" />

		<!-- Command Center: shown when user IS logged in -->
		<div v-else class="min-h-screen bg-background">
			<div class="max-w-7xl mx-auto px-4 pt-16 pb-8 sm:px-6 lg:px-8 space-y-5">
				<!-- iOS Large Title + AI button -->
				<div class="flex items-end justify-between pt-2">
					<div>
						<h1 class="text-[28px] font-bold text-foreground tracking-tight leading-tight">{{ greeting }}</h1>
						<p class="text-[15px] text-muted-foreground mt-0.5">Here's what needs your attention</p>
					</div>
					<button
						@click="aiTrayOpen = true"
						class="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-full shadow-sm transition-all duration-200 text-[13px] font-medium ios-press"
					>
						<UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
						<span class="hidden sm:inline">Assistant</span>
					</button>
				</div>

				<!-- App Grid -->
				<div class="ios-card p-6">
					<CommandCenterAppGrid :badges="badges" />
				</div>

				<!-- Earnest Score + Smart Suggestions -->
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

					<div class="lg:col-span-2 ios-card p-5">
						<div class="flex items-center justify-between mb-4">
							<div class="flex items-center gap-2">
								<UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary" />
								<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">
									Smart Suggestions
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

						<div v-if="isAnalyzing" class="space-y-2">
							<div v-for="n in 3" :key="n" class="h-14 bg-muted rounded-xl animate-pulse" />
						</div>

						<div v-else-if="topSuggestions.length === 0" class="text-center py-8 text-muted-foreground">
							<UIcon name="i-heroicons-check-circle" class="w-10 h-10 mx-auto mb-2 text-success" />
							<p class="text-sm">You're all caught up!</p>
						</div>

						<div v-else class="space-y-2">
							<CommandCenterSuggestionCard
								v-for="suggestion in topSuggestions"
								:key="suggestion.id"
								:suggestion="suggestion"
							/>
						</div>

						<button
							v-if="suggestions.length > 5"
							@click="aiTrayOpen = true"
							class="mt-3 text-xs text-primary hover:underline w-full text-center"
						>
							View all {{ suggestions.length }} suggestions &rarr;
						</button>
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
			</div>

			<!-- AI Tray -->
			<CommandCenterAITray :is-open="aiTrayOpen" @close="aiTrayOpen = false" />
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

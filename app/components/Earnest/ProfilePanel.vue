<template>
	<div class="space-y-6 max-w-xl">
		<!-- Header card -->
		<div class="ios-card rounded-2xl border border-border bg-card p-5 space-y-4">
			<div class="flex items-center gap-4">
				<div class="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
					<EarnestIcon class="w-7 h-7 text-primary" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2">
						<h2 class="text-lg font-bold text-foreground">{{ earnest.levelTitle }}</h2>
						<span class="text-xs font-medium text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">Lvl {{ earnest.level }}</span>
					</div>
					<p class="text-sm text-muted-foreground mt-0.5">{{ earnest.totalEP.toLocaleString() }} Earnest Points</p>
				</div>
				<div class="text-right">
					<span class="text-3xl font-bold tabular-nums" :class="tier.color">{{ earnest.currentScore }}</span>
					<p class="text-[10px] uppercase tracking-wider font-semibold" :class="tier.color">{{ tier.label }}</p>
				</div>
			</div>

			<!-- Level progress -->
			<EarnestLevelProgress
				:level="earnest.level"
				:title="earnest.levelTitle"
				:total-e-p="earnest.totalEP"
				:next-level-e-p="earnest.nextLevelEP"
				:progress="earnest.levelProgress"
			/>

			<!-- Quick stats -->
			<div class="grid grid-cols-3 gap-3 pt-2 border-t border-border">
				<div class="text-center">
					<p class="text-lg font-bold text-foreground tabular-nums">{{ earnest.streak }}</p>
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Day Streak</p>
				</div>
				<div class="text-center">
					<p class="text-lg font-bold text-foreground tabular-nums">{{ earnest.bestStreak }}</p>
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Best Streak</p>
				</div>
				<div class="text-center">
					<p class="text-lg font-bold text-foreground tabular-nums">{{ badgesUnlocked }}</p>
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Badges</p>
				</div>
			</div>
		</div>

		<!-- Dimensions breakdown -->
		<div class="ios-card rounded-2xl border border-border bg-card p-5 space-y-3">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dimensions</h3>
			<EarnestDimensionChart :dimensions="earnest.dimensions" />
			<p class="text-[11px] text-muted-foreground pt-1 border-t border-border">
				Your earnest score measures <strong>follow-through</strong>, <strong>CRM discipline</strong>, <strong>consistency</strong>,
				<strong>responsiveness</strong>, <strong>proactivity</strong>, and <strong>depth</strong> of engagement.
			</p>
		</div>

		<!-- Badges -->
		<div class="ios-card rounded-2xl border border-border bg-card p-5 space-y-3">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Badges</h3>
			<EarnestBadgeGrid :badges="earnest.badges" />
		</div>

		<!-- Trend -->
		<div class="ios-card rounded-2xl border border-border bg-card p-5">
			<EarnestTrendChart :history="earnest.history" />
		</div>

		<!-- Team rank -->
		<div v-if="earnest.teamRank" class="ios-card rounded-2xl border border-border bg-card p-5 space-y-2">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team Standing</h3>
			<div class="flex items-center gap-3">
				<span class="text-2xl font-bold text-primary tabular-nums">#{{ earnest.teamRank }}</span>
				<span class="text-sm text-muted-foreground">of {{ earnest.teamSize }} members</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const { state: earnest, fetchState, fetchHistory, fetchTeamRanking, getScoreTier } = useEarnestScore();

const tier = computed(() => getScoreTier(earnest.value.currentScore));

const badgesUnlocked = computed(() => earnest.value.badges.filter((b) => b.unlocked).length);

onMounted(async () => {
	await fetchState();
	await Promise.all([fetchHistory(), fetchTeamRanking()]);
});
</script>

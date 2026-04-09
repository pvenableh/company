<template>
	<div class="ios-card rounded-2xl border border-border bg-card p-4 space-y-4">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
					<UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-primary" />
				</div>
				<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earnest Score</h3>
			</div>
			<EarnestRankBadge :rank="teamRank" :team-size="teamSize" />
		</div>

		<!-- Score display -->
		<div class="flex items-end justify-between">
			<div>
				<div class="flex items-baseline gap-1">
					<span class="text-4xl font-bold tabular-nums" :class="tier.color">{{ currentScore }}</span>
					<span class="text-sm text-muted-foreground">/100</span>
				</div>
				<p class="text-xs font-medium mt-0.5" :class="tier.color">{{ tier.label }}</p>
			</div>
			<EarnestStreakIndicator :streak="streak" />
		</div>

		<!-- Score bar -->
		<div class="h-2 rounded-full bg-muted/40 overflow-hidden">
			<div
				class="h-full rounded-full transition-all duration-700 ease-out"
				:class="tier.bg"
				:style="{ width: `${currentScore}%` }"
			/>
		</div>

		<!-- Level progress -->
		<EarnestLevelProgress
			:level="level"
			:title="levelTitle"
			:total-e-p="totalEP"
			:next-level-e-p="nextLevelEP"
			:progress="levelProgress"
		/>

		<!-- Dimensions -->
		<EarnestDimensionChart :dimensions="dimensions" />
	</div>
</template>

<script setup lang="ts">
import type { DimensionScores } from '~/composables/useEarnestScore';

const props = defineProps<{
	currentScore: number;
	level: number;
	levelTitle: string;
	totalEP: number;
	nextLevelEP: number;
	levelProgress: number;
	streak: number;
	teamRank: number | null;
	teamSize: number | null;
	dimensions: DimensionScores;
}>();

const { getScoreTier } = useEarnestScore();

const tier = computed(() => getScoreTier(props.currentScore));
</script>

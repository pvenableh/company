<template>
	<div class="flex flex-col items-center gap-4">
		<!-- Circular score -->
		<div class="relative w-32 h-32">
			<svg class="w-full h-full -rotate-90" viewBox="0 0 120 120">
				<circle
					cx="60" cy="60" r="52"
					fill="none"
					stroke="currentColor"
					stroke-width="8"
					class="text-muted/20"
				/>
				<circle
					cx="60" cy="60" r="52"
					fill="none"
					:stroke="scoreColor"
					stroke-width="8"
					stroke-linecap="round"
					:stroke-dasharray="circumference"
					:stroke-dashoffset="dashOffset"
					class="transition-all duration-1000 ease-out"
				/>
			</svg>
			<div class="absolute inset-0 flex flex-col items-center justify-center">
				<span class="text-3xl font-bold text-foreground">{{ animatedScore }}</span>
				<span class="text-[10px] text-muted-foreground uppercase tracking-wider">Score</span>
			</div>
		</div>

		<!-- Breakdown bars -->
		<div v-if="breakdown" class="w-full space-y-2.5">
			<div v-for="(item, key) in breakdownItems" :key="key">
				<div class="flex items-center justify-between mb-1">
					<span class="text-xs text-muted-foreground">{{ item.label }}</span>
					<span class="text-xs font-medium text-foreground">{{ item.value }}</span>
				</div>
				<div class="h-1.5 rounded-full bg-muted/20 overflow-hidden">
					<div
						class="h-full rounded-full transition-all duration-700 ease-out"
						:class="getBarColor(item.value)"
						:style="{ width: `${item.value}%` }"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { MarketingHealthBreakdown } from '~~/types/marketing';

const props = defineProps<{
	score: number;
	breakdown?: MarketingHealthBreakdown;
}>();

const circumference = 2 * Math.PI * 52;
const dashOffset = computed(() => circumference - (props.score / 100) * circumference);

const scoreColor = computed(() => {
	if (props.score >= 70) return '#22c55e';
	if (props.score >= 40) return '#eab308';
	return '#ef4444';
});

// Animate score number on mount
const animatedScore = ref(0);
watch(() => props.score, (newVal) => {
	const start = animatedScore.value;
	const duration = 800;
	const startTime = Date.now();
	const animate = () => {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);
		animatedScore.value = Math.round(start + (newVal - start) * progress);
		if (progress < 1) requestAnimationFrame(animate);
	};
	requestAnimationFrame(animate);
}, { immediate: true });

const breakdownItems = computed(() => {
	if (!props.breakdown) return [];
	return [
		{ label: 'Content Consistency', value: props.breakdown.contentConsistency },
		{ label: 'Audience Growth', value: props.breakdown.audienceGrowth },
		{ label: 'Engagement', value: props.breakdown.engagement },
		{ label: 'Email Performance', value: props.breakdown.emailPerformance },
	];
});

function getBarColor(value: number): string {
	if (value >= 70) return 'bg-green-500';
	if (value >= 40) return 'bg-yellow-500';
	return 'bg-red-500';
}
</script>

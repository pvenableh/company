<template>
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">30-Day Trend</h4>
			<span v-if="history.length > 1" class="text-[10px] tabular-nums" :class="trendDirection >= 0 ? 'text-green-500' : 'text-red-500'">
				{{ trendDirection >= 0 ? '+' : '' }}{{ trendDirection }}%
			</span>
		</div>
		<!-- SVG sparkline -->
		<div class="relative h-12 w-full">
			<svg v-if="history.length > 1" class="w-full h-full" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none">
				<!-- Area fill -->
				<path
					:d="areaPath"
					class="fill-primary/10"
				/>
				<!-- Line -->
				<path
					:d="linePath"
					class="stroke-primary fill-none"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<!-- Current value dot -->
				<circle
					v-if="points.length > 0"
					:cx="points[points.length - 1].x"
					:cy="points[points.length - 1].y"
					r="2.5"
					class="fill-primary"
				/>
			</svg>
			<div v-else class="flex items-center justify-center h-full text-xs text-muted-foreground">
				Score history will appear here
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	history: { date: string; score: number; ep: number }[];
}>();

const width = 200;
const height = 48;
const padding = 4;

const points = computed(() => {
	if (props.history.length < 2) return [];
	const scores = props.history.map((h) => h.score);
	const minScore = Math.max(0, Math.min(...scores) - 5);
	const maxScore = Math.min(100, Math.max(...scores) + 5);
	const range = maxScore - minScore || 1;

	return props.history.map((h, i) => ({
		x: padding + (i / (props.history.length - 1)) * (width - padding * 2),
		y: padding + (1 - (h.score - minScore) / range) * (height - padding * 2),
	}));
});

const linePath = computed(() => {
	if (points.value.length < 2) return '';
	return points.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
});

const areaPath = computed(() => {
	if (points.value.length < 2) return '';
	const line = points.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
	const last = points.value[points.value.length - 1];
	const first = points.value[0];
	return `${line} L ${last.x} ${height} L ${first.x} ${height} Z`;
});

const trendDirection = computed(() => {
	if (props.history.length < 2) return 0;
	const recent = props.history.slice(-7);
	const older = props.history.slice(0, Math.max(1, props.history.length - 7));
	const recentAvg = recent.reduce((s, h) => s + h.score, 0) / recent.length;
	const olderAvg = older.reduce((s, h) => s + h.score, 0) / older.length;
	return Math.round(recentAvg - olderAvg);
});
</script>

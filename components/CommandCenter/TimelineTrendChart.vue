<template>
	<div class="ios-card p-5">
		<div class="flex items-center gap-2 mb-4">
			<UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-primary" />
			<h3 class="text-sm font-semibold text-foreground">7-Day Score Trend</h3>
		</div>

		<ClientOnly>
			<div v-if="chartData.length >= 2" class="h-40">
				<ChartContainer :config="chartConfig" class="aspect-auto h-full w-full">
					<VisXYContainer :data="chartData" :padding="{ top: 10 }" :y-domain="[0, 100]">
						<VisLine
							:x="xAccessor"
							:y="yAccessors"
							:color="[chartConfig.score.color]"
							:curve-type="CurveType.MonotoneX"
						/>
						<VisAxis type="x" :x="xAccessor" :tick-format="xTickFormat" :grid-line="false" :tick-line="false" :domain-line="false" />
						<VisAxis type="y" :grid-line="true" :tick-line="false" :domain-line="false" />
						<ChartCrosshair
							:template="crosshairTemplate"
							:color="[chartConfig.score.color]"
						/>
					</VisXYContainer>
				</ChartContainer>
			</div>

			<div v-else class="h-40 flex items-center justify-center">
				<div class="text-center">
					<UIcon name="i-heroicons-chart-bar" class="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
					<p class="text-xs text-muted-foreground">Not enough data yet</p>
					<p class="text-[10px] text-muted-foreground/60 mt-0.5">Check back after a few days</p>
				</div>
			</div>
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import { ChartContainer, ChartCrosshair, ChartTooltipContent, componentToString } from '~/components/ui/chart';
import { VisXYContainer, VisLine, VisAxis } from '@unovis/vue';
import { CurveType } from '@unovis/ts';

const props = defineProps<{
	history: { date: string; score: number; ep: number }[];
}>();

const chartConfig = {
	score: { label: 'Score', color: 'hsl(var(--primary))' },
};

const xAccessor = (d: any) => d.index;
const yAccessors = [(d: any) => d.score];

const chartData = computed(() => {
	const last7 = props.history.slice(-7);
	return last7.map((entry, i) => ({
		index: i,
		name: formatDate(entry.date),
		score: entry.score,
	}));
});

const xTickFormat = (i: number) => {
	const idx = Math.round(i);
	if (idx < 0 || idx >= chartData.value.length) return '';
	return chartData.value[idx]?.name || '';
};

const crosshairTemplate = componentToString(chartConfig, ChartTooltipContent, { hideLabel: true });

const formatDate = (dateStr: string) => {
	try {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { weekday: 'short' });
	} catch {
		return dateStr;
	}
};
</script>

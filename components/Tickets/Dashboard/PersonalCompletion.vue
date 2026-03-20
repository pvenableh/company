<template>
	<UCard>
		<template #header>
			<div class="flex justify-between items-center">
				<div class="flex items-center">
					<h2 class="font-bold uppercase tracking-wide text-sm">Your Completion Rate</h2>

					<UPopover mode="hover" :ui="{ rounded: 'rounded-sm' }">
						<UIcon
							name="i-heroicons-information-circle"
							class="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help ml-1"
						/>

						<template #panel>
							<div class="p-4 max-w-sm">
								<p class="text-xs text-gray-600">
									This chart tracks your ticket completion rate (percentage of assigned tickets resolved) and the
									absolute number of tickets you've completed over time. Higher completion rates indicate greater
									efficiency.
								</p>
							</div>
						</template>
					</UPopover>
				</div>
				<UBadge color="green" variant="soft">Last {{ timePeriodLabel }}</UBadge>
			</div>
		</template>
		<div class="h-80">
			<ClientOnly>
				<template v-if="data && data.length && chartData.length > 0">
					<ChartContainer :config="chartConfig" class="h-full">
						<VisXYContainer :key="chartData.length" :data="chartData" :padding="{ top: 10 }">
							<VisGroupedBar
								:x="(d: any) => d.index"
								:y="[(d: any) => d.rate, (d: any) => d.tickets]"
								:color="['var(--color-rate)', 'var(--color-tickets)']"
								:bar-padding="0.2"
							/>
							<VisAxis type="x" :tick-format="(i: number) => { const idx = Math.round(i); return idx >= 0 && idx < chartData.value.length ? chartData.value[idx]?.name || '' : ''; }" :grid-line="false" />
							<VisAxis type="y" :tick-format="(v: number) => v + '%'" :grid-line="true" />
							<ChartCrosshair
								:template="crosshairTemplate"
								:color="['var(--color-rate)', 'var(--color-tickets)']"
							/>
						</VisXYContainer>
					</ChartContainer>
					<div class="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
						<span class="flex items-center gap-1.5">
							<span class="w-3 h-3 rounded-sm" style="background: rgba(92, 214, 254, 0.9)"></span>
							Completion Rate %
						</span>
						<span class="flex items-center gap-1.5">
							<span class="w-3 h-3 rounded-sm" style="background: rgba(4, 148, 197, 0.9)"></span>
							Tickets Completed
						</span>
					</div>
				</template>
				<div v-else class="h-full flex items-center justify-center text-muted-foreground">
					No personal completion data available
				</div>
			</ClientOnly>
		</div>
	</UCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChartContainer, ChartCrosshair, ChartTooltipContent, componentToString } from '~/components/ui/chart';
import { VisXYContainer, VisGroupedBar, VisAxis } from '@unovis/vue';

const props = defineProps({
	data: {
		type: Array,
		required: true,
	},
	timePeriodLabel: {
		type: String,
		required: true,
	},
});

const chartConfig = {
	rate: { label: 'Completion Rate %', color: 'rgba(92, 214, 254, 0.9)' },
	tickets: { label: 'Tickets Completed', color: 'rgba(4, 148, 197, 0.9)' },
};

const crosshairTemplate = componentToString(chartConfig, ChartTooltipContent, { hideLabel: true });

const chartData = computed(() => {
	return props.data.map((item, i) => ({
		index: i,
		name: item.name,
		rate: item.rate,
		tickets: item.tickets,
	}));
});
</script>

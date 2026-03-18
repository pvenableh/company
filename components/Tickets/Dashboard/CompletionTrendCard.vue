<template>
	<UCard>
		<template #header>
			<div class="flex justify-between items-center">
				<div class="flex items-center">
					<h2 class="font-bold uppercase tracking-wide text-sm">Completion Rate Trend</h2>
					<UPopover mode="hover" :ui="{ rounded: 'rounded-sm' }">
						<UIcon
							name="i-heroicons-information-circle"
							class="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help ml-1"
						/>

						<template #panel>
							<div class="p-4 max-w-sm">
								<p class="text-xs text-gray-600">
									This chart shows the number of tickets created versus completed over time. The completion rate (shown
									in tooltips) is calculated as (completed tickets / created tickets) x 100%. Higher rates indicate more
									efficient ticket processing.
								</p>
							</div>
						</template>
					</UPopover>
				</div>
				<UBadge color="cyan" variant="soft">Last {{ timePeriodLabel }}</UBadge>
			</div>
		</template>
		<div class="h-80">
			<template v-if="data && data.length">
				<ChartContainer :config="chartConfig" class="h-full">
					<VisXYContainer :data="chartData" :padding="{ top: 10 }">
						<VisLine :x="(d: any) => d.index" :y="(d: any) => d.completed" color="var(--color-completed)" :curve-type="'monotone'" />
						<VisLine :x="(d: any) => d.index" :y="(d: any) => d.created" color="var(--color-created)" :curve-type="'monotone'" />
						<VisAxis type="x" :tick-format="(i: number) => chartData[i]?.name || ''" :grid-line="false" />
						<VisAxis type="y" :grid-line="true" />
						<VisTooltip />
					</VisXYContainer>
				</ChartContainer>
				<div class="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<span class="w-3 h-0.5 rounded-full bg-emerald-400"></span>
						Completed
					</span>
					<span class="flex items-center gap-1.5">
						<span class="w-3 h-0.5 rounded-full" style="background: rgba(0, 191, 255, 1)"></span>
						Created
					</span>
				</div>
			</template>
			<div v-else class="h-full flex items-center justify-center text-muted-foreground">No trend data available</div>
		</div>
	</UCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChartContainer } from '~/components/ui/chart';
import { VisXYContainer, VisLine, VisAxis, VisTooltip } from '@unovis/vue';

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
	completed: { label: 'Completed', color: 'rgba(14, 246, 45, 0.8)' },
	created: { label: 'Created', color: 'rgba(0, 191, 255, 0.8)' },
};

const chartData = computed(() => {
	return props.data.map((item, i) => ({
		index: i,
		name: item.name,
		completed: item.completed,
		created: item.created,
	}));
});
</script>

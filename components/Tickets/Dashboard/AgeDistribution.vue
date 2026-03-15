<template>
	<UCard>
		<template #header>
			<div class="flex justify-between items-center">
				<div class="flex items-center">
					<h2 class="font-bold uppercase tracking-wide text-sm">Completion Rate</h2>
					<UPopover mode="hover" :ui="{ rounded: 'rounded-sm' }">
						<UIcon
							name="i-heroicons-information-circle"
							class="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help ml-1"
						/>

						<template #panel>
							<div class="p-4 max-w-sm">
								<p class="text-xs text-gray-600">
									This chart shows how many non-completed tickets fall into each age category. Older tickets may require
									attention, while a high number of newer tickets might indicate a sudden influx of work.
								</p>
							</div>
						</template>
					</UPopover>
				</div>
				<UBadge color="blue" variant="soft">Non-Completed Tickets</UBadge>
			</div>
		</template>
		<div class="h-80">
			<template v-if="data && data.length">
				<ChartContainer :config="chartConfig" class="h-full">
					<VisXYContainer :data="chartData" :padding="{ top: 10 }">
						<VisGroupedBar
							:x="(d: any) => d.index"
							:y="[(d: any) => d.count]"
							:color="() => 'var(--color-tickets)'"
							:bar-padding="0.2"
						/>
						<VisAxis type="x" :tick-format="(i: number) => chartData[i]?.name || ''" :grid-line="false" />
						<VisAxis type="y" :grid-line="true" />
						<VisTooltip />
					</VisXYContainer>
				</ChartContainer>
				<div class="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<span class="w-3 h-3 rounded-sm" style="background: rgba(92, 214, 254, 0.7)"></span>
						Number of Tickets
					</span>
				</div>
			</template>
			<div v-else class="h-full flex items-center justify-center text-muted-foreground">No data available</div>
		</div>
	</UCard>
</template>

<script setup>
import { computed } from 'vue';
import { ChartContainer } from '~/components/ui/chart';
import { VisXYContainer, VisGroupedBar, VisAxis, VisTooltip } from '@unovis/vue';

const props = defineProps({
	data: {
		type: Array,
		required: true,
	},
});

const chartConfig = {
	tickets: { label: 'Number of Tickets', color: 'rgba(92, 214, 254, 0.7)' },
};

const chartData = computed(() => {
	if (!props.data || props.data.length === 0) return [];
	return props.data.map((item, i) => ({
		index: i,
		name: item.name,
		count: item.count,
	}));
});
</script>

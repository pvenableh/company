<template>
	<UCard>
		<template #header>
			<div class="flex justify-between items-center">
				<div class="flex items-center">
					<h2 class="font-bold uppercase tracking-wide text-sm">Activity Distribution</h2>
					<UPopover mode="hover" :ui="{ rounded: 'rounded-sm' }">
						<UIcon
							name="i-heroicons-information-circle"
							class="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help ml-1"
						/>

						<template #panel>
							<div class="p-4 max-w-sm">
								<p class="text-xs text-gray-600">
									This chart shows the breakdown of different activities performed on tickets. It helps identify which
									types of actions are most common in your workflow, revealing patterns in how tickets are processed and
									managed.
								</p>
							</div>
						</template>
					</UPopover>
				</div>
				<UBadge color="purple" variant="soft">{{ teamFilter === null ? 'Organization' : 'Team' }}</UBadge>
			</div>
		</template>
		<div class="h-80">
			<template v-if="data && data.length">
				<ChartContainer :config="chartConfig" class="h-full">
					<VisDonut
						:data="donutData"
						:value="(d: any) => d.count"
						:arc-width="80"
						:pad-angle="0.02"
						:corner-radius="4"
						:color="(d: any, i: number) => chartColors[i % chartColors.length]"
						:central-label="totalCount.toString()"
						:central-sub-label="'total'"
					/>
				</ChartContainer>
				<div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
					<span
						v-for="(item, i) in data"
						:key="item.type"
						class="flex items-center gap-1.5"
					>
						<span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: chartColors[i % chartColors.length] }"></span>
						{{ item.type }} ({{ item.count }})
					</span>
				</div>
			</template>
			<div v-else class="h-full flex items-center justify-center text-muted-foreground">No activity data available</div>
		</div>
	</UCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChartContainer } from '~/components/ui/chart';
import { VisDonut } from '@unovis/vue';

const props = defineProps({
	data: {
		type: Array,
		required: true,
	},
	teamFilter: {
		type: String,
		default: null,
	},
});

const chartColors = [
	'rgba(92, 214, 254, 0.8)',
	'rgba(56, 204, 254, 0.8)',
	'rgba(21, 194, 252, 0.8)',
	'rgba(3, 176, 233, 0.8)',
	'rgba(4, 148, 197, 0.8)',
	'rgba(4, 121, 160, 0.8)',
	'rgba(3, 94, 124, 0.8)',
];

const chartConfig = computed(() => {
	const config = {};
	props.data.forEach((item, i) => {
		config[`segment_${i}`] = {
			label: item.type,
			color: chartColors[i % chartColors.length],
		};
	});
	return config;
});

const donutData = computed(() => {
	return props.data.map((item) => ({
		type: item.type,
		count: item.count,
	}));
});

const totalCount = computed(() => {
	return props.data.reduce((sum, item) => sum + item.count, 0);
});
</script>

<template>
	<div class="space-y-2">
		<div
			v-for="dim in dimensionList"
			:key="dim.key"
			class="flex items-center gap-2"
		>
			<span class="text-[10px] font-medium text-muted-foreground w-24 text-right truncate uppercase tracking-wider">{{ dim.label }}</span>
			<div class="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
				<div
					class="h-full rounded-full transition-all duration-500 ease-out"
					:class="dim.colorClass"
					:style="{ width: `${(dim.value / dim.max) * 100}%` }"
				/>
			</div>
			<span class="text-[10px] tabular-nums text-muted-foreground w-8">{{ dim.value }}/{{ dim.max }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { DimensionScores } from '~/composables/useEarnestScore';

const props = defineProps<{
	dimensions: DimensionScores;
}>();

const dimensionList = computed(() => [
	{ key: 'followThrough', label: 'Follow-Through', value: props.dimensions.followThrough, max: 25, colorClass: 'bg-green-500' },
	{ key: 'crm', label: 'CRM', value: props.dimensions.crm ?? 0, max: 20, colorClass: 'bg-rose-500' },
	{ key: 'consistency', label: 'Consistency', value: props.dimensions.consistency, max: 20, colorClass: 'bg-blue-500' },
	{ key: 'responsiveness', label: 'Responsive', value: props.dimensions.responsiveness, max: 15, colorClass: 'bg-violet-500' },
	{ key: 'proactivity', label: 'Proactivity', value: props.dimensions.proactivity, max: 10, colorClass: 'bg-amber-500' },
	{ key: 'depth', label: 'Depth', value: props.dimensions.depth, max: 10, colorClass: 'bg-cyan-500' },
]);
</script>

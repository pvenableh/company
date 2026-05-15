<template>
	<div class="ios-card p-4 sm:p-5 transition-all hover:shadow-md">
		<div class="flex items-start justify-between mb-2">
			<p class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
				{{ label }}
			</p>
			<div
				v-if="icon"
				class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
				:class="iconBgClass"
			>
				<Icon :name="icon" class="w-3.5 h-3.5" :class="iconColorClass" />
			</div>
		</div>
		<div v-if="loading" class="h-8 w-24 bg-muted/40 rounded animate-pulse" />
		<p v-else class="text-2xl sm:text-3xl font-bold text-foreground tabular-nums leading-tight">
			{{ value }}
		</p>
		<p v-if="!loading && delta" class="text-[11px] text-success dark:text-success mt-1 font-medium">
			{{ delta }}
		</p>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	label: string;
	value: string | number;
	delta?: string | null;
	icon?: string;
	tone?: string;
	loading?: boolean;
}>();

const TONE_BG: Record<string, string> = {
	emerald: 'bg-success/10',
	violet: 'bg-violet-500/10',
	sky: 'bg-info/10',
	fuchsia: 'bg-fuchsia-500/10',
	amber: 'bg-warning/10',
	rose: 'bg-destructive/10',
	neutral: 'bg-muted/40',
};
const TONE_FG: Record<string, string> = {
	emerald: 'text-success',
	violet: 'text-violet-500',
	sky: 'text-info',
	fuchsia: 'text-fuchsia-500',
	amber: 'text-warning',
	rose: 'text-destructive',
	neutral: 'text-muted-foreground',
};

const iconBgClass = computed(() => TONE_BG[props.tone || 'neutral'] || TONE_BG.neutral);
const iconColorClass = computed(() => TONE_FG[props.tone || 'neutral'] || TONE_FG.neutral);
</script>

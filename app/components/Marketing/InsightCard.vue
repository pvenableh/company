<template>
	<div
		class="group rounded-xl border p-4 transition-all hover:shadow-md"
		:class="cardClass"
	>
		<div class="flex items-start gap-3">
			<div
				class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
				:class="iconBgClass"
			>
				<Icon :name="iconName" class="w-4 h-4" :class="iconClass" />
			</div>
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2 mb-1">
					<h4 class="text-sm font-semibold text-foreground truncate">{{ insight.title }}</h4>
					<span
						class="text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0"
						:class="priorityClass"
					>
						{{ insight.priority }}
					</span>
				</div>
				<p class="text-xs text-muted-foreground leading-relaxed">{{ insight.description }}</p>
				<NuxtLink
					v-if="insight.actionable && insight.link"
					:to="insight.link"
					class="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
				>
					Take action
					<Icon name="lucide:arrow-right" class="w-3 h-3" />
				</NuxtLink>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { MarketingInsight } from '~~/shared/marketing';

const props = defineProps<{
	insight: MarketingInsight;
}>();

const typeConfig = computed(() => {
	const configs: Record<string, { icon: string; bg: string; iconBg: string; iconColor: string; card: string }> = {
		strength: {
			icon: 'lucide:trending-up',
			bg: 'bg-success/10 dark:bg-success/20',
			iconBg: 'bg-success/10 dark:bg-success/30',
			iconColor: 'text-success dark:text-success',
			card: 'border-success/50 dark:border-success/30',
		},
		weakness: {
			icon: 'lucide:trending-down',
			bg: 'bg-destructive/10 dark:bg-destructive/20',
			iconBg: 'bg-destructive/10 dark:bg-destructive/30',
			iconColor: 'text-destructive dark:text-destructive',
			card: 'border-destructive/50 dark:border-destructive/30',
		},
		opportunity: {
			icon: 'lucide:lightbulb',
			bg: 'bg-warning/10 dark:bg-warning/20',
			iconBg: 'bg-warning/10 dark:bg-warning/30',
			iconColor: 'text-warning dark:text-warning',
			card: 'border-warning/50 dark:border-warning/30',
		},
		action: {
			icon: 'lucide:zap',
			bg: 'bg-blue-50 dark:bg-blue-900/20',
			iconBg: 'bg-blue-100 dark:bg-blue-900/30',
			iconColor: 'text-blue-600 dark:text-blue-400',
			card: 'border-blue-200/50 dark:border-blue-800/30',
		},
	};
	return configs[props.insight.type] || configs.action;
});

const iconName = computed(() => typeConfig.value.icon);
const iconBgClass = computed(() => typeConfig.value.iconBg);
const iconClass = computed(() => typeConfig.value.iconColor);
const cardClass = computed(() => typeConfig.value.card);

const priorityClass = computed(() => {
	const classes: Record<string, string> = {
		high: 'bg-destructive/10 text-destructive dark:bg-destructive/30 dark:text-destructive',
		medium: 'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning',
		low: 'bg-success/10 text-success dark:bg-success/30 dark:text-success',
	};
	return classes[props.insight.priority] || classes.medium;
});
</script>

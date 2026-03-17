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
import type { MarketingInsight } from '~/types/marketing';

const props = defineProps<{
	insight: MarketingInsight;
}>();

const typeConfig = computed(() => {
	const configs: Record<string, { icon: string; bg: string; iconBg: string; iconColor: string; card: string }> = {
		strength: {
			icon: 'lucide:trending-up',
			bg: 'bg-green-50 dark:bg-green-900/20',
			iconBg: 'bg-green-100 dark:bg-green-900/30',
			iconColor: 'text-green-600 dark:text-green-400',
			card: 'border-green-200/50 dark:border-green-800/30',
		},
		weakness: {
			icon: 'lucide:trending-down',
			bg: 'bg-red-50 dark:bg-red-900/20',
			iconBg: 'bg-red-100 dark:bg-red-900/30',
			iconColor: 'text-red-600 dark:text-red-400',
			card: 'border-red-200/50 dark:border-red-800/30',
		},
		opportunity: {
			icon: 'lucide:lightbulb',
			bg: 'bg-amber-50 dark:bg-amber-900/20',
			iconBg: 'bg-amber-100 dark:bg-amber-900/30',
			iconColor: 'text-amber-600 dark:text-amber-400',
			card: 'border-amber-200/50 dark:border-amber-800/30',
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
		high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
		medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
		low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
	};
	return classes[props.insight.priority] || classes.medium;
});
</script>

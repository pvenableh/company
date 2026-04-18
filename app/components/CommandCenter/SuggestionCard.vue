<script setup lang="ts">
const router = useRouter();

const props = defineProps<{
	suggestion: {
		id: string;
		type: string;
		priority: string;
		icon: string;
		title: string;
		description: string;
		actionLabel: string;
		actionRoute?: string;
		category: string;
		score: number;
	};
}>();

const priorityColors: Record<string, string> = {
	urgent: 'bg-red-50/50 dark:bg-red-900/10',
	high: 'bg-amber-50/50 dark:bg-amber-900/10',
	medium: 'bg-blue-50/30 dark:bg-blue-900/10',
	low: 'bg-muted/30',
};

const priorityLineColors: Record<string, string> = {
	urgent: 'bg-red-500',
	high: 'bg-amber-500',
	medium: 'bg-blue-500',
	low: 'bg-muted-foreground/40',
};

const priorityIconColors: Record<string, string> = {
	urgent: 'text-red-500',
	high: 'text-amber-500',
	medium: 'text-blue-500',
	low: 'text-muted-foreground',
};

const typeIcons: Record<string, string> = {
	action: 'i-heroicons-bolt',
	reminder: 'i-heroicons-bell',
	insight: 'i-heroicons-light-bulb',
	lead: 'i-heroicons-user-plus',
	followup: 'i-heroicons-arrow-uturn-right',
};

const handleAction = () => {
	if (props.suggestion.actionRoute) {
		router.push(props.suggestion.actionRoute);
	}
};
</script>

<template>
	<AccentCard
		:accent="priorityLineColors[suggestion.priority] || priorityLineColors.low"
		:class="[priorityColors[suggestion.priority] || priorityColors.low, 'hover:shadow-md transition-all duration-200 cursor-pointer group']"
		@click="handleAction"
	>
		<div class="flex items-start gap-3">
			<div class="flex-shrink-0 mt-0.5">
				<UIcon
					:name="suggestion.icon"
					class="w-5 h-5"
					:class="priorityIconColors[suggestion.priority] || priorityIconColors.low"
				/>
			</div>
			<div class="flex-1 min-w-0">
				<p class="text-sm font-medium text-foreground truncate">
					{{ suggestion.title }}
				</p>
				<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
					{{ suggestion.description }}
				</p>
			</div>
			<div class="flex-shrink-0">
				<span
					class="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
				>
					{{ suggestion.actionLabel }} &rarr;
				</span>
			</div>
		</div>
	</AccentCard>
</template>

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
	urgent: 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10',
	high: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10',
	medium: 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-900/10',
	low: 'border-l-gray-300 bg-gray-50/30 dark:bg-gray-800/30',
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
	<div
		:class="[priorityColors[suggestion.priority] || priorityColors.low]"
		class="border-l-4 rounded-lg p-3 hover:shadow-md transition-all duration-200 cursor-pointer group"
		@click="handleAction"
	>
		<div class="flex items-start gap-3">
			<div class="flex-shrink-0 mt-0.5">
				<UIcon
					:name="suggestion.icon"
					class="w-5 h-5"
					:class="{
						'text-red-500': suggestion.priority === 'urgent',
						'text-amber-500': suggestion.priority === 'high',
						'text-blue-500': suggestion.priority === 'medium',
						'text-gray-400': suggestion.priority === 'low',
					}"
				/>
			</div>
			<div class="flex-1 min-w-0">
				<p class="text-sm font-medium text-gray-900 dark:text-white truncate">
					{{ suggestion.title }}
				</p>
				<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
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
	</div>
</template>

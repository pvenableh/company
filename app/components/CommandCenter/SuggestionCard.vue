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

const { getPriorityBg, getPriorityAccent, getPriorityIconClass } = useStatusStyle();

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
		:accent="getPriorityAccent(suggestion.priority)"
		:class="[getPriorityBg(suggestion.priority), 'hover:shadow-md transition-all duration-200 cursor-pointer group']"
		@click="handleAction"
	>
		<div class="flex items-start gap-3">
			<div class="flex-shrink-0 mt-0.5">
				<UIcon
					:name="suggestion.icon"
					class="w-5 h-5"
					:class="getPriorityIconClass(suggestion.priority)"
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

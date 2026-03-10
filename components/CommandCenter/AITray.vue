<script setup lang="ts">
const props = defineProps<{
	isOpen: boolean;
}>();

const emit = defineEmits<{
	(e: 'close'): void;
}>();

const { suggestions, metrics, isAnalyzing, greeting, analyze } = useAIProductivityEngine();
const router = useRouter();

const filterCategory = ref('all');

const categories = [
	{ value: 'all', label: 'All', icon: 'i-heroicons-squares-2x2' },
	{ value: 'tasks', label: 'Tasks', icon: 'i-heroicons-clipboard-document-check' },
	{ value: 'invoices', label: 'Invoices', icon: 'i-heroicons-document-text' },
	{ value: 'leads', label: 'Leads', icon: 'i-heroicons-user-plus' },
	{ value: 'projects', label: 'Projects', icon: 'i-heroicons-square-3-stack-3d' },
];

const filteredSuggestions = computed(() => {
	if (filterCategory.value === 'all') return suggestions.value;
	return suggestions.value.filter((s) => s.category === filterCategory.value);
});

const quickActions = [
	{ label: 'New Task', icon: 'i-heroicons-plus-circle', route: '/tickets' },
	{ label: 'Send Invoice', icon: 'i-heroicons-paper-airplane', route: '/invoices' },
	{ label: 'Schedule Call', icon: 'i-heroicons-phone', route: '/scheduler' },
	{ label: 'Post Update', icon: 'i-heroicons-megaphone', route: '/social/compose' },
	{ label: 'View Projects', icon: 'i-heroicons-square-3-stack-3d', route: '/projects' },
	{ label: 'Team Chat', icon: 'i-heroicons-chat-bubble-left-right', route: '/channels' },
];

const handleQuickAction = (route: string) => {
	router.push(route);
	emit('close');
};

const handleSuggestionClick = (suggestion: any) => {
	if (suggestion.actionRoute) {
		router.push(suggestion.actionRoute);
		emit('close');
	}
};

onMounted(() => {
	analyze();
});

// Re-analyze when tray opens
watch(
	() => props.isOpen,
	(open) => {
		if (open) analyze();
	},
);
</script>

<template>
	<Transition name="tray">
		<div
			v-if="isOpen"
			class="fixed right-0 top-0 h-full w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col overflow-hidden border-l border-gray-200 dark:border-gray-700"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-primary/5 to-violet-500/5">
				<div>
					<h2 class="text-sm font-bold text-gray-900 dark:text-white">AI Assistant</h2>
					<p class="text-xs text-gray-500 mt-0.5">{{ greeting }}</p>
				</div>
				<button
					@click="emit('close')"
					class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
				>
					<UIcon name="i-heroicons-x-mark" class="w-5 h-5 text-gray-500" />
				</button>
			</div>

			<!-- Productivity Score -->
			<div class="p-4 border-b border-gray-100 dark:border-gray-700">
				<CommandCenterProductivityMeter
					:score="metrics.productivityScore"
					:overdue-items="metrics.overdueItems"
					:pending-invoice-total="metrics.pendingInvoiceTotal"
					:tasks-completed-today="metrics.tasksCompletedToday"
				/>
			</div>

			<!-- Quick Actions -->
			<div class="p-4 border-b border-gray-100 dark:border-gray-700">
				<h3 class="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">Quick Actions</h3>
				<div class="grid grid-cols-3 gap-2">
					<button
						v-for="action in quickActions"
						:key="action.label"
						@click="handleQuickAction(action.route)"
						class="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-center"
					>
						<UIcon :name="action.icon" class="w-5 h-5 text-primary" />
						<span class="text-[10px] text-gray-600 dark:text-gray-400">{{ action.label }}</span>
					</button>
				</div>
			</div>

			<!-- Suggestions -->
			<div class="flex-1 overflow-y-auto">
				<div class="p-4">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
							Smart Suggestions
						</h3>
						<button
							@click="analyze"
							:disabled="isAnalyzing"
							class="text-xs text-primary hover:underline disabled:opacity-50"
						>
							<UIcon v-if="isAnalyzing" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin inline" />
							<span v-else>Refresh</span>
						</button>
					</div>

					<!-- Category Filter -->
					<div class="flex gap-1 mb-3 overflow-x-auto pb-1">
						<button
							v-for="cat in categories"
							:key="cat.value"
							@click="filterCategory = cat.value"
							:class="[
								filterCategory === cat.value
									? 'bg-primary text-white'
									: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
							]"
							class="text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-colors font-medium"
						>
							{{ cat.label }}
						</button>
					</div>

					<!-- Suggestion Cards -->
					<div v-if="isAnalyzing" class="space-y-2">
						<div v-for="n in 4" :key="n" class="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
					</div>

					<div v-else-if="filteredSuggestions.length === 0" class="text-center py-8 text-gray-400 text-sm">
						<UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2" />
						<p>All caught up! No suggestions right now.</p>
					</div>

					<div v-else class="space-y-2">
						<CommandCenterSuggestionCard
							v-for="suggestion in filteredSuggestions"
							:key="suggestion.id"
							:suggestion="suggestion"
							@click="handleSuggestionClick(suggestion)"
						/>
					</div>
				</div>
			</div>
		</div>
	</Transition>

	<!-- Overlay -->
	<Transition name="overlay">
		<div
			v-if="isOpen"
			class="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
			@click="emit('close')"
		/>
	</Transition>
</template>

<style scoped>
.tray-enter-active,
.tray-leave-active {
	transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.tray-enter-from,
.tray-leave-to {
	transform: translateX(100%);
}

.overlay-enter-active,
.overlay-leave-active {
	transition: opacity 0.3s ease;
}
.overlay-enter-from,
.overlay-leave-to {
	opacity: 0;
}
</style>

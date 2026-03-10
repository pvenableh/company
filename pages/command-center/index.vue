<script setup lang="ts">
definePageMeta({
	middleware: ['auth'],
});

const { suggestions, metrics, isAnalyzing, greeting, analyze } = useAIProductivityEngine();
const aiTrayOpen = ref(false);

// Badge counts for app icons
const badges = computed(() => {
	const b: Record<string, number> = {};
	if (metrics.value.overdueItems > 0) b.tasks = metrics.value.overdueItems;
	return b;
});

// Top 5 suggestions for the main view
const topSuggestions = computed(() => {
	return suggestions.value.slice(0, 5);
});

onMounted(() => {
	analyze();
});
</script>

<template>
	<div class="min-h-screen">
		<div class="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
			<!-- Greeting & AI Toggle -->
			<div class="flex items-center justify-between mb-8">
				<div>
					<h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ greeting }}</h1>
					<p class="text-sm text-gray-500 mt-1">Here's what needs your attention today</p>
				</div>
				<button
					@click="aiTrayOpen = true"
					class="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-violet-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 text-sm font-medium"
				>
					<UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
					AI Assistant
				</button>
			</div>

			<!-- Productivity + Quick Suggestions Row -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
				<!-- Productivity Score -->
				<CommandCenterProductivityMeter
					:score="metrics.productivityScore"
					:overdue-items="metrics.overdueItems"
					:pending-invoice-total="metrics.pendingInvoiceTotal"
					:tasks-completed-today="metrics.tasksCompletedToday"
				/>

				<!-- AI Suggestions Feed -->
				<div class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
					<div class="flex items-center justify-between mb-3">
						<div class="flex items-center gap-2">
							<UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-violet-500" />
							<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
								Smart Suggestions
							</h3>
						</div>
						<button
							@click="analyze"
							:disabled="isAnalyzing"
							class="text-xs text-primary hover:underline disabled:opacity-50"
						>
							Refresh
						</button>
					</div>

					<div v-if="isAnalyzing" class="space-y-2">
						<div v-for="n in 3" :key="n" class="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
					</div>

					<div v-else-if="topSuggestions.length === 0" class="text-center py-8 text-gray-400">
						<UIcon name="i-heroicons-check-circle" class="w-10 h-10 mx-auto mb-2 text-green-400" />
						<p class="text-sm">You're all caught up! Great job.</p>
					</div>

					<div v-else class="space-y-2">
						<CommandCenterSuggestionCard
							v-for="suggestion in topSuggestions"
							:key="suggestion.id"
							:suggestion="suggestion"
						/>
					</div>

					<button
						v-if="suggestions.length > 5"
						@click="aiTrayOpen = true"
						class="mt-3 text-xs text-primary hover:underline w-full text-center"
					>
						View all {{ suggestions.length }} suggestions &rarr;
					</button>
				</div>
			</div>

			<!-- App Grid -->
			<div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-8">
				<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-4">
					Your Workspace
				</h3>
				<CommandCenterAppGrid :badges="badges" />
			</div>

			<!-- Bottom Section: Chat + Financials -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<!-- Real-time Chat -->
				<div class="h-[500px]">
					<CommandCenterRealtimeChat />
				</div>

				<!-- Financial Analysis -->
				<CommandCenterFinancialQuarter />
			</div>
		</div>

		<!-- AI Tray (Sliding Side Panel) -->
		<CommandCenterAITray :is-open="aiTrayOpen" @close="aiTrayOpen = false" />
	</div>
</template>

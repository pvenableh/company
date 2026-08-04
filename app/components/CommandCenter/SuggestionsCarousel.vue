<!--
  SuggestionsCarousel — the lower-priority "Suggestions" strip, extracted from
  the dashboard so it's an addressable, reorderable widget. Engine state can't be
  re-instantiated (a fresh useAIProductivityEngine() call has empty state), so the
  suggestions + total are passed in from the page.
-->
<script setup lang="ts">
import type { TaskSuggestion } from '~/composables/useAIProductivityEngine';

defineProps<{ suggestions: TaskSuggestion[]; total: number }>();
</script>

<template>
	<div v-if="suggestions.length > 0" class="ios-card p-5">
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<EarnestIcon class="w-5 h-5 text-primary" />
				<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Suggestions</h3>
			</div>
			<UiViewLink v-if="total > 10" size="sm" @click="openEarnestPanel()">
				View all {{ total }}
			</UiViewLink>
		</div>

		<!-- Horizontal snap-scroll carousel. -->
		<div class="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-1 px-1 pb-1 scroll-px-1">
			<div
				v-for="suggestion in suggestions"
				:key="suggestion.id"
				class="snap-start shrink-0 w-[280px] sm:w-[300px]"
			>
				<CommandCenterSuggestionCard :suggestion="suggestion" class="h-full" />
			</div>
		</div>
	</div>
</template>

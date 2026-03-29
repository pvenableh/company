<template>
	<div class="relative bg-background text-foreground transition duration-150 ios-safe-area">
		<!-- Dynamic layout based on user's selected mode -->
		<component
			:is="activeLayoutComponent"
			:user="user"
			@open-spotlight="spotlightOpen = true"
			@open-ai-tray="aiTrayOpen = true"
			@open-timer="timeTrackerModalVisible = true"
		>
			<slot />
		</component>

		<!-- AI Tray (shared across all modes) -->
		<ClientOnly>
			<CommandCenterAITray :is-open="aiTrayOpen" @close="aiTrayOpen = false" />
		</ClientOnly>

		<!-- Time Tracker Modal (global, triggered from anywhere) -->
		<ClientOnly>
			<TimeTrackerModal v-model="timeTrackerModalVisible" />
		</ClientOnly>

		<!-- Floating time tracker indicator (mobile fallback) -->
		<ClientOnly>
			<TimeTrackerFloatingIndicator class="md:hidden" />
		</ClientOnly>

		<!-- Floating dock (tasks, timer, AI) — desktop only -->
		<ClientOnly>
			<LayoutFloatingDock @open-ai="aiTrayOpen = true" />
		</ClientOnly>

		<!-- Spotlight Search (Cmd+K) -->
		<ClientOnly>
			<LayoutSpotlightSearch :open="spotlightOpen" @close="spotlightOpen = false" />
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import { timeTrackerModalOpen } from '~~/composables/useTimeTrackerModal';

const { user } = useDirectusAuth();
const { currentMode } = useLayoutMode();

const aiTrayOpen = ref(false);
const spotlightOpen = ref(false);
const timeTrackerModalVisible = timeTrackerModalOpen;

// Resolve layout component based on current mode
const activeLayoutComponent = computed(() => {
	switch (currentMode.value) {
		case 'tabs':
			return resolveComponent('LayoutModesTabsLayout');
		case 'home':
			return resolveComponent('LayoutModesHomeLayout');
		case 'spaces':
		default:
			return resolveComponent('LayoutModesSpacesLayout');
	}
});

// Cmd+K / Ctrl+K spotlight shortcut
if (import.meta.client) {
	onMounted(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				spotlightOpen.value = !spotlightOpen.value;
			}
		};
		window.addEventListener('keydown', handler);
		onBeforeUnmount(() => window.removeEventListener('keydown', handler));
	});
}
</script>

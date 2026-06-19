<template>
	<!-- Apps mode delegates to the apps layout regardless of which legacy
	     page is rendering. This is the systemic fix for "page X is orphaned
	     from the AppRail in apps mode": any page that defaults to this
	     layout (i.e. doesn't set `layout: 'apps'` or `layout: false` itself)
	     now gets the apps shell automatically when the user is in apps mode.
	     The classic-mode branch below is untouched. -->
	<NuxtLayout v-if="isAppsMode" name="apps">
		<slot />
	</NuxtLayout>
	<div v-else class="relative bg-background text-foreground transition duration-150 ios-safe-area">
		<!-- Archived-org banner (shown above the active layout when current org is archived) -->
		<ClientOnly>
			<LayoutArchivedOrgBanner />
		</ClientOnly>

		<!-- Dynamic layout based on user's selected mode -->
		<component
			:is="activeLayoutComponent"
			:user="user"
			@open-spotlight="spotlightOpen = true"
			@open-ai-tray="handleOpenAI"
			@open-timer="timeTrackerModalVisible = true"
		>
			<slot />
		</component>

		<!-- Unified Earnest panel (route + entity aware; self-managed open state) -->
		<ClientOnly>
			<AIEarnestPanel />
		</ClientOnly>

		<!-- Time Tracker Modal (global, triggered from anywhere) -->
		<ClientOnly>
			<TimeTrackerModal v-model="timeTrackerModalVisible" />
		</ClientOnly>

		<!-- AI Token Management Modal (global, triggered from sidebar/AI tray) -->
		<ClientOnly>
			<OrganizationTokenManagementModal v-model="tokenModalVisible" />
		</ClientOnly>

		<!-- Floating time tracker indicator (mobile fallback) -->
		<ClientOnly>
			<TimeTrackerFloatingIndicator class="md:hidden" />
		</ClientOnly>

		<!-- Floating dock (tasks, timer, AI) — desktop only -->
		<ClientOnly>
			<LayoutFloatingDock @open-ai="handleOpenAI" />
		</ClientOnly>

		<!-- Spotlight Search (Cmd+K) -->
		<ClientOnly>
			<LayoutSpotlightSearch :open="spotlightOpen" @close="spotlightOpen = false" />
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import { timeTrackerModalOpen } from '~/composables/useTimeTrackerModal';
import { tokenModalOpen } from '~/composables/useTokenModal';
import { openEarnestPanel } from '~/composables/useEarnestPanel';

const { user } = useDirectusAuth();
const { currentMode } = useLayoutMode();
// In apps mode, the template short-circuits to the apps layout for every
// page that doesn't define its own layout — fixes the "orphaned from
// AppRail" class of bugs systemically.
const { isAppsMode } = useAppsMode();

// The unified Earnest panel self-derives entity vs route context, so opening
// it is a single call — no entity-vs-tray branch.
const handleOpenAI = () => openEarnestPanel();
const spotlightOpen = ref(false);
const timeTrackerModalVisible = timeTrackerModalOpen;
const tokenModalVisible = tokenModalOpen;

// Resolve layout component based on current mode
const activeLayoutComponent = computed(() => {
	switch (currentMode.value) {
		case 'focus':
			return resolveComponent('LayoutModesFocusLayout');
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

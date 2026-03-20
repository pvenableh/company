<template>
	<div class="relative bg-background text-foreground transition duration-150 lg:overflow-visible ios-safe-area">
		<!-- Desktop Sidebar -->
		<ClientOnly>
			<LayoutSidebar v-if="user" />
		</ClientOnly>

		<div class="lg:pl-60">
			<LayoutHeader :links="headerLinks" />

			<div class="page pb-safe min-h-page">
				<slot />
			</div>

			<LayoutFooter :links="footerLinks" :class="user ? 'hidden md:flex' : 'flex'" />
		</div>

		<!-- iOS Tab Bar (mobile, hidden on lg+ where sidebar exists) -->
		<LayoutMobileToolbar :links="toolbarLinks" @open-ai="aiTrayOpen = true" />

		<!-- iOS Bottom Sheet (nav drawer) -->
		<ClientOnly>
			<LayoutNavDrawer @edit-apps="navEditorOpen = true" />
		</ClientOnly>

		<!-- Nav Editor (edit apps sheet) -->
		<ClientOnly>
			<LayoutNavEditor :is-open="navEditorOpen" @close="navEditorOpen = false" />
		</ClientOnly>

		<!-- AI Tray -->
		<ClientOnly>
			<CommandCenterAITray :is-open="aiTrayOpen" @close="aiTrayOpen = false" />
		</ClientOnly>

		<!-- Floating Dock: Tasks + Time Tracker (desktop) -->
		<ClientOnly>
			<LayoutFloatingDock />
		</ClientOnly>

		<!-- Floating time tracker indicator (mobile fallback) -->
		<ClientOnly>
			<TimeTrackerFloatingIndicator class="md:hidden" />
		</ClientOnly>

		<!-- Time Tracker Modal (global, triggered from anywhere) -->
		<ClientOnly>
			<TimeTrackerModal v-model="timeTrackerModalVisible" />
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
interface Link {
	name: string;
	type: string[];
	to: string;
	icon: string;
	color: string;
	description: string;
}

const props = defineProps({
	links: {
		type: Array as PropType<Link[]>,
		default: () => [],
	},
});

import { timeTrackerModalOpen } from '~~/composables/useTimeTrackerModal';

const { user } = useDirectusAuth();
const aiTrayOpen = ref(false);
const navEditorOpen = ref(false);
const timeTrackerModalVisible = timeTrackerModalOpen;

const headerLinks = computed(() => props.links.filter((link) => link.type.includes('header')));
const footerLinks = computed(() => props.links.filter((link) => link.type.includes('footer')));
const toolbarLinks = computed(() => props.links.filter((link) => link.type.includes('toolbar')));
</script>

<style>
/* Safe area padding for bottom content (above tab bar) */
.pb-safe {
	padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 16px);
}
@media (min-width: 1024px) {
	.pb-safe {
		padding-bottom: 0;
	}
}

/* Prevent footer jump when content is shorter than viewport */
.min-h-page {
	min-height: calc(100vh - 56px - 56px - env(safe-area-inset-bottom, 0px));
}
@media (min-width: 768px) {
	.min-h-page {
		min-height: calc(100vh - 56px);
	}
}
</style>

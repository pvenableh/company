<template>
	<div class="relative bg-background text-foreground transition duration-150 lg:overflow-visible ios-safe-area">
		<LayoutHeader :links="headerLinks" />

		<div class="page pb-safe min-h-page">
			<slot />
		</div>

		<LayoutFooter :links="footerLinks" :class="user ? 'hidden md:flex' : 'flex'" />

		<!-- iOS Tab Bar (mobile) -->
		<LayoutMobileToolbar :links="toolbarLinks" @open-ai="aiTrayOpen = true" />

		<!-- iOS Bottom Sheet (nav drawer) -->
		<ClientOnly>
			<LayoutNavDrawer :links="drawerLinks" @edit-apps="navEditorOpen = true" />
		</ClientOnly>

		<!-- Nav Editor (edit apps sheet) -->
		<ClientOnly>
			<LayoutNavEditor :is-open="navEditorOpen" @close="navEditorOpen = false" />
		</ClientOnly>

		<!-- AI Tray -->
		<ClientOnly>
			<CommandCenterAITray :is-open="aiTrayOpen" @close="aiTrayOpen = false" />
		</ClientOnly>

		<!-- Floating time tracker indicator -->
		<ClientOnly>
			<TimeTrackerFloatingIndicator />
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
interface Link {
	name: string;
	type: string[];
	to: string;
	icon: string;
}

const props = defineProps({
	links: {
		type: Array as PropType<Link[]>,
		default: () => [],
	},
});

const { user } = useDirectusAuth();
const aiTrayOpen = ref(false);
const navEditorOpen = ref(false);

const headerLinks = computed(() => props.links.filter((link) => link.type.includes('header')));
const footerLinks = computed(() => props.links.filter((link) => link.type.includes('footer')));
const toolbarLinks = computed(() => props.links.filter((link) => link.type.includes('toolbar')));
const drawerLinks = computed(() => props.links.filter((link) => link.type.includes('drawer')));
</script>

<style>
/* Safe area padding for bottom content (above tab bar) */
.pb-safe {
	padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 16px);
}
@media (min-width: 768px) {
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

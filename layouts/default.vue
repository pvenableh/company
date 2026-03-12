<template>
	<div class="relative bg-background text-foreground transition duration-150 lg:overflow-visible ios-safe-area">
		<LayoutHeader :links="headerLinks" />

		<div class="page pb-safe">
			<slot />
		</div>

		<LayoutFooter :links="footerLinks" class="hidden md:flex" />

		<!-- iOS Tab Bar (mobile) -->
		<LayoutMobileToolbar :links="toolbarLinks" />

		<!-- iOS Bottom Sheet (nav drawer) -->
		<ClientOnly>
			<LayoutNavDrawer :links="drawerLinks" />
		</ClientOnly>

		<!-- AI Assistant FAB — positioned above tab bar on mobile -->
		<button
			@click="aiTrayOpen = true"
			class="fixed z-30 w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center ios-press bottom-[calc(56px+env(safe-area-inset-bottom,0px)+12px)] right-4 md:bottom-6 md:right-6"
			title="AI Assistant"
		>
			<UIcon name="i-heroicons-sparkles" class="w-6 h-6" />
		</button>

		<!-- AI Tray -->
		<ClientOnly>
			<CommandCenterAITray :is-open="aiTrayOpen" @close="aiTrayOpen = false" />
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

const aiTrayOpen = ref(false);

const headerLinks = props.links.filter((link) => link.type.includes('header'));
const footerLinks = props.links.filter((link) => link.type.includes('footer'));
const toolbarLinks = props.links.filter((link) => link.type.includes('toolbar'));
const drawerLinks = props.links.filter((link) => link.type.includes('drawer'));
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
</style>

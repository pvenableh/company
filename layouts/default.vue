<template>
	<div
		class="relative overflow-hidden bg-background text-foreground transition duration-150 lg:overflow-visible"
	>
		<input id="nav-drawer-toggle" type="checkbox" class="hidden" />
		<LayoutHeader :links="headerLinks" />
		<div class="page">
			<slot />
		</div>

		<LayoutFooter :links="footerLinks" />
		<LayoutMobileToolbar :links="toolbarLinks" />
		<LayoutNavButton />
		<LayoutNavDrawer :links="drawerLinks" />
		<transition name="screen">
			<LayoutScreen v-if="screen" />
		</transition>

		<!-- AI Assistant FAB -->
		<button
			@click="aiTrayOpen = true"
			class="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center z-30 ios-press"
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
<style></style>

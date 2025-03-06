<template>
	<div
		class="relative overflow-hidden bg-white transition duration-150 dark:bg-gray-800 dark:text-white lg:overflow-visible"
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

const headerLinks = props.links.filter((link) => link.type.includes('header'));
const footerLinks = props.links.filter((link) => link.type.includes('footer'));
const toolbarLinks = props.links.filter((link) => link.type.includes('toolbar'));
const drawerLinks = props.links.filter((link) => link.type.includes('drawer'));
</script>
<style></style>

<template>
	<div
		id="nav-drawer"
		ref="navDrawerRef"
		class="flex items-center justify-center flex-col nav-drawer"
		@click="closeNavDrawer"
	>
		<div class="nav-drawer__menu-box p-4 overflow-y-auto relative">
			<UIcon
				name="i-heroicons-x-mark"
				class="cursor-pointer h-6 w-6 -ml-[5px] -mt-[10px] mb-[10px] heroicon-sw-1.2 close-btn"
			/>
			<ul tabindex="0" class="nav-drawer__menu">
				<li v-for="(link, index) in links" :key="index">
					<nuxt-link :to="link.to">{{ link.name }}</nuxt-link>
				</li>
				<li v-if="user">
					<nuxt-link to="/account">Account</nuxt-link>
				</li>
				<li v-if="user">
					<AccountLogout />
				</li>
				<li v-else>
					<nuxt-link to="/auth/signin">Login</nuxt-link>
				</li>
			</ul>
		</div>
	</div>
</template>
<script setup>
const { user } = useDirectusAuth();

import { onClickOutside } from '@vueuse/core';
import { closeScreen } from '~~/composables/useScreen';

const props = defineProps({
	links: {
		type: Array,
		default: () => [],
	},
});

const navDrawerRef = ref(null);

function closeNavDrawer() {
	const element = document.getElementById('nav-drawer-toggle');
	element.checked = false;
	closeScreen();
}

onClickOutside(navDrawerRef, () => {
	closeNavDrawer();
});
</script>
<style scoped>
.nav-drawer {
	min-height: 100vh;
	max-height: 100vh;
	position: fixed;
	right: 0%;
	top: 0px;
	z-index: 50;
	background: var(--white);
	background: rgba(208, 208, 208, 0.5);
	background: rgba(255, 255, 255, 0.75);
	transform: translateX(100%);
	transition: 0.35s var(--curve);
	width: 100%;
	max-width: 500px;
	backdrop-filter: blur(10px);
	@apply shadow-lg;

	.close-btn {
		/* right: 0px;
	  top: 0px;
	  @apply absolute; */
	}

	&__menu-box {
	}

	&__menu {
		@apply overflow-hidden;

		li {
			opacity: 0;
			transform: translateX(50px) translateZ(-9.7rem);
			transition: all 0.4s var(--curve);
			@apply my-1;

			a,
			label {
				font-size: 13px;
				letter-spacing: 0.3em;
				@apply block uppercase py-1;
			}

			a.router-link-exact-active {
				color: var(--cyan2);
				@apply font-bold;
			}
		}
	}
}

#nav-drawer-toggle:checked ~ .nav-drawer {
	transform: translateX(0%);

	li {
		opacity: 1;
		transform: translateX(0%) translateZ(0rem);
	}

	li:nth-of-type(1) {
		transition-delay: 0.045s;
	}

	li:nth-of-type(2) {
		transition-delay: 0.06s;
	}

	li:nth-of-type(3) {
		transition-delay: 0.075s;
	}

	li:nth-of-type(4) {
		transition-delay: 0.09s;
	}

	li:nth-of-type(5) {
		transition-delay: 0.105s;
	}

	li:nth-of-type(6) {
		transition-delay: 0.12s;
	}

	li:nth-of-type(7) {
		transition-delay: 0.135s;
	}

	li:nth-of-type(8) {
		transition-delay: 0.15s;
	}
	li:nth-of-type(9) {
		transition-delay: 0.165s;
	}
	li:nth-of-type(10) {
		transition-delay: 0.18s;
	}
}

#nav-drawer-toggle:checked ~ .page-content {
	/* transform: matrix(1, 0, 0, 1, 8, 0); */
	transform: translateX(8px);
	filter: blur(2px);
}

/* #nav-drawer-toggle:checked ~ .nav-drawer > .nav-drawer-overlay {
	background: rgba(48, 54, 64, 0.4);
	opacity: 0.999999;
	visibility: visible;
  } */
</style>

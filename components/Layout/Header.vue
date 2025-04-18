<script setup>
const { user } = useEnhancedAuth();

const props = defineProps({
	links: {
		type: Array,
		default: () => [],
	},
});

const previousScrollTop = ref(0);
const isRetracted = ref(false);

const manageNavBarAnimations = () => {
	const scrollTop = window.scrollY;

	if (scrollTop > 10) {
		isRetracted.value = true;
	} else {
		isRetracted.value = false;
	}
};

onMounted(() => {
	if (import.meta.client) {
		window.addEventListener('scroll', manageNavBarAnimations);
	}
});

onUnmounted(() => {
	if (import.meta.client) {
		window.removeEventListener('scroll', manageNavBarAnimations);
	}
});
</script>
<template>
	<header class="header" :class="{ retracted: isRetracted }">
		<div class="filter-controls">
			<client-only>
				<LayoutOrganizationSelect v-if="user" :user="user" />
				<LayoutTeamSelect v-if="user" class="ml-2" />
			</client-only>
		</div>

		<nuxt-link to="/" class="flex flex-row items-end justify-end mt-[5px] -mb-[2px]">
			<LogoNew class="logo-new drop-shadow-sm" />
			<span class="opacity-75 ml-2 mr-1 font-bold leading-3 hidden md:inline-block text-[9px] mb-[9px]">by</span>
			<Logo class="hidden md:inline-block h-[10px] mb-[12px] !fill-[#666666] !hover:fill-[#666666]" />
		</nuxt-link>
		<div class="account-controls">
			<nuxt-link to="/account" class="flex items-center justify-self-center">
				<Avatar v-if="user" :user="user" text="12" class="mr-2" />
				<UAvatar v-else icon="i-heroicons-user" size="sm" class="mr-1 sm:mr-2" />
			</nuxt-link>
			<!-- <LayoutNotificationsMenu v-if="user" class="mr-2" /> -->
		</div>
	</header>
</template>

<style>
header {
	position: fixed;
	@apply w-full flex items-center justify-center z-40 bg-gray-50 dark:bg-gradient-to-tr dark:from-gray-600 dark:to-gray-800 border border-white dark:border-gray-600 transition-all duration-300 ease-in-out py-3 shadow-lg left-1/2 -translate-x-1/2;
	.logo-new {
		height: 30px;
		width: auto;
		@apply transition-all duration-300 ease-in-out;
		@media (min-width: theme('screens.md')) {
			height: 40px;
		}
	}
	.filter-controls {
		@apply absolute flex items-center justify-center flex-row left-[10px] sm:pr-1 md:px-6 transition-all duration-300 ease-in-out;
	}
	.account-controls {
		@apply absolute flex items-center justify-center flex-row right-[10px] sm:pr-1 md:px-6 transition-all duration-300 ease-in-out;
	}
}

header.retracted {
	/* transform: translateY(-100px); */
	top: 8px;
	@apply rounded-full w-11/12 md:w-5/6 lg:w-4/5 xl:w-3/5 py-2 md:py-1.5 border border-gray-100 bg-gray-100 dark:border-gray-600;
	.logo-new {
		height: 25px;
		width: auto;
		@media (min-width: theme('screens.md')) {
			height: 30px;
		}
	}
	.filter-controls {
		@apply left-[5px] md:px-0;
	}
	.account-controls {
		@apply right-[5px] md:px-0;
	}
}

.logo {
	width: 75px;
	height: 50px;
	path {
		opacity: 0.4;
		animation-name: logo;
		animation-duration: 5s;
		animation-timing-function: var(--curve);
		animation-iteration-count: infinite;
	}

	path:nth-of-type(1) {
		animation-delay: 0.1s;
	}
}

@keyframes logo {
	0% {
		opacity: 0.9;
		fill: #666666;
	}

	50% {
		opacity: 1;
		fill: var(--cyan);
	}

	100% {
		opacity: 0.9;
		fill: #666666;
	}
}
</style>

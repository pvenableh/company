<script setup>
const { user } = useDirectusAuth();

const props = defineProps({
	links: {
		type: Array,
		default: () => [],
	},
});

const previousScrollTop = ref(0);
const isRetracted = ref(false);

const manageNavBarAnimations = () => {
	const header = document.querySelector('header');
	const scrollTop = document.documentElement.scrollTop;

	if (scrollTop > previousScrollTop.value && scrollTop >= 10) {
		isRetracted.value = true;
	} else {
		isRetracted.value = false;
	}

	previousScrollTop.value = scrollTop;
};

onMounted(() => {
	window.addEventListener('scroll', manageNavBarAnimations);
});
</script>
<template>
	<header
		class="w-full flex items-center justify-start z-40 bg-gray-100 dark:bg-gradient-to-tr dark:from-gray-800 dark:to-gray-900 transition-all py-3 shadow header"
	>
		<!-- <header
		class="w-full flex items-center justify-start sticky top-0 left-0 z-40 bg-gray-100 dark:bg-gradient-to-tr dark:from-gray-800 dark:to-gray-900 transition-all py-3 shadow header"
		:class="{ retracted: isRetracted }"
	> -->
		<!-- <div class="absolute left-[10px] sm:pl-1 md:px-6 inline-block sm:hidden mt-0">
			<DarkModeToggle class="" />
		</div> -->
		<nuxt-link to="/" class="flex flex-row items-end justify-center ml-2">
			<Logo color="#ffc00" />
			<span class="uppercase text-4xl font-bold leading-7 px-1 hidden">:</span>
			<span class="uppercase tracking-wider text-4xl font-bold leading-6 hidden">Company</span>
			<LayoutOrganizationSelect :user="user" />
		</nuxt-link>
		<div class="absolute flex items-center justify-center flex-row right-[10px] sm:pr-1 md:px-6">
			<nuxt-link to="/account" class="flex items-center justify-self-center">
				<Avatar v-if="user" :user="user" text="12" class="mr-2" />
				<UAvatar v-else icon="i-heroicons-user" size="sm" class="mr-1 sm:mr-2" />
			</nuxt-link>
			<!-- <LayoutNotificationsMenu v-if="user" class="ml-2" /> -->
			<div class="mt-0">
				<DarkModeToggle class="" />
			</div>
		</div>
	</header>
</template>

<style>
header {
	/* background: #eeeeee;
	border-bottom: solid 1px rgba(55, 55, 55, 0.05);
	box-shadow: -1px 2px 10px rgba(0, 0, 0, 0.05); */
	transition: transform 0.25s var(--curve);
}

header.retracted {
	transform: translateY(-100px);
}

.logo {
	width: 75px;
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

	path:nth-of-type(2) {
		animation-delay: 0.2s;
	}

	path:nth-of-type(3) {
		animation-delay: 0.3s;
	}

	path:nth-of-type(4) {
		animation-delay: 0.4s;
	}

	path:nth-of-type(5) {
		animation-delay: 0.5s;
	}

	path:nth-of-type(6) {
		animation-delay: 0.6s;
	}

	path:nth-of-type(7) {
		animation-delay: 0.7s;
	}

	path:nth-of-type(8) {
		animation-delay: 0.8s;
	}

	path:nth-of-type(9) {
		animation-delay: 0.9s;
	}

	path:nth-of-type(10) {
		animation-delay: 1s;
	}

	path:nth-of-type(11) {
		animation-delay: 1.1s;
	}

	path:nth-of-type(12) {
		animation-delay: 1.2s;
	}

	path:nth-of-type(13) {
		animation-delay: 1.3s;
	}

	path:nth-of-type(14) {
		animation-delay: 1.4s;
	}

	path:nth-of-type(15) {
		animation-delay: 1.5s;
	}

	path:nth-of-type(16) {
		animation-delay: 1.6s;
	}

	path:nth-of-type(17) {
		animation-delay: 1.7s;
	}

	path:nth-of-type(18) {
		animation-delay: 1.8s;
	}

	path:nth-of-type(19) {
		animation-delay: 1.9s;
	}

	path:nth-of-type(20) {
		animation-delay: 2s;
	}

	path:nth-of-type(21) {
		animation-delay: 2.1s;
	}

	path:nth-of-type(22) {
		animation-delay: 2.2s;
	}

	path:nth-of-type(23) {
		animation-delay: 2.3s;
	}

	path:nth-of-type(24) {
		animation-delay: 2.4s;
	}

	path:nth-of-type(25) {
		animation-delay: 2.5s;
	}

	path:nth-of-type(26) {
		animation-delay: 0.1s;
	}

	path:nth-of-type(27) {
		animation-delay: 0.2s;
	}

	path:nth-of-type(28) {
		animation-delay: 0.3s;
	}

	path:nth-of-type(29) {
		animation-delay: 0.4s;
	}

	path:nth-of-type(30) {
		animation-delay: 0.5s;
	}

	path:nth-of-type(31) {
		animation-delay: 0.6s;
	}

	path:nth-of-type(32) {
		animation-delay: 0.7s;
	}

	path:nth-of-type(33) {
		animation-delay: 0.8s;
	}

	path:nth-of-type(34) {
		animation-delay: 0.9s;
	}

	path:nth-of-type(35) {
		animation-delay: 1s;
	}

	path:nth-of-type(36) {
		animation-delay: 1.1s;
	}

	path:nth-of-type(37) {
		animation-delay: 1.2s;
	}

	path:nth-of-type(38) {
		animation-delay: 1.3s;
	}

	path:nth-of-type(39) {
		animation-delay: 1.4s;
	}

	path:nth-of-type(40) {
		animation-delay: 1.5s;
	}

	path:nth-of-type(41) {
		animation-delay: 1.6s;
	}

	path:nth-of-type(42) {
		animation-delay: 1.7s;
	}

	path:nth-of-type(43) {
		animation-delay: 1.8s;
	}

	path:nth-of-type(44) {
		animation-delay: 1.9s;
	}

	path:nth-of-type(45) {
		animation-delay: 2s;
	}

	path:nth-of-type(46) {
		animation-delay: 2.1s;
	}

	path:nth-of-type(47) {
		animation-delay: 2.2s;
	}

	path:nth-of-type(48) {
		animation-delay: 2.23s;
	}

	path:nth-of-type(49) {
		animation-delay: 2.26s;
	}

	path:nth-of-type(50) {
		animation-delay: 2.29s;
	}

	path:nth-of-type(51) {
		animation-delay: 2.32s;
	}

	path:nth-of-type(52) {
		animation-delay: 2.35s;
	}

	path:nth-of-type(53) {
		animation-delay: 2.38s;
	}

	path:nth-of-type(54) {
		animation-delay: 2.41s;
	}

	path:nth-of-type(55) {
		animation-delay: 2.44s;
	}

	path:nth-of-type(56) {
		animation-delay: 2.47s;
	}

	path:nth-of-type(57) {
		animation-delay: 2.5s;
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

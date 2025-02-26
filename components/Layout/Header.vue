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
const confettiActive = ref(false);
const confettiCanvas = ref(null);
let confettiFrame = null; // Define the frame variable at component scope

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
	startContinuousConfetti();
});

onUnmounted(() => {
	window.removeEventListener('scroll', manageNavBarAnimations);
	stopConfetti();
});

import confetti from 'canvas-confetti';

function startContinuousConfetti() {
	confettiActive.value = true;

	const colors = ['#00bfff', '#0ef62d', '#e8fc00', '#ffcc00', '#ff005c', '#ff00cc', '#502989'];

	// Function to run a single burst of confetti
	const runConfettiBurst = () => {
		if (!confettiActive.value) return;

		// Left side confetti - allowing for more spread now that overflow is enabled
		confetti({
			particleCount: 3,
			angle: 60,
			spread: 55,
			origin: { x: 0, y: 0.1 },
			colors: colors,
			gravity: 0.4,
			scalar: 0.7,
			drift: 0.2,
			ticks: 250,
		});

		// Right side confetti
		confetti({
			particleCount: 3,
			angle: 120,
			spread: 55,
			origin: { x: 1, y: 0.1 },
			colors: colors,
			gravity: 0.4,
			scalar: 0.7,
			drift: 0.2,
			ticks: 250,
		});

		// Schedule next burst with a random delay
		confettiFrame = setTimeout(runConfettiBurst, Math.random() * 2000 + 600);
	};

	// Start the cycle
	runConfettiBurst();
}

function stopConfetti() {
	confettiActive.value = false;
	if (confettiFrame) {
		clearTimeout(confettiFrame);
		confettiFrame = null;
	}
}

// Optionally restart confetti on route change
const route = useRoute();
watch(
	() => route.path,
	() => {
		if (confettiActive.value) {
			stopConfetti();
			startContinuousConfetti();
		}
	},
);
</script>
<template>
	<header
		class="w-full flex items-center justify-center z-40 bg-gray-100 dark:bg-gradient-to-tr dark:from-gray-800 dark:to-gray-900 transition-all py-3 shadow header"
	>
		<!-- Create an absolutely positioned canvas container that allows overflow -->
		<div class="absolute inset-0 pointer-events-none" ref="confettiCanvas"></div>

		<div class="absolute flex items-center justify-center flex-row left-[10px] sm:pr-1 md:px-6">
			<client-only>
				<LayoutOrganizationSelect v-if="user" :user="user" />
				<LayoutTeamSelect v-if="user" class="ml-2" />
			</client-only>
		</div>

		<nuxt-link to="/" class="flex flex-row items-center justify-center ml-2">
			<Confetti />
		</nuxt-link>
		<div class="absolute flex items-center justify-center flex-row right-[10px] sm:pr-1 md:px-6">
			<nuxt-link to="/account" class="flex items-center justify-self-center">
				<Avatar v-if="user" :user="user" text="12" class="mr-2" />
				<UAvatar v-else icon="i-heroicons-user" size="sm" class="mr-1 sm:mr-2" />
			</nuxt-link>
			<LayoutNotificationsMenu v-if="user" class="mr-2" />
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
	position: relative; /* Ensure it's positioned relatively for absolute children */
	/* Removed overflow: hidden to allow confetti to extend beyond header */
	#confetti {
		height: 30px;
		width: auto;
	}
}

header.retracted {
	transform: translateY(-100px);
}

/* Rest of your styles remain the same */
.logo {
	width: 75px;
	path {
		opacity: 0.4;
		animation-name: logo;
		animation-duration: 5s;
		animation-timing-function: var(--curve);
		animation-iteration-count: infinite;
	}

	/* Animation delays remain the same */
	path:nth-of-type(1) {
		animation-delay: 0.1s;
	}

	/* Rest of the path animation delays */
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

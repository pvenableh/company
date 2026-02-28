<script setup>
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from 'lucide-vue-next'

const { user } = useDirectusAuth();
const config = useRuntimeConfig();

const props = defineProps({
	links: {
		type: Array,
		default: () => [],
	},
});

const isRetracted = ref(false);

const avatarUrl = computed(() => {
	if (!user.value?.avatar) return null;
	return `${config.public.assetsUrl}${user.value.avatar}?key=avatar`;
});

const initials = computed(() => {
	if (!user.value) return 'U';
	const first = user.value.first_name?.[0] ?? '';
	const last = user.value.last_name?.[0] ?? '';
	return (first + last).toUpperCase() || 'U';
});

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
			<template v-if="user">
				<nuxt-link to="/account" class="flex items-center justify-self-center">
					<Avatar class="size-8 mr-2">
						<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" />
						<AvatarFallback>{{ initials }}</AvatarFallback>
					</Avatar>
				</nuxt-link>
				<LayoutNotificationsMenu class="mr-2" />
			</template>
			<template v-else>
				<nuxt-link
					to="/auth/signin"
					class="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-primary hover:text-primary transition-all duration-300"
				>
					Sign In
				</nuxt-link>
			</template>
		</div>
	</header>
</template>

<style>
@reference "~/assets/css/tailwind.css";
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

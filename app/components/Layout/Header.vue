<script setup>
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, ChevronDown } from 'lucide-vue-next'

const { user } = useDirectusAuth();
const { personas, selectedPersona, activePersona } = useAIPersona();
const config = useRuntimeConfig();

const props = defineProps({
	links: {
		type: Array,
		default: () => [],
	},
});

const isRetracted = ref(false);
const showOrgSwitcher = ref(false);

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
				<LayoutClientSelect v-if="user" :user="user" @open-org-switcher="showOrgSwitcher = true" />
				<LayoutTeamSelect v-if="user" class="ml-2" />
			</client-only>
		</div>

		<!-- Org Switcher Modal -->
		<LayoutOrgSwitcher v-if="user" v-model="showOrgSwitcher" />

		<nuxt-link to="/" class="header-brand" :class="{ 'header-brand--retracted': isRetracted }">
			<LogoEarnest size="md" />
			<span class="header-tagline">Do good work.</span>
		</nuxt-link>
		<div class="account-controls">
			<template v-if="user">
				<!-- AI Persona Selector -->
				<client-only>
				<DropdownMenu>
					<DropdownMenuTrigger as-child>
						<button
							class="flex items-center gap-1 px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 hover:border-primary/50 transition-colors text-[9px] uppercase tracking-wider font-medium text-gray-700 dark:text-gray-300 mr-2"
						>
							<div class="size-5 rounded-full flex items-center justify-center shrink-0" :class="activePersona.iconBg">
								<UIcon :name="activePersona.icon" class="w-3 h-3" :class="activePersona.iconColor" />
							</div>
							<span class="hidden sm:inline truncate max-w-[80px]">{{ activePersona.label.replace('The ', '') }}</span>
							<ChevronDown class="size-3 text-gray-400 shrink-0" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" class="w-56">
						<DropdownMenuItem
							v-for="p in personas"
							:key="p.value"
							class="flex items-center gap-3 cursor-pointer"
							:class="{ 'bg-accent': selectedPersona === p.value }"
							@click="selectedPersona = p.value"
						>
							<div class="size-7 rounded-full flex items-center justify-center shrink-0" :class="p.iconBg">
								<UIcon :name="p.icon" class="w-3.5 h-3.5" :class="p.iconColor" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-xs font-medium">{{ p.label }}</p>
								<p class="text-[10px] text-muted-foreground truncate">{{ p.description }}</p>
							</div>
							<UIcon v-if="selectedPersona === p.value" name="i-heroicons-check" class="w-4 h-4 text-primary shrink-0" />
						</DropdownMenuItem>
						<div class="border-t border-border mt-1 pt-1">
							<DropdownMenuItem as-child>
								<NuxtLink to="/command-center/ai" class="flex items-center gap-2 cursor-pointer text-primary">
									<UIcon name="i-heroicons-chat-bubble-left-right" class="w-4 h-4" />
									<span class="text-xs font-medium">Open Chat</span>
								</NuxtLink>
							</DropdownMenuItem>
						</div>
					</DropdownMenuContent>
				</DropdownMenu>
				</client-only>

				<nuxt-link to="/account" class="flex items-center justify-self-center">
					<UserAvatar class="size-8 mr-2">
						<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" />
						<AvatarFallback>{{ initials }}</AvatarFallback>
					</UserAvatar>
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
	background: rgba(255, 255, 255, 0.72);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	@apply w-full flex items-center justify-center z-40 border-b border-border/40 transition-all duration-300 ease-in-out py-4 left-1/2 -translate-x-1/2;
	.filter-controls {
		@apply absolute flex items-center justify-center flex-row left-[10px] sm:pr-1 md:px-6 transition-all duration-300 ease-in-out;
	}
	.account-controls {
		@apply absolute flex items-center justify-center flex-row right-[10px] sm:pr-1 md:px-6 transition-all duration-300 ease-in-out;
	}
}

:is(.dark) header {
	background: rgba(20, 20, 20, 0.72);
}

header.retracted {
	top: 8px;
	background: rgba(255, 255, 255, 0.82);
	@apply rounded-full w-11/12 md:w-5/6 lg:w-4/5 xl:w-3/5 py-3 md:py-2.5 border border-border/30 shadow-sm;
	.filter-controls {
		@apply left-[5px] md:px-0;
	}
	.account-controls {
		@apply right-[5px] md:px-3;
	}
}

:is(.dark) header.retracted {
	background: rgba(20, 20, 20, 0.82);
}

.header-brand {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	transform: scale(1);
	transform-origin: center center;
	transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.header-brand--retracted {
	transform: scale(0.78);
}

.header-tagline {
	font-family: var(--font-signature);
	font-size: 11px;
	line-height: 1;
	letter-spacing: 0.02em;
	color: hsl(var(--muted-foreground));
	margin-top: 1px;
}
</style>

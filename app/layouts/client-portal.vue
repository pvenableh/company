<template>
	<div class="relative bg-background text-foreground transition duration-150 lg:overflow-visible ios-safe-area">
		<!-- Simplified header for client portal -->
		<header class="portal-header" :class="{ retracted: isRetracted }">
			<div class="filter-controls">
				<client-only>
					<LayoutClientSelect v-if="user" :user="user" />
				</client-only>
			</div>

			<nuxt-link to="/portal" class="header-brand" :class="{ 'header-brand--retracted': isRetracted }">
				<LogoEarnest size="md" />
				<span class="header-tagline">Client Portal</span>
			</nuxt-link>

			<div class="account-controls">
				<template v-if="user">
					<nuxt-link to="/account" class="flex items-center justify-self-center">
						<UserAvatar class="size-8 mr-2">
							<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" />
							<AvatarFallback>{{ initials }}</AvatarFallback>
						</UserAvatar>
					</nuxt-link>
					<LayoutNotificationsMenu class="mr-2" />
				</template>
			</div>
		</header>

		<div class="page pb-safe-portal pt-portal-header">
			<slot />
		</div>

		<!-- Mobile toolbar — primary links only -->
		<nav class="portal-toolbar md:hidden">
			<NuxtLink
				v-for="link in primaryLinks"
				:key="link.to"
				:to="link.to"
				class="portal-tab"
				:class="{ 'portal-tab--active': isActiveRoute(link.to) }"
			>
				<Icon :name="link.icon" class="w-5 h-5" />
				<span class="text-[10px] mt-0.5">{{ link.name }}</span>
			</NuxtLink>
			<!-- More sheet trigger -->
			<button class="portal-tab" :class="{ 'portal-tab--active': showMore }" @click="showMore = !showMore">
				<Icon name="lucide:more-horizontal" class="w-5 h-5" />
				<span class="text-[10px] mt-0.5">More</span>
			</button>
		</nav>

		<!-- Mobile "More" sheet -->
		<Transition name="slide-up">
			<div v-if="showMore" class="fixed inset-0 z-50 md:hidden flex flex-col justify-end" @click.self="showMore = false">
				<div class="bg-background border-t border-border/40 rounded-t-2xl shadow-xl p-4 pb-safe-portal">
					<div class="w-12 h-1 rounded-full bg-muted mx-auto mb-4" />
					<div class="grid grid-cols-4 gap-2">
						<NuxtLink
							v-for="link in secondaryLinks"
							:key="link.to"
							:to="link.to"
							class="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors"
							:class="isActiveRoute(link.to) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'"
							@click="showMore = false"
						>
							<Icon :name="link.icon" class="w-6 h-6" />
							<span class="text-[10px]">{{ link.name }}</span>
						</NuxtLink>
					</div>
				</div>
			</div>
		</Transition>

		<!-- Desktop sidebar nav (visible on md+) -->
		<aside class="hidden md:flex portal-sidebar">
			<nav class="flex flex-col gap-1 p-3 w-full">
				<NuxtLink
					v-for="link in portalLinks"
					:key="link.to"
					:to="link.to"
					class="portal-nav-item"
					:class="{ 'portal-nav-item--active': isActiveRoute(link.to) }"
				>
					<Icon :name="link.icon" class="w-5 h-5" />
					<span>{{ link.name }}</span>
				</NuxtLink>
			</nav>

			<!-- Client info at bottom -->
			<div v-if="clientName" class="p-3 border-t border-border/40 mt-auto">
				<div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50">
					<Icon name="lucide:building-2" class="w-4 h-4 text-muted-foreground shrink-0" />
					<span class="text-xs text-muted-foreground truncate">{{ clientName }}</span>
				</div>
			</div>
		</aside>
	</div>
</template>

<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const { user } = useDirectusAuth();
const { membership } = useOrgRole();
const config = useRuntimeConfig();
const route = useRoute();

const isRetracted = ref(false);
const showMore = ref(false);

type PortalLink = { name: string; to: string; icon: string; key?: 'social' | 'marketing' | 'proposals' | 'contracts' };

const ALL_LINKS: PortalLink[] = [
	{ name: 'Dashboard',  to: '/portal',           icon: 'lucide:layout-dashboard' },
	{ name: 'Projects',   to: '/portal/projects',  icon: 'lucide:folder-kanban' },
	{ name: 'Tasks',      to: '/portal/tasks',     icon: 'lucide:check-square' },
	{ name: 'Tickets',    to: '/portal/tickets',   icon: 'lucide:ticket' },
	{ name: 'Invoices',   to: '/portal/invoices',  icon: 'lucide:file-text' },
	{ name: 'Proposals',  to: '/portal/proposals', icon: 'lucide:file-signature', key: 'proposals' },
	{ name: 'Contracts',  to: '/portal/contracts', icon: 'lucide:file-badge',     key: 'contracts' },
	{ name: 'Social',     to: '/portal/social',    icon: 'lucide:bar-chart-2',    key: 'social' },
	{ name: 'Marketing',  to: '/portal/marketing', icon: 'lucide:megaphone',      key: 'marketing' },
	{ name: 'Messages',   to: '/portal/messages',  icon: 'lucide:message-square' },
];

// Optional sections — hidden when the client has zero data for them.
const availability = ref<Partial<Record<NonNullable<PortalLink['key']>, boolean>>>({
	social: true,
	marketing: true,
	proposals: true,
	contracts: true,
});

async function loadAvailability() {
	if (!user.value) return;
	try {
		availability.value = await $fetch('/api/portal/nav-availability');
	} catch {
		// Leave defaults (show everything) if the endpoint fails — better
		// than hiding nav and confusing the user.
	}
}

const portalLinks = computed(() => {
	return ALL_LINKS.filter((link) => {
		if (!link.key) return true;
		return availability.value[link.key] !== false;
	});
});

const primaryLinks = computed(() => portalLinks.value.slice(0, 4));
const secondaryLinks = computed(() => portalLinks.value.slice(4));

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

const clientName = computed(() => {
	if (!membership.value?.client) return null;
	const client = membership.value.client;
	return typeof client === 'object' ? client.name : null;
});

function isActiveRoute(path: string): boolean {
	if (path === '/portal') {
		return route.path === '/portal' || route.path === '/portal/';
	}
	return route.path.startsWith(path);
}

const manageNavBarAnimations = () => {
	isRetracted.value = window.scrollY > 10;
};

onMounted(() => {
	if (import.meta.client) {
		window.addEventListener('scroll', manageNavBarAnimations);
		loadAvailability();
	}
});

watch(() => user.value?.id, (id) => {
	if (id) loadAvailability();
});

onUnmounted(() => {
	if (import.meta.client) {
		window.removeEventListener('scroll', manageNavBarAnimations);
	}
});
</script>

<style>
@reference "~/assets/css/tailwind.css";

.portal-header {
	position: fixed;
	background: rgba(255, 255, 255, 0.72);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	@apply w-full flex items-center justify-center z-40 border-b border-border/40 transition-all duration-300 ease-in-out py-4 left-1/2 -translate-x-1/2;
}
.portal-header .filter-controls {
	@apply absolute flex items-center justify-center flex-row left-[10px] sm:pr-1 md:px-6 transition-all duration-300 ease-in-out;
}
.portal-header .account-controls {
	@apply absolute flex items-center justify-center flex-row right-[10px] sm:pr-1 md:px-6 transition-all duration-300 ease-in-out;
}

:is(.dark) .portal-header {
	background: rgba(20, 20, 20, 0.72);
}

.portal-header.retracted {
	top: 8px;
	background: rgba(255, 255, 255, 0.82);
	@apply rounded-full w-11/12 md:w-5/6 lg:w-4/5 xl:w-3/5 py-3 md:py-2.5 border border-border/30 shadow-sm;
}
.portal-header.retracted .filter-controls {
	@apply left-[5px] md:px-0;
}
.portal-header.retracted .account-controls {
	@apply right-[5px] md:px-0;
}
:is(.dark) .portal-header.retracted {
	background: rgba(20, 20, 20, 0.82);
}

/* Mobile toolbar */
.portal-toolbar {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 50;
	display: flex;
	justify-content: space-around;
	align-items: center;
	background: rgba(255, 255, 255, 0.82);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	border-top: 1px solid hsl(var(--border) / 0.4);
	padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px));
}
:is(.dark) .portal-toolbar {
	background: rgba(20, 20, 20, 0.82);
}

.portal-tab {
	@apply flex flex-col items-center justify-center gap-0.5 py-1 px-3 text-muted-foreground transition-colors;
}
.portal-tab--active {
	@apply text-primary;
}

/* Desktop sidebar */
.portal-sidebar {
	position: fixed;
	top: 0;
	left: 0;
	bottom: 0;
	width: 200px;
	z-index: 30;
	padding-top: 80px;
	flex-direction: column;
	border-right: 1px solid hsl(var(--border) / 0.4);
	background: hsl(var(--background));
}

.portal-nav-item {
	@apply flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors;
}
.portal-nav-item--active {
	@apply text-foreground bg-muted/80 font-medium;
}

/* Push page content below the fixed header. Header is ~76px tall expanded. */
.pt-portal-header {
	padding-top: 88px;
}

/* Page content offset for sidebar */
@media (min-width: 768px) {
	.portal-header {
		padding-left: 200px;
	}
	.page.pb-safe-portal {
		margin-left: 200px;
		padding-bottom: 0;
	}
}
@media (max-width: 767px) {
	.pb-safe-portal {
		padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 16px);
	}
}

.slide-up-enter-active,
.slide-up-leave-active {
	transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
	opacity: 0;
	transform: translateY(100%);
}
</style>

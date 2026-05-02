<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const props = defineProps<{
	user?: Record<string, any>
}>()

const emit = defineEmits<{
	'open-spotlight': []
	'open-ai-tray': []
}>()

const config = useRuntimeConfig()

const mobileDrawerOpen = ref(false)
const showOrgSwitcher = ref(false)

// ── User avatar ──
const avatarUrl = computed(() => {
	if (!props.user?.avatar) return null
	return `${config.public.assetsUrl}${props.user.avatar}?key=avatar`
})

const initials = computed(() => {
	if (!props.user) return 'U'
	const first = props.user.first_name?.[0] ?? ''
	const last = props.user.last_name?.[0] ?? ''
	return (first + last).toUpperCase() || 'U'
})
</script>

<template>
	<div class="flex h-screen bg-background">
		<!-- ─── Sidebar (desktop + mobile drawer) ─── -->
		<LayoutSpacesSidebar
			v-model:mobile-open="mobileDrawerOpen"
			:user="user"
			@open-spotlight="emit('open-spotlight')"
			@open-ai-tray="emit('open-ai-tray')"
		/>

		<!-- ─── Main area ─── -->
		<div class="flex-1 flex flex-col min-w-0">
			<!-- Header -->
			<header class="glass flex items-center justify-between border-b border-border/40 pl-1 pr-2 sm:px-4 lg:px-6 h-12 shrink-0 z-40">
				<!-- Left: Menu button (mobile) + sidebar toggle (desktop) + context -->
				<div class="flex items-center gap-0.5 sm:gap-1 min-w-0">
					<ClientOnly>
						<div class="flex items-center gap-0.5 sm:gap-1">
							<!-- Open drawer (mobile only, sidebar visible on md+) -->
							<button
								class="md:hidden flex items-center justify-center w-7 h-7 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors"
								@click="mobileDrawerOpen = !mobileDrawerOpen"
							>
								<Icon :name="mobileDrawerOpen ? 'lucide:x' : 'lucide:menu'" class="w-4 h-4" />
							</button>
							<LayoutClientSelect v-if="user" :user="user" @open-org-switcher="showOrgSwitcher = true" />
							<LayoutTeamSelect v-if="user" class="hidden lg:block" />
						</div>
					</ClientOnly>
				</div>

				<!-- Center: Logo + tagline -->
				<NuxtLink to="/" class="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
					<LogoEarnest size="sm" />
					<span class="header-tagline">Do good work.</span>
				</NuxtLink>

				<!-- Right: Help + Search + Notifications + Avatar -->
				<div class="flex items-center gap-1.5 sm:gap-2">
					<div class="hidden sm:block">
						<WalkthroughHelpMenu />
					</div>
					<button
						class="hidden sm:flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/50 text-muted-foreground"
						@click="emit('open-spotlight')"
					>
						<Icon name="lucide:search" class="w-4 h-4" />
					</button>
					<LayoutNotificationsMenu />
					<NuxtLink v-if="user" to="/account" class="shrink-0">
						<Avatar class="size-7">
							<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" />
							<AvatarFallback class="text-xs font-semibold">{{ initials }}</AvatarFallback>
						</Avatar>
					</NuxtLink>
				</div>
			</header>

			<LayoutSubNav />

			<!-- Page content — slot fills remaining height so footer pins to bottom on short pages -->
			<main class="flex-1 overflow-auto">
				<div class="min-h-full flex flex-col">
					<div class="flex-1">
						<slot />
					</div>
					<LayoutFooter />
				</div>
			</main>

			<!-- Walkthrough overlay (global) -->
			<ClientOnly>
				<WalkthroughManager />
			</ClientOnly>
		</div>

		<!-- Org Switcher Modal -->
		<LayoutOrgSwitcher v-model="showOrgSwitcher" />
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* ── Header tagline ── */
.header-tagline {
	font-family: var(--font-signature);
	font-size: 11px;
	line-height: 1;
	letter-spacing: 0.02em;
	color: hsl(var(--muted-foreground));
	margin-top: 1px;
}
</style>

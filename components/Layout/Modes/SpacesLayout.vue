<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const props = defineProps<{
	user?: Record<string, any>
}>()

const emit = defineEmits<{
	'open-spotlight': []
	'open-ai-tray': []
}>()

const route = useRoute()
const config = useRuntimeConfig()
const { currentContext } = useContextualHat()

// ── Sidebar state (default collapsed on desktop) ──
const sidebarCollapsed = ref(true)
const mobileDrawerOpen = ref(false)

// ── Collapsible space sections ──
const SPACE_STORAGE_KEY = 'earnest-spaces-collapsed'

const spacesCollapsed = ref<Record<string, boolean>>({
	work: false,
	relationships: false,
	business: false,
})

// Persist collapsed state
if (import.meta.client) {
	try {
		const saved = localStorage.getItem(SPACE_STORAGE_KEY)
		if (saved) spacesCollapsed.value = JSON.parse(saved)
	} catch {}
}

const toggleSpace = (space: string) => {
	spacesCollapsed.value[space] = !spacesCollapsed.value[space]
	if (import.meta.client) {
		localStorage.setItem(SPACE_STORAGE_KEY, JSON.stringify(spacesCollapsed.value))
	}
}

// ── Navigation items ──
interface NavItem {
	name: string
	to: string
	icon: string
}

const workItems: NavItem[] = [
	{ name: 'Projects', to: '/projects', icon: 'lucide:gantt-chart' },
	{ name: 'Tickets', to: '/tickets', icon: 'heroicons:queue-list' },
	{ name: 'Tasks', to: '/tasks', icon: 'heroicons:clipboard-document-check' },
	{ name: 'Scheduler', to: '/scheduler', icon: 'heroicons:calendar-date-range' },
	{ name: 'Files', to: '/files', icon: 'heroicons:folder-open' },
]

const relationshipItems: NavItem[] = [
	{ name: 'People', to: '/people', icon: 'heroicons:user-group' },
	{ name: 'Leads', to: '/leads', icon: 'heroicons:funnel' },
	{ name: 'Channels', to: '/channels', icon: 'heroicons:chat-bubble-left-right' },
	{ name: 'Teams', to: '/organization/teams', icon: 'heroicons:users' },
]

const businessItems: NavItem[] = [
	{ name: 'Invoices', to: '/invoices', icon: 'heroicons:document-text' },
	{ name: 'Proposals', to: '/proposals', icon: 'heroicons:document-check' },
	{ name: 'Marketing', to: '/marketing', icon: 'lucide:bar-chart-3' },
	{ name: 'Financials', to: '/financials', icon: 'heroicons:chart-bar' },
]

// ── Active check ──
function isActiveItem(to: string): boolean {
	return route.path === to || route.path.startsWith(to + '/')
}

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

// Close mobile drawer on route change
watch(() => route.path, () => {
	mobileDrawerOpen.value = false
})
</script>

<template>
	<div class="flex h-screen bg-background">
		<!-- ─── Desktop Sidebar ─── -->
		<aside
			class="hidden xl:flex flex-col border-r border-border/40 bg-sidebar-background shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-30"
			:class="sidebarCollapsed ? 'w-14 overflow-visible' : 'w-60 overflow-hidden'"
		>
			<!-- Command Center link (top of sidebar) -->
			<div class="p-3 pb-1 shrink-0">
				<NuxtLink
					to="/"
					class="nav-item w-full"
					:class="{ 'nav-item-active': route.path === '/', 'justify-center': sidebarCollapsed, 'has-tooltip': sidebarCollapsed }"
					:data-tooltip="sidebarCollapsed ? 'Command Center' : undefined"
				>
					<Icon name="heroicons:command-line" class="w-4 h-4 shrink-0" />
					<span v-if="!sidebarCollapsed" class="text-[13px] font-medium">Command Center</span>
				</NuxtLink>
			</div>

			<!-- Scrollable nav -->
			<nav class="flex-1 px-3 space-y-1" :class="sidebarCollapsed ? 'overflow-visible' : 'overflow-y-auto'">
				<!-- WORK -->
				<div>
					<button
						v-if="!sidebarCollapsed"
						@click="toggleSpace('work')"
						class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
					>
						<Icon :name="spacesCollapsed.work ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3 shrink-0" />
						<span>Work</span>
					</button>
					<div v-if="sidebarCollapsed" class="h-2" />
					<div v-show="!spacesCollapsed.work || sidebarCollapsed" class="space-y-0.5 mt-0.5">
						<NuxtLink
							v-for="item in workItems"
							:key="item.to + item.name"
							:to="item.to"
							class="nav-item"
							:class="{ 'nav-item-active': isActiveItem(item.to), 'justify-center': sidebarCollapsed, 'has-tooltip': sidebarCollapsed }"
							:data-tooltip="sidebarCollapsed ? item.name : undefined"
						>
							<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
							<span v-if="!sidebarCollapsed" class="text-[13px]">{{ item.name }}</span>
						</NuxtLink>
					</div>
				</div>

				<!-- RELATIONSHIPS -->
				<div class="pt-2">
					<button
						v-if="!sidebarCollapsed"
						@click="toggleSpace('relationships')"
						class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
					>
						<Icon :name="spacesCollapsed.relationships ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3 shrink-0" />
						<span>Relationships</span>
					</button>
					<div v-if="sidebarCollapsed" class="h-2" />
					<div v-show="!spacesCollapsed.relationships || sidebarCollapsed" class="space-y-0.5 mt-0.5">
						<NuxtLink
							v-for="item in relationshipItems"
							:key="item.to"
							:to="item.to"
							class="nav-item"
							:class="{ 'nav-item-active': isActiveItem(item.to), 'justify-center': sidebarCollapsed, 'has-tooltip': sidebarCollapsed }"
							:data-tooltip="sidebarCollapsed ? item.name : undefined"
						>
							<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
							<span v-if="!sidebarCollapsed" class="text-[13px]">{{ item.name }}</span>
						</NuxtLink>
					</div>
				</div>

				<!-- BUSINESS -->
				<div class="pt-2">
					<button
						v-if="!sidebarCollapsed"
						@click="toggleSpace('business')"
						class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
					>
						<Icon :name="spacesCollapsed.business ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3 shrink-0" />
						<span>Business</span>
					</button>
					<div v-if="sidebarCollapsed" class="h-2" />
					<div v-show="!spacesCollapsed.business || sidebarCollapsed" class="space-y-0.5 mt-0.5">
						<NuxtLink
							v-for="item in businessItems"
							:key="item.to"
							:to="item.to"
							class="nav-item"
							:class="{ 'nav-item-active': isActiveItem(item.to), 'justify-center': sidebarCollapsed, 'has-tooltip': sidebarCollapsed }"
							:data-tooltip="sidebarCollapsed ? item.name : undefined"
						>
							<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
							<span v-if="!sidebarCollapsed" class="text-[13px]">{{ item.name }}</span>
						</NuxtLink>
					</div>
				</div>
			</nav>

			<!-- Footer utilities -->
			<div class="p-3 border-t border-border/30 space-y-0.5 shrink-0">
				<button
					class="nav-item w-full"
					:class="{ 'justify-center': sidebarCollapsed, 'has-tooltip': sidebarCollapsed }"
					:data-tooltip="sidebarCollapsed ? 'Earnest AI' : undefined"
					@click="emit('open-ai-tray')"
				>
					<Icon name="heroicons:sparkles" class="w-4 h-4 shrink-0" />
					<span v-if="!sidebarCollapsed" class="text-[13px]">AI</span>
				</button>
				<!-- Timer omitted from desktop sidebar — floating dock provides quick timer access -->
				<NuxtLink
					to="/organization"
					class="nav-item"
					:class="{ 'nav-item-active': isActiveItem('/organization'), 'justify-center': sidebarCollapsed, 'has-tooltip': sidebarCollapsed }"
					:data-tooltip="sidebarCollapsed ? 'Settings' : undefined"
				>
					<Icon name="lucide:settings" class="w-4 h-4 shrink-0" />
					<span v-if="!sidebarCollapsed" class="text-[13px]">Settings</span>
				</NuxtLink>

				<!-- Collapse toggle -->
				<button
					@click="sidebarCollapsed = !sidebarCollapsed"
					class="nav-item w-full mt-1"
					:class="{ 'justify-center': sidebarCollapsed, 'has-tooltip': sidebarCollapsed }"
					:data-tooltip="sidebarCollapsed ? 'Expand' : undefined"
				>
					<Icon :name="sidebarCollapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'" class="w-4 h-4 shrink-0" />
					<span v-if="!sidebarCollapsed" class="text-[13px]">Collapse</span>
				</button>
			</div>
		</aside>

		<!-- ─── Main area ─── -->
		<div class="flex-1 flex flex-col min-w-0">
			<!-- Header -->
			<header class="glass flex items-center justify-between border-b border-border/40 px-4 lg:px-6 h-12 shrink-0 z-40">
				<!-- Left: Menu button (mobile) + sidebar toggle (desktop) + context -->
				<div class="flex items-center gap-2 min-w-0">
					<button
						class="xl:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 text-muted-foreground"
						@click="mobileDrawerOpen = true"
					>
						<Icon name="lucide:menu" class="w-5 h-5" />
					</button>
					<!-- Mobile: compact context pill -->
					<LayoutContextPill class="lg:hidden" />
					<!-- Desktop: inline client & team selects -->
					<ClientOnly>
						<div class="hidden lg:flex items-center gap-1">
							<LayoutClientSelect v-if="user" :user="user" />
							<LayoutTeamSelect v-if="user" />
						</div>
					</ClientOnly>
				</div>

				<!-- Center: Logo + tagline -->
				<NuxtLink to="/" class="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
					<LogoEarnest size="sm" />
					<span class="header-tagline">Do good work.</span>
				</NuxtLink>

				<!-- Right: Notifications + Avatar -->
				<div class="flex items-center gap-2">
					<button
						class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/50 text-muted-foreground"
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

			<!-- Page content -->
			<main class="flex-1 overflow-auto">
				<slot />
			</main>
		</div>

		<!-- ─── Mobile Drawer Overlay ─── -->
		<Teleport to="body">
			<Transition name="drawer-backdrop">
				<div
					v-if="mobileDrawerOpen"
					class="fixed inset-0 bg-black/30 z-50 xl:hidden"
					@click="mobileDrawerOpen = false"
				/>
			</Transition>
			<Transition name="drawer-slide">
				<aside
					v-if="mobileDrawerOpen"
					class="fixed inset-y-0 left-0 w-72 bg-background border-r border-border/40 z-50 xl:hidden flex flex-col overflow-y-auto"
				>
					<!-- Mobile sidebar content (same as desktop but always expanded) -->
					<div class="p-3">
						<button
							@click="emit('open-spotlight')"
							class="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-muted-foreground hover:bg-muted/50 transition-colors"
						>
							<Icon name="lucide:search" class="w-4 h-4" />
							<span class="text-xs">Search</span>
							<span class="ml-auto text-[10px] text-muted-foreground/50 font-mono">⌘K</span>
						</button>
					</div>

					<nav class="flex-1 px-3 space-y-1">
						<div>
							<button @click="toggleSpace('work')" class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Icon :name="spacesCollapsed.work ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3" />
								<span>Work</span>
							</button>
							<div v-show="!spacesCollapsed.work" class="space-y-0.5 mt-0.5">
								<NuxtLink v-for="item in workItems" :key="item.to + item.name" :to="item.to" class="nav-item" :class="{ 'nav-item-active': isActiveItem(item.to) }">
									<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
									<span class="text-[13px]">{{ item.name }}</span>
								</NuxtLink>
							</div>
						</div>
						<div class="pt-2">
							<button @click="toggleSpace('relationships')" class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Icon :name="spacesCollapsed.relationships ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3" />
								<span>Relationships</span>
							</button>
							<div v-show="!spacesCollapsed.relationships" class="space-y-0.5 mt-0.5">
								<NuxtLink v-for="item in relationshipItems" :key="item.to" :to="item.to" class="nav-item" :class="{ 'nav-item-active': isActiveItem(item.to) }">
									<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
									<span class="text-[13px]">{{ item.name }}</span>
								</NuxtLink>
							</div>
						</div>
						<div class="pt-2">
							<button @click="toggleSpace('business')" class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Icon :name="spacesCollapsed.business ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3" />
								<span>Business</span>
							</button>
							<div v-show="!spacesCollapsed.business" class="space-y-0.5 mt-0.5">
								<NuxtLink v-for="item in businessItems" :key="item.to" :to="item.to" class="nav-item" :class="{ 'nav-item-active': isActiveItem(item.to) }">
									<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
									<span class="text-[13px]">{{ item.name }}</span>
								</NuxtLink>
							</div>
						</div>
					</nav>

					<div class="p-3 border-t border-border/30 space-y-0.5">
						<button class="nav-item w-full" @click="emit('open-ai-tray'); mobileDrawerOpen = false">
							<Icon name="heroicons:sparkles" class="w-4 h-4 shrink-0" />
							<span class="text-[13px]">AI</span>
						</button>
						<NuxtLink to="/time-tracker" class="nav-item" :class="{ 'nav-item-active': isActiveItem('/time-tracker') }">
							<Icon name="heroicons:clock" class="w-4 h-4 shrink-0" />
							<span class="text-[13px]">Timer</span>
						</NuxtLink>
						<NuxtLink to="/organization" class="nav-item" :class="{ 'nav-item-active': isActiveItem('/organization') }">
							<Icon name="lucide:settings" class="w-4 h-4 shrink-0" />
							<span class="text-[13px]">Settings</span>
						</NuxtLink>
					</div>
				</aside>
			</Transition>
		</Teleport>

		<!-- ─── Mobile Bottom Bar ─── -->
		<nav
			class="xl:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-border/40 flex items-center justify-around"
			style="height: calc(48px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom)"
		>
			<button @click="mobileDrawerOpen = true" class="mobile-btn">
				<Icon name="lucide:menu" class="w-5 h-5" />
				<span class="text-[9px]">Menu</span>
			</button>
			<button @click="emit('open-ai-tray')" class="mobile-btn">
				<Icon name="heroicons:sparkles" class="w-5 h-5" />
				<span class="text-[9px]">AI</span>
			</button>
			<button @click="emit('open-spotlight')" class="mobile-btn">
				<Icon name="lucide:search" class="w-5 h-5" />
				<span class="text-[9px]">Search</span>
			</button>
		</nav>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* ── Header tagline ── */
.header-tagline {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 9px;
	letter-spacing: 0.06em;
	color: hsl(var(--muted-foreground));
	margin-top: 1px;
}

/* ── Nav items ── */
.nav-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	border-radius: 8px;
	color: hsl(var(--muted-foreground));
	transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	cursor: pointer;
	text-decoration: none;
}

.nav-item:hover {
	background: hsl(var(--muted) / 0.5);
	color: hsl(var(--foreground));
}

.nav-item-active {
	background: hsl(var(--primary) / 0.08);
	color: hsl(var(--foreground));
	font-weight: 500;
}

/* ── CSS Tooltips for collapsed sidebar ── */
.has-tooltip {
	position: relative;
}

.has-tooltip::after {
	content: attr(data-tooltip);
	position: absolute;
	left: calc(100% + 10px);
	top: 50%;
	transform: translateY(-50%);
	padding: 4px 10px;
	border-radius: 6px;
	background: hsl(var(--foreground));
	color: hsl(var(--background));
	font-size: 11px;
	font-weight: 500;
	white-space: nowrap;
	pointer-events: none;
	opacity: 0;
	transition: opacity 0.15s ease;
	z-index: 100;
}

.has-tooltip:hover::after {
	opacity: 1;
}

/* ── Mobile bottom bar buttons ── */
.mobile-btn {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	padding: 6px 16px;
	color: hsl(var(--muted-foreground));
	transition: color 0.2s ease;
	-webkit-tap-highlight-color: transparent;
}

.mobile-btn:active {
	transform: scale(0.92);
	opacity: 0.7;
}

/* ── Drawer transitions ── */
.drawer-backdrop-enter-active,
.drawer-backdrop-leave-active {
	transition: opacity 0.3s ease;
}
.drawer-backdrop-enter-from,
.drawer-backdrop-leave-to {
	opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
	transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
	transform: translateX(-100%);
}
</style>

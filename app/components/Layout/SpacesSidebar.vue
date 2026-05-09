<script setup lang="ts">
const props = defineProps<{
	user?: Record<string, any>
	mobileOpen: boolean
}>()

const emit = defineEmits<{
	'update:mobileOpen': [value: boolean]
	'open-spotlight': []
	'open-ai-tray': []
}>()

const route = useRoute()
const { logout } = useLogout()
const { usageSummary } = useAITokens()
const { isOrgAdminOrAbove } = useOrgRole()
const { isDirectusAdmin } = useViewAsOrgAdmin()
const { isAppsMode, setMode: setAppsMode } = useAppsMode()

const showTokenMeter = computed(() => {
	if (isDirectusAdmin.value) return true
	if (isOrgAdminOrAbove.value) return true
	const s = usageSummary.value
	if (!s) return false
	return s.orgLimit !== null && s.orgLimit !== undefined
})

// ── Sidebar state (default collapsed on desktop) ──
const sidebarCollapsed = ref(true)

// ── Mobile drawer (v-model:mobileOpen) ──
const mobileOpen = computed({
	get: () => props.mobileOpen,
	set: (v: boolean) => emit('update:mobileOpen', v),
})

// Close mobile drawer on route change
watch(() => route.path, () => {
	mobileOpen.value = false
})

// ── Collapsible space sections ──
// Section keys + names mirror the pill-nav contexts (`useContextualHat`)
// so the icon-rail sidebar, the per-page pill nav, and the footer all
// agree on which item belongs to which group.
const SPACE_STORAGE_KEY = 'earnest-spaces-collapsed'

const spacesCollapsed = ref<Record<string, boolean>>({
	work: false,
	pipeline: false,
	financials: false,
	engage: false,
	team: false,
})

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

const ALL_WORK_ITEMS: NavItem[] = [
	{ name: 'Projects', to: '/projects', icon: 'lucide:gantt-chart' },
	{ name: 'Tickets', to: '/tickets', icon: 'heroicons:queue-list' },
	{ name: 'Tasks', to: '/tasks', icon: 'heroicons:clipboard-document-check' },
	{ name: 'Scheduler', to: '/scheduler', icon: 'heroicons:calendar-date-range' },
	{ name: 'Meetings', to: '/meetings', icon: 'heroicons:video-camera' },
	{ name: 'Files', to: '/files', icon: 'heroicons:folder-open' },
	{ name: 'Goals', to: '/goals', icon: 'lucide:target' },
]

const ALL_PIPELINE_ITEMS: NavItem[] = [
	{ name: 'Leads', to: '/leads', icon: 'heroicons:funnel' },
	{ name: 'Proposals', to: '/proposals', icon: 'heroicons:document-check' },
	{ name: 'Contracts', to: '/contracts', icon: 'lucide:file-signature' },
	{ name: 'Clients', to: '/clients', icon: 'heroicons:building-storefront' },
	{ name: 'Contacts', to: '/contacts', icon: 'heroicons:identification' },
]

const ALL_FINANCIALS_ITEMS: NavItem[] = [
	{ name: 'Invoices', to: '/invoices', icon: 'heroicons:document-text' },
	{ name: 'Expenses', to: '/expenses', icon: 'lucide:receipt' },
	{ name: 'Billing', to: '/organization?tab=billing', icon: 'lucide:banknote' },
	{ name: 'Financials', to: '/financials', icon: 'heroicons:chart-bar' },
]

const ALL_ENGAGE_ITEMS: NavItem[] = [
	{ name: 'Marketing', to: '/marketing', icon: 'lucide:megaphone' },
	{ name: 'Email', to: '/email', icon: 'lucide:mail' },
	{ name: 'Social', to: '/social', icon: 'lucide:share-2' },
]

const ALL_TEAM_ITEMS: NavItem[] = [
	{ name: 'Channels', to: '/channels', icon: 'heroicons:chat-bubble-left-right' },
	{ name: 'Teams', to: '/organization/teams', icon: 'heroicons:users' },
]

const workItems = ALL_WORK_ITEMS
const pipelineItems = ALL_PIPELINE_ITEMS
const financialsItems = ALL_FINANCIALS_ITEMS
const engageItems = ALL_ENGAGE_ITEMS
const teamItems = ALL_TEAM_ITEMS

function isActiveItem(to: string): boolean {
	return route.path === to || route.path.startsWith(to + '/')
}

function handleTopup() {
	openTokenModal()
}

async function handleEnterAppsMode() {
	try {
		await setAppsMode('apps')
		await navigateTo('/apps/clients')
	} catch {}
}
</script>

<template>
	<!-- ─── Desktop Sidebar ─── -->
	<aside
		class="hidden md:flex flex-col border-r border-border/40 bg-sidebar-background shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] relative z-50"
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

		<!-- Scrollable nav: 5 collapsible groups -->
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

				<!-- PIPELINE -->
				<div class="pt-2">
					<button
						v-if="!sidebarCollapsed"
						@click="toggleSpace('pipeline')"
						class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
					>
						<Icon :name="spacesCollapsed.pipeline ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3 shrink-0" />
						<span>Pipeline</span>
					</button>
					<div v-if="sidebarCollapsed" class="h-2" />
					<div v-show="!spacesCollapsed.pipeline || sidebarCollapsed" class="space-y-0.5 mt-0.5">
						<NuxtLink
							v-for="item in pipelineItems"
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

				<!-- FINANCIALS -->
				<div class="pt-2">
					<button
						v-if="!sidebarCollapsed"
						@click="toggleSpace('financials')"
						class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
					>
						<Icon :name="spacesCollapsed.financials ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3 shrink-0" />
						<span>Financials</span>
					</button>
					<div v-if="sidebarCollapsed" class="h-2" />
					<div v-show="!spacesCollapsed.financials || sidebarCollapsed" class="space-y-0.5 mt-0.5">
						<NuxtLink
							v-for="item in financialsItems"
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

				<!-- ENGAGE -->
				<div class="pt-2">
					<button
						v-if="!sidebarCollapsed"
						@click="toggleSpace('engage')"
						class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
					>
						<Icon :name="spacesCollapsed.engage ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3 shrink-0" />
						<span>Engage</span>
					</button>
					<div v-if="sidebarCollapsed" class="h-2" />
					<div v-show="!spacesCollapsed.engage || sidebarCollapsed" class="space-y-0.5 mt-0.5">
						<NuxtLink
							v-for="item in engageItems"
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

				<!-- TEAM -->
				<div class="pt-2">
					<button
						v-if="!sidebarCollapsed"
						@click="toggleSpace('team')"
						class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
					>
						<Icon :name="spacesCollapsed.team ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3 shrink-0" />
						<span>Team</span>
					</button>
					<div v-if="sidebarCollapsed" class="h-2" />
					<div v-show="!spacesCollapsed.team || sidebarCollapsed" class="space-y-0.5 mt-0.5">
						<NuxtLink
							v-for="item in teamItems"
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

		<!-- Apps Layout entry point — surfaced for classic users -->
		<div v-if="!isAppsMode" class="px-3 py-2 border-t border-border/30 shrink-0">
			<button
				type="button"
				class="nav-item w-full"
				:class="{ 'justify-center': sidebarCollapsed, 'has-tooltip': sidebarCollapsed }"
				:data-tooltip="sidebarCollapsed ? 'Try Apps Layout' : undefined"
				@click="handleEnterAppsMode"
			>
				<Icon name="lucide:layout-grid" class="w-4 h-4 shrink-0" />
				<span v-if="!sidebarCollapsed" class="text-[13px]">Try Apps Layout</span>
			</button>
		</div>

		<!-- Footer utilities -->
		<div class="p-3 border-t border-border/30 space-y-0.5 shrink-0">
			<!-- AI Token Meter (admins + users with limits) -->
			<OrganizationTokenMeter
				v-if="!sidebarCollapsed && showTokenMeter"
				compact
				class="mb-1"
				@topup="handleTopup"
			/>

			<NuxtLink
				to="/organization"
				class="nav-item"
				:class="{ 'nav-item-active': isActiveItem('/organization'), 'justify-center': sidebarCollapsed, 'has-tooltip': sidebarCollapsed }"
				:data-tooltip="sidebarCollapsed ? 'Organization' : undefined"
			>
				<Icon name="lucide:building-2" class="w-4 h-4 shrink-0" />
				<span v-if="!sidebarCollapsed" class="text-[13px]">Organization</span>
			</NuxtLink>

			<!-- Logout -->
			<button
				@click="logout"
				class="nav-item w-full"
				:class="{ 'justify-center': sidebarCollapsed, 'has-tooltip': sidebarCollapsed }"
				:data-tooltip="sidebarCollapsed ? 'Logout' : undefined"
			>
				<Icon name="lucide:log-out" class="w-4 h-4 shrink-0" />
				<span v-if="!sidebarCollapsed" class="text-[13px]">Logout</span>
			</button>

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

	<!-- ─── Mobile Drawer Overlay ─── -->
	<Teleport to="body">
		<Transition name="drawer-backdrop">
			<div
				v-if="mobileOpen"
				class="fixed inset-0 bg-black/30 z-50 xl:hidden"
				@click="mobileOpen = false"
			/>
		</Transition>
		<Transition name="drawer-slide">
			<aside
				v-if="mobileOpen"
				class="fixed inset-y-0 left-0 w-72 bg-background border-r border-border/40 z-50 xl:hidden flex flex-col overflow-y-auto"
			>
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
					<!-- 5 collapsible groups -->
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
							<button @click="toggleSpace('pipeline')" class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Icon :name="spacesCollapsed.pipeline ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3" />
								<span>Pipeline</span>
							</button>
							<div v-show="!spacesCollapsed.pipeline" class="space-y-0.5 mt-0.5">
								<NuxtLink v-for="item in pipelineItems" :key="item.to" :to="item.to" class="nav-item" :class="{ 'nav-item-active': isActiveItem(item.to) }">
									<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
									<span class="text-[13px]">{{ item.name }}</span>
								</NuxtLink>
							</div>
						</div>
						<div class="pt-2">
							<button @click="toggleSpace('financials')" class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Icon :name="spacesCollapsed.financials ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3" />
								<span>Financials</span>
							</button>
							<div v-show="!spacesCollapsed.financials" class="space-y-0.5 mt-0.5">
								<NuxtLink v-for="item in financialsItems" :key="item.to" :to="item.to" class="nav-item" :class="{ 'nav-item-active': isActiveItem(item.to) }">
									<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
									<span class="text-[13px]">{{ item.name }}</span>
								</NuxtLink>
							</div>
						</div>
						<div class="pt-2">
							<button @click="toggleSpace('engage')" class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Icon :name="spacesCollapsed.engage ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3" />
								<span>Engage</span>
							</button>
							<div v-show="!spacesCollapsed.engage" class="space-y-0.5 mt-0.5">
								<NuxtLink v-for="item in engageItems" :key="item.to" :to="item.to" class="nav-item" :class="{ 'nav-item-active': isActiveItem(item.to) }">
									<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
									<span class="text-[13px]">{{ item.name }}</span>
								</NuxtLink>
							</div>
						</div>
						<div class="pt-2">
							<button @click="toggleSpace('team')" class="flex items-center gap-2 w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								<Icon :name="spacesCollapsed.team ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="w-3 h-3" />
								<span>Team</span>
							</button>
							<div v-show="!spacesCollapsed.team" class="space-y-0.5 mt-0.5">
								<NuxtLink v-for="item in teamItems" :key="item.to" :to="item.to" class="nav-item" :class="{ 'nav-item-active': isActiveItem(item.to) }">
									<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
									<span class="text-[13px]">{{ item.name }}</span>
								</NuxtLink>
							</div>
						</div>
				</nav>

				<div class="p-3 border-t border-border/30 space-y-0.5">
					<button
						v-if="!isAppsMode"
						type="button"
						class="nav-item w-full"
						@click="handleEnterAppsMode"
					>
						<Icon name="lucide:layout-grid" class="w-4 h-4 shrink-0" />
						<span class="text-[13px]">Try Apps Layout</span>
					</button>
					<OrganizationTokenMeter
						v-if="showTokenMeter"
						compact
						class="mb-1"
						@topup="handleTopup"
					/>
					<button class="nav-item w-full" @click="emit('open-ai-tray'); mobileOpen = false">
						<EarnestIcon class="w-4 h-4 shrink-0" />
						<span class="text-[13px]">Earnest</span>
					</button>
					<NuxtLink to="/time-tracker" class="nav-item" :class="{ 'nav-item-active': isActiveItem('/time-tracker') }">
						<Icon name="heroicons:clock" class="w-4 h-4 shrink-0" />
						<span class="text-[13px]">Timer</span>
					</NuxtLink>
					<NuxtLink to="/organization" class="nav-item" :class="{ 'nav-item-active': isActiveItem('/organization') }">
						<Icon name="lucide:building-2" class="w-4 h-4 shrink-0" />
						<span class="text-[13px]">Organization</span>
					</NuxtLink>
				</div>
			</aside>
		</Transition>
	</Teleport>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

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

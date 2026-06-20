<template>
	<div class="relative bg-background text-foreground ios-safe-area">
		<!-- Admin preview banner — when the route carries ?previewAs=<id>,
		     this layout was opened by an admin from the main app's client
		     switcher. Make the mode obvious so they don't think it's their
		     real account, and give them a one-click escape hatch. -->
		<div
			v-if="previewClientName"
			class="fixed top-0 inset-x-0 z-[60] bg-[var(--cyan)]/15 border-b border-[var(--cyan)]/40 text-[12px] py-1.5 px-3 flex items-center justify-center gap-3"
		>
			<Icon name="lucide:eye" class="w-3.5 h-3.5 text-[var(--cyan)]" />
			<span class="text-foreground/80">
				Previewing <strong class="text-foreground">{{ previewClientName }}</strong>'s portal — read-only.
			</span>
			<button
				class="text-[10px] uppercase tracking-wider font-bold text-[var(--cyan)] hover:underline"
				@click="exitPreview"
			>
				Exit preview
			</button>
		</div>

		<div
			class="portal-classic"
			:class="previewClientName ? 'portal-classic--with-preview' : ''"
			:style="accentStyle"
		>
			<!-- ─── Desktop sidebar ─── -->
			<aside
				class="portal-classic__sidebar hidden md:flex"
				:class="sidebarCollapsed ? 'portal-classic__sidebar--collapsed' : ''"
			>
				<!-- Brand block (top) -->
				<div class="portal-classic__brand">
					<NuxtLink to="/portal" class="flex items-center gap-2 group">
						<LogoEarnest size="sm" />
						<span v-if="!sidebarCollapsed" class="text-[11px] font-medium text-muted-foreground">
							Client Portal
						</span>
					</NuxtLink>
				</div>

				<!-- Flat list of all 11 sections -->
				<nav class="portal-classic__nav" :class="sidebarCollapsed ? 'overflow-visible' : 'overflow-y-auto'">
					<NuxtLink
						v-for="item in navItems"
						:key="item.to"
						:to="item.to"
						class="portal-classic__item"
						:class="{
							'portal-classic__item--active': isActiveItem(item.to),
							'justify-center has-tooltip': sidebarCollapsed,
						}"
						:data-tooltip="sidebarCollapsed ? item.name : undefined"
					>
						<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
						<span v-if="!sidebarCollapsed" class="text-[13px]">{{ item.name }}</span>
					</NuxtLink>
				</nav>

				<!-- Footer utilities -->
				<div class="portal-classic__footer">
					<button
						class="portal-classic__item w-full"
						:class="{ 'justify-center has-tooltip': sidebarCollapsed }"
						:data-tooltip="sidebarCollapsed ? 'Try Apps Layout' : undefined"
						@click="switchToApps"
					>
						<Icon name="lucide:layout-grid" class="w-4 h-4 shrink-0" />
						<span v-if="!sidebarCollapsed" class="text-[13px]">Try Apps Layout</span>
					</button>

					<button
						class="portal-classic__item w-full"
						:class="{ 'justify-center has-tooltip': sidebarCollapsed }"
						:data-tooltip="sidebarCollapsed ? 'Sign out' : undefined"
						@click="logout"
					>
						<Icon name="lucide:log-out" class="w-4 h-4 shrink-0" />
						<span v-if="!sidebarCollapsed" class="text-[13px]">Sign out</span>
					</button>

					<button
						class="portal-classic__item w-full mt-1"
						:class="{ 'justify-center has-tooltip': sidebarCollapsed }"
						:data-tooltip="sidebarCollapsed ? 'Expand' : undefined"
						@click="sidebarCollapsed = !sidebarCollapsed"
					>
						<Icon
							:name="sidebarCollapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'"
							class="w-4 h-4 shrink-0"
						/>
						<span v-if="!sidebarCollapsed" class="text-[13px]">Collapse</span>
					</button>
				</div>
			</aside>

			<!-- ─── Mobile drawer ─── -->
			<Teleport to="body">
				<Transition name="drawer-backdrop">
					<div
						v-if="mobileOpen"
						class="fixed inset-0 bg-black/30 z-50 md:hidden"
						@click="mobileOpen = false"
					/>
				</Transition>
				<Transition name="drawer-slide">
					<aside
						v-if="mobileOpen"
						class="fixed inset-y-0 left-0 w-72 bg-background border-r border-border/40 z-50 md:hidden flex flex-col overflow-y-auto"
					>
						<div class="p-3 flex items-center gap-2">
							<LogoEarnest size="sm" />
							<span class="text-[11px] font-medium text-muted-foreground">Client Portal</span>
						</div>
						<nav class="flex-1 px-3 space-y-0.5">
							<NuxtLink
								v-for="item in navItems"
								:key="item.to"
								:to="item.to"
								class="portal-classic__item"
								:class="{ 'portal-classic__item--active': isActiveItem(item.to) }"
							>
								<Icon :name="item.icon" class="w-4 h-4 shrink-0" />
								<span class="text-[13px]">{{ item.name }}</span>
							</NuxtLink>
						</nav>
						<div class="p-3 border-t border-border/30 space-y-0.5">
							<button class="portal-classic__item w-full" @click="switchToApps">
								<Icon name="lucide:layout-grid" class="w-4 h-4 shrink-0" />
								<span class="text-[13px]">Try Apps Layout</span>
							</button>
							<button class="portal-classic__item w-full" @click="logout">
								<Icon name="lucide:log-out" class="w-4 h-4 shrink-0" />
								<span class="text-[13px]">Sign out</span>
							</button>
						</div>
					</aside>
				</Transition>
			</Teleport>

			<!-- ─── Main area ─── -->
			<div class="portal-classic__main">
				<header class="portal-classic__chrome glass">
					<div class="portal-classic__chrome-left">
						<button
							class="md:hidden flex items-center justify-center w-7 h-7 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors"
							@click="mobileOpen = !mobileOpen"
						>
							<Icon :name="mobileOpen ? 'lucide:x' : 'lucide:menu'" class="w-4 h-4" />
						</button>
						<ClientOnly>
							<LayoutPortalClientSelect v-if="user" :user="user" @open-org-switcher="showUpsell = true" />
						</ClientOnly>
					</div>
					<div class="portal-classic__chrome-center">
						<LayoutEarnestBrand to="/portal" tagline="Client Portal" />
					</div>
					<div class="portal-classic__chrome-right">
						<div class="hidden sm:block">
							<WalkthroughHelpMenu />
						</div>
						<ClientOnly>
							<LayoutNotificationsMenu />
						</ClientOnly>
						<ClientOnly>
							<LayoutPortalUserMenu v-if="user" class="shrink-0" />
						</ClientOnly>
					</div>
				</header>

				<main class="portal-classic__page">
					<slot />
				</main>
			</div>
		</div>

		<!-- Slide-over teleport target -->
		<div id="app-slide-over-root" />

		<LayoutPortalUpsellModal v-if="user" v-model="showUpsell" />

		<ClientOnly>
			<WalkthroughManager />
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
const { user } = useDirectusAuth();
const { logout } = useLogout();
const route = useRoute();
const router = useRouter();
const { setMode } = useAppsMode();
const { accentStyle } = usePortalAccent();

const sidebarCollapsed = ref(true);
const mobileOpen = ref(false);
const showUpsell = ref(false);

// Close mobile drawer on route change
watch(() => route.path, () => {
	mobileOpen.value = false;
});

interface NavItem {
	name: string;
	to: string;
	icon: string;
}

// All 11 portal sections, flat. Order roughly groups by category but
// stays a single list — that's the whole point of the classic layout.
// The Social section is social-analytics only, so it's hidden while social
// publishing/analytics are disabled (see useSocialPublishing / nuxt.config).
const { socialPublishingEnabled } = useSocialPublishing();
const navItems = computed<NavItem[]>(() => {
	const items: NavItem[] = [
		{ name: 'Home',      to: '/portal',           icon: 'ph:squares-four-duotone' },
		{ name: 'Projects',  to: '/portal/projects',  icon: 'lucide:gantt-chart' },
		{ name: 'Tasks',     to: '/portal/tasks',     icon: 'heroicons:clipboard-document-check' },
		{ name: 'Tickets',   to: '/portal/tickets',   icon: 'heroicons:queue-list' },
		{ name: 'Invoices',  to: '/portal/invoices',  icon: 'heroicons:document-text' },
		{ name: 'Proposals', to: '/portal/proposals', icon: 'heroicons:document-check' },
		{ name: 'Contracts', to: '/portal/contracts', icon: 'lucide:file-signature' },
		{ name: 'Content',   to: '/portal/content',   icon: 'lucide:eye' },
		{ name: 'Social',    to: '/portal/social',    icon: 'lucide:share-2' },
		{ name: 'Marketing', to: '/portal/marketing', icon: 'lucide:megaphone' },
		{ name: 'Messages',  to: '/portal/messages',  icon: 'ph:chats-circle-duotone' },
		{ name: 'Account',   to: '/portal/account',   icon: 'lucide:circle-user-round' },
	];
	return socialPublishingEnabled.value ? items : items.filter((i) => i.to !== '/portal/social');
});

function isActiveItem(to: string): boolean {
	if (to === '/portal') return route.path === '/portal' || route.path === '/portal/';
	return route.path === to || route.path.startsWith(to + '/');
}

async function switchToApps() {
	void setMode('apps').catch(() => {});
	// Stay on the same portal page — the middleware will pick up the
	// new mode on next nav and the apps shell will render in place.
	await router.replace(route.fullPath);
}

// ── Admin preview mode ────────────────────────────────────────────────
const previewClientId = computed(() => {
	const q = route.query?.previewAs;
	return typeof q === 'string' && q ? q : null;
});

const previewClientName = ref<string | null>(null);

async function loadPreviewClientName() {
	if (!previewClientId.value) {
		previewClientName.value = null;
		return;
	}
	try {
		const scope = await $fetch<{ root: { id: string; name: string } | null }>(
			`/api/portal/scope?previewAs=${encodeURIComponent(previewClientId.value)}`,
		);
		previewClientName.value = scope?.root?.name ?? null;
	} catch {
		previewClientName.value = null;
	}
}

watch(previewClientId, loadPreviewClientName, { immediate: true });

function exitPreview() {
	if (import.meta.client) {
		document.cookie = 'portal_preview_as=; path=/; max-age=0; samesite=lax';
	}
	router.push('/clients');
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.portal-classic {
	@apply h-screen min-h-screen w-full flex;
}

.portal-classic--with-preview {
	padding-top: 30px;
	height: calc(100vh - 30px);
	min-height: calc(100vh - 30px);
}

/* ── Sidebar ──────────────────────────────────────────────────────── */
.portal-classic__sidebar {
	@apply flex-col border-r border-border/40 bg-sidebar shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] relative z-50;
	width: 15rem;
}

.portal-classic__sidebar--collapsed {
	width: 3.5rem;
	overflow: visible;
}

.portal-classic__sidebar:not(.portal-classic__sidebar--collapsed) {
	overflow: hidden;
}

.portal-classic__brand {
	@apply p-3 shrink-0;
}

.portal-classic__nav {
	@apply flex-1 px-3 space-y-0.5 pt-1;
}

.portal-classic__footer {
	@apply p-3 border-t border-border/30 space-y-0.5 shrink-0;
}

/* ── Main column ──────────────────────────────────────────────────── */
.portal-classic__main {
	@apply flex-1 flex flex-col min-w-0 min-h-0;
}

.portal-classic__chrome {
	@apply grid items-center border-b border-border/40 px-3 sm:px-4 lg:px-6 shrink-0 z-40;
	grid-template-columns: 1fr auto 1fr;
	min-height: 56px;
}

.portal-classic__chrome-left {
	@apply flex items-center gap-2 min-w-0 justify-self-start;
}

.portal-classic__chrome-center {
	@apply flex items-center justify-center;
}

.portal-classic__chrome-right {
	@apply flex items-center gap-1.5 justify-self-end;
}

.portal-classic__page {
	@apply flex-1 overflow-auto min-h-0;
}

/* ── Nav items ────────────────────────────────────────────────────── */
.portal-classic__item {
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

.portal-classic__item:hover {
	background: hsl(var(--muted) / 0.5);
	color: hsl(var(--foreground));
}

.portal-classic__item--active {
	background: hsl(var(--primary) / 0.08);
	color: hsl(var(--foreground));
	font-weight: 500;
}

/* ── CSS tooltips for collapsed sidebar ───────────────────────────── */
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

/* ── Drawer transitions ───────────────────────────────────────────── */
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

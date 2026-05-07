<template>
	<div class="relative bg-background text-foreground transition duration-150 lg:overflow-visible ios-safe-area">
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

		<LayoutPortalHeader />

		<div class="page pb-safe-portal pt-portal-header" :class="previewClientName ? 'pt-portal-header-preview' : ''">
			<slot />
		</div>

		<!-- Mobile toolbar — primary links only (hidden on lg+ where sidebar takes over) -->
		<nav class="portal-toolbar lg:hidden">
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
			<div v-if="showMore" class="fixed inset-0 z-50 lg:hidden flex flex-col justify-end" @click.self="showMore = false">
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

		<!-- Desktop sidebar nav (visible on lg+) -->
		<aside class="hidden lg:flex portal-sidebar">
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
const { user } = useDirectusAuth();
const route = useRoute();
const router = useRouter();
const { clientName: portalClientName } = useClientPortalUser();

const showMore = ref(false);

// Admin preview-mode state. When an admin clicks "Preview <client> portal" in
// the main-app client switcher we land on /portal?previewAs=<id> and a cookie
// has been set; the portal API routes already pick up the cookie. The layout
// just needs to label the mode and offer an exit.
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
	// Send the admin back to where they likely came from.
	router.push('/clients');
}

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

const clientName = computed(() => portalClientName.value);

function isActiveRoute(path: string): boolean {
	if (path === '/portal') {
		return route.path === '/portal' || route.path === '/portal/';
	}
	return route.path.startsWith(path);
}

onMounted(() => {
	if (import.meta.client) loadAvailability();
});

watch(() => user.value?.id, (id) => {
	if (id) loadAvailability();
});
</script>

<style>
@reference "~/assets/css/tailwind.css";

/* Mobile toolbar — only rendered <lg via Tailwind `lg:hidden`. The
   display:flex sits inside a max-width media query so it doesn't override
   the lg:hidden display:none on wider screens. */
@media (max-width: 1023.98px) {
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

/* When the admin preview banner is visible, push the page another ~30px so
   the header isn't obscured. */
.pt-portal-header-preview {
	padding-top: 122px;
}

/* Page content offset for sidebar (sidebar is lg+ only) */
@media (min-width: 1024px) {
	.page.pb-safe-portal {
		margin-left: 200px;
		padding-bottom: 0;
	}
}
@media (max-width: 1023px) {
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

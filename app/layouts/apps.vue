<template>
	<div class="relative bg-background text-foreground transition duration-150 ios-safe-area">
		<ClientOnly>
			<LayoutArchivedOrgBanner />
		</ClientOnly>

		<div
			class="apps-shell apps-shell--floating-rail"
			:class="[
				`apps-shell--rail-${railPosition}`,
				{
					'apps-shell--has-sidebar': desktopSidebar,
					'apps-shell--sidebar-collapsed': desktopSidebar && sidebarCollapsed,
				},
			]"
			:data-desktop-sidebar="desktopSidebar ? 'on' : 'off'"
			:style="accentStyle"
		>
			<!-- Opt-in desktop navigation sidebar. Rendered only when the
			     preference is on; a CSS @media (min-width:1280px) gate owns the
			     actual show/hide + content offset (and hides the bottom dock),
			     so there's no JS-driven hydration flash. Client-only for parity
			     with the AppRail: the active palette is client-only knowledge and
			     the channel-unread badge fetches client-side. -->
			<ClientOnly>
				<LayoutAppSidebar v-if="desktopSidebar" class="apps-shell__sidebar" />
			</ClientOnly>

			<div class="apps-shell__main">
				<header class="apps-shell__chrome glass">
					<div class="apps-shell__chrome-left">
						<!-- Org switcher only. The global client filter + Mine/All lens were
						     removed from the chrome (they were consumed inconsistently across
						     widgets): client-scoped work lives on the client detail page, and
						     Mine/All is now a local control on the dashboard's Priority Actions.
						     See docs/dashboard-filters-localization-poc.md. -->
						<ClientOnly>
							<LayoutClientSelect v-if="user" :user="user" @open-org-switcher="showOrgSwitcher = true" />
							<!-- Opt-in per-org local weather (Organization → Overview toggle). -->
							<LayoutWeatherWidget v-if="user" />
						</ClientOnly>
					</div>
					<div class="apps-shell__chrome-center">
						<!-- The logo is just the wordmark now (links home). Earnest has a
						     single launcher — the presence dot on the right — so the logo no
						     longer opens the assistant. -->
						<LayoutEarnestBrand to="/" tagline="Do good work." />
					</div>
					<div class="apps-shell__chrome-right">
						<!-- THE single launcher for Earnest — the "E." mark, so it
						     unmistakably reads as Earnest (not a generic aperture). Tap to
						     open Focus; reachable from every page. The HITL pending-actions
						     badge rides here. -->
						<button
							type="button"
							class="apps-shell__chrome-btn group relative shrink-0 ios-press"
							aria-label="Open Earnest"
							title="Earnest"
							@click="handleOpenAI"
						>
							<EarnestIcon class="w-[18px] h-[18px] text-foreground/80 group-hover:text-foreground transition-colors" />
							<span
								v-if="aiPendingCount > 0"
								class="apps-shell__brand-badge"
								:aria-label="`${aiPendingCount} action${aiPendingCount === 1 ? '' : 's'} awaiting approval`"
							>
								{{ aiPendingCount > 9 ? '9+' : aiPendingCount }}
							</span>
						</button>
						<!-- Search is desktop-chrome only; below sm it moves into the
						     user-menu dropdown. Wrapper carries the responsive hide so
						     the utility isn't out-specified by the scoped button rule. -->
						<div class="hidden sm:flex">
							<button
								class="apps-shell__chrome-btn"
								aria-label="Search"
								@click="spotlightOpen = true"
							>
								<Icon name="lucide:search" class="size-5" />
							</button>
						</div>
						<ClientOnly>
							<LayoutNotificationsMenu />
						</ClientOnly>
						<ClientOnly>
							<div class="hidden sm:flex">
								<LayoutHeaderScore />
							</div>
						</ClientOnly>
						<ClientOnly>
							<LayoutUserMenu v-if="user" class="shrink-0" />
						</ClientOnly>
					</div>
				</header>

				<main
					class="apps-shell__page"
					:class="{
						'apps-shell__page--rail-top': railPosition === 'top',
						'apps-shell__page--rail-bottom': railPosition === 'bottom',
						'apps-shell__page--rail-left': railPosition === 'left',
						'apps-shell__page--rail-right': railPosition === 'right',
					}"
				>
					<slot />
				</main>
			</div>

			<!-- Rail always renders as a single floating pill — left/right
			     hug the side edges (vertical), top/bottom hug those edges
			     (horizontal). Position-driven styling lives on the rail itself.

			     Client-only on purpose: the active palette is client-only
			     knowledge (the `/users/me` palette lookup is unauthenticated
			     during SSR), so server-rendering the rail necessarily guesses
			     the default palette. Hydrating that guess left the adopted DOM
			     stuck on the default after the real palette resolved async —
			     Neutral/Glass users saw gradient chips whose same-hue glyphs
			     vanished into them. Rendering on the client skips hydration and
			     lets normal reactivity paint the resolved palette. -->
			<ClientOnly>
				<AppRail :key="`rail-${railPosition}`" class="apps-shell__rail" />
			</ClientOnly>
		</div>

		<!-- Universal slide-over stack — one mount-point, looks up each
		     panel from `components/apps/panels/registry.ts` and renders
		     them with iOS push/pop visuals. Pages no longer render their
		     own AppSlideOver markup; they just call
		     `useAppSlideOver(type).open(id)` from row-click handlers. -->
		<ClientOnly>
			<AppsAppSlideOverStack />
		</ClientOnly>

		<!-- The docked Earnest panel is retired — Earnest is inline or Focus
		     (mounted once in app.vue as EarnestCoachingTakeover). -->

		<ClientOnly>
			<TimeTrackerModal v-model="timeTrackerModalVisible" />
		</ClientOnly>
		<ClientOnly>
			<OrganizationTokenManagementModal v-model="tokenModalVisible" />
		</ClientOnly>
		<ClientOnly>
			<TimeTrackerFloatingIndicator class="md:hidden" />
		</ClientOnly>
		<ClientOnly>
			<LayoutFloatingDock />
		</ClientOnly>
		<ClientOnly>
			<LayoutSpotlightSearch :open="spotlightOpen" @close="spotlightOpen = false" />
		</ClientOnly>

		<ClientOnly>
			<WalkthroughManager />
		</ClientOnly>

		<!-- Arcade reward overlay — floating +EP pops, combo meter, badge
		     toasts, and the level-up takeover. One mount-point; any part of
		     the app fires rewards via useArcade().reward(). -->
		<ClientOnly>
			<ArcadeRewardLayer />
		</ClientOnly>

		<!-- Earnest reacts globally: the logo mark pops in near the +EP coin on a
		     completion, plays the gesture, and fades. Self-gated + client-only. -->
		<ClientOnly>
			<EarnestMascotReactionLayer />
		</ClientOnly>

		<LayoutOrgSwitcher v-model="showOrgSwitcher" />
	</div>
</template>

<script setup lang="ts">
import { timeTrackerModalOpen } from '~/composables/useTimeTrackerModal';
import { tokenModalOpen } from '~/composables/useTokenModal';
import { openEarnestPanel } from '~/composables/useEarnestPanel';
import { spotlightOpen, toggleSpotlight } from '~/composables/useSpotlight';

const { user } = useDirectusAuth();
const { railPosition, desktopSidebar, sidebarCollapsed } = useAppsMode();
const { accentStyle } = useAppAccent();

// Reconcile the global slide-over stack from `?slide=` on every route change.
// Pages opt in via `useAppSlideOver(type)`; this sync makes deep links + back/
// forward / swipe-back drive the same state.
useAppSlideOverStackUrlSync();

// The unified Earnest panel self-derives entity vs route context. Opens at the
// docked size; the user expands to full-screen focus from inside Earnest.
const handleOpenAI = () => openEarnestPanel();

// Pending AI actions (HITL queue) badge on the assistant launcher.
const { pendingCount: aiPendingCount, refresh: refreshAiPending } = useAiPendingActions();
onMounted(() => { refreshAiPending(); });

// One batched login-time fetch for the chrome scalars (channel unread + AI
// pending count) — seeds their shared singletons so the rail/launcher widgets
// coalesce onto this single request instead of each fanning out on login. Runs
// once the org resolves; widgets fall back to their own fetch if it's absent.
const { load: loadBootstrap } = useBootstrap();
const { selectedOrg: bootstrapOrg } = useOrganization();
watch(bootstrapOrg, (o) => { if (o) loadBootstrap(); }, { immediate: true });

const showOrgSwitcher = ref(false);
const timeTrackerModalVisible = timeTrackerModalOpen;
const tokenModalVisible = tokenModalOpen;

if (import.meta.client) {
	onMounted(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				toggleSpotlight();
			}
		};
		window.addEventListener('keydown', handler);
		onBeforeUnmount(() => window.removeEventListener('keydown', handler));
	});
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.apps-shell {
	@apply h-screen min-h-screen w-full flex flex-col;
}

.apps-shell__main {
	@apply flex-1 flex flex-col min-w-0 min-h-0;
	position: relative;
}

/* Page ambient gradient — a fixed-position accent-tinted radial fade at
 * the top of the viewport that bridges the AppHeader's glass into the
 * page body, so the surfaces read as one continuous material instead of
 * two separately-floating slabs. Sits behind page content (z-0) and is
 * pointer-events:none so it never intercepts clicks. The accent vars
 * are bound on the shell wrapper via :style="accentStyle" — switching
 * apps re-tints the wash automatically. */
.apps-shell__main::before {
	content: '';
	position: fixed;
	top: 56px;
	left: 0;
	right: 0;
	height: 360px;
	pointer-events: none;
	z-index: 0;
	background:
		radial-gradient(
			ellipse 70% 100% at 50% -10%,
			hsl(var(--app-accent-h, 220) 65% 60% / 0.08) 0%,
			hsl(var(--app-accent-h, 220) 55% 55% / 0.04) 35%,
			transparent 70%
		),
		radial-gradient(
			ellipse 50% 80% at 90% 0%,
			hsl(calc(var(--app-accent-h, 220) + 30) 60% 55% / 0.05) 0%,
			transparent 60%
		);
	mask-image: linear-gradient(180deg, black 0%, black 60%, transparent 100%);
	-webkit-mask-image: linear-gradient(180deg, black 0%, black 60%, transparent 100%);
}
.dark .apps-shell__main::before {
	background:
		radial-gradient(
			ellipse 70% 100% at 50% -10%,
			hsl(var(--app-accent-h, 220) 65% 50% / 0.10) 0%,
			hsl(var(--app-accent-h, 220) 55% 45% / 0.05) 35%,
			transparent 70%
		),
		radial-gradient(
			ellipse 50% 80% at 90% 0%,
			hsl(calc(var(--app-accent-h, 220) + 30) 60% 50% / 0.07) 0%,
			transparent 60%
		);
}
@media (prefers-reduced-transparency: reduce) {
	.apps-shell__main::before { display: none; }
}

/* Lift page content above the ambient wash. The chrome already has its
 * own z-40, so this only affects body content. */
.apps-shell__page {
	position: relative;
	z-index: 1;
}

.apps-shell__chrome {
	@apply grid items-center border-b border-border/40 px-3 sm:px-4 lg:px-6 shrink-0 z-40;
	grid-template-columns: 1fr auto 1fr;
	min-height: 56px;
}

.apps-shell__chrome-left {
	@apply flex items-center gap-2 min-w-0 justify-self-start;
}

.apps-shell__chrome-center {
	@apply flex items-center justify-center;
}

/* HITL pending-actions badge — now rides the presence-dot launcher (top-right
 * of the dot), so it stays absolutely positioned within that relative button. */
.apps-shell__brand-badge {
	@apply absolute -top-1 -right-1 inline-flex items-center justify-center
		min-w-[15px] h-[15px] px-1 rounded-full bg-warning text-[9px]
		font-semibold text-warning-foreground tabular-nums leading-none;
}

.apps-shell__chrome-right {
	/* One uniform gap for the whole cluster — no per-item margins, so the
	 * Earnest mark, search, bell, score, and avatar sit on an even rhythm. */
	@apply flex items-center gap-2 justify-self-end;
}

.apps-shell__chrome-btn {
	/* 28px circle with a very subtle liquid-glass fill + refracted rim — shared
	 * by the Earnest mark, search, and bell so the three icon buttons read as one
	 * uniform set of circles (matching the score + avatar height). */
	@apply flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground transition-all;
	background: hsl(var(--muted) / 0.35);
	box-shadow: var(--glass-edge-shadow);
}
.apps-shell__chrome-btn:hover {
	background: hsl(var(--muted) / 0.6);
	color: hsl(var(--foreground));
}

.apps-shell__page {
	@apply flex-1 overflow-auto min-h-0;
}

/* The rail floats as a glass pill over the page regardless of side. Pad
 * the scroll area on the rail's edge so content never slides under it.
 * Top + bottom keep their original padding; left + right add horizontal
 * room for the vertical pill (chip width + breathing gap). */
.apps-shell__page--rail-top {
	@apply pt-16 sm:pt-20;
}

.apps-shell__page--rail-bottom {
	@apply pb-16 sm:pb-20;
}

.apps-shell__page--rail-left {
	@apply pl-16 sm:pl-20;
}

.apps-shell__page--rail-right {
	@apply pr-16 sm:pr-20;
}

/* ── Opt-in desktop navigation sidebar ───────────────────────────────
 * When the `desktopSidebar` preference is on AND the viewport is xl+
 * (1280px), the fixed AppSidebar becomes the app-nav surface: offset the
 * shell content by the sidebar width and hide the bottom AppRail dock. The
 * media query owns the size gate (not JS) so SSR/hydration never flash — the
 * `--has-sidebar` class is set from a cookie-backed pref that agrees on both
 * server and client, and this rule simply no-ops below xl.
 *
 * The utility FloatingDock is untouched — only the app-switcher rail hides. */
.apps-shell {
	transition: padding-left 220ms cubic-bezier(0.36, 0.66, 0.04, 1);
}

@media (min-width: 1280px) {
	.apps-shell--has-sidebar {
		padding-left: 208px;
	}
	.apps-shell--has-sidebar.apps-shell--sidebar-collapsed {
		padding-left: 72px;
	}
	/* Sidebar replaces the bottom app dock. Target the AppRail's own `.app-rail`
	 * root via `:deep()`: the `apps-shell__rail` class passed to <AppRail> is
	 * swallowed by reka's <TooltipProvider> root (fallthrough attrs aren't
	 * forwarded), and the scoped attribute doesn't land on a child component's
	 * root either — so `:deep(.app-rail)` is the reliable hook. */
	.apps-shell--has-sidebar :deep(.app-rail) {
		display: none;
	}
}
</style>

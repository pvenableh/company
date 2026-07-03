<template>
	<div class="relative bg-background text-foreground transition duration-150 ios-safe-area">
		<ClientOnly>
			<LayoutArchivedOrgBanner />
		</ClientOnly>

		<div
			class="apps-shell apps-shell--floating-rail"
			:class="`apps-shell--rail-${railPosition}`"
			:style="accentStyle"
		>
			<div class="apps-shell__main">
				<header class="apps-shell__chrome glass">
					<div class="apps-shell__chrome-left">
						<ClientOnly>
							<LayoutClientSelect v-if="user" :user="user" @open-org-switcher="showOrgSwitcher = true" />
						</ClientOnly>
						<ClientOnly>
							<!-- Mine/All lens is a desktop-chrome affordance; on phones
							     it crowds the row, so hide it below sm. -->
							<div v-if="user" class="hidden sm:flex items-center">
								<LayoutDataScopeSelect />
							</div>
						</ClientOnly>
					</div>
					<div class="apps-shell__chrome-center">
						<!-- The logo opens the Earnest assistant panel (home is the
						     dock's Dashboard app). The HITL pending-actions badge that
						     used to sit on the separate assistant button lives here now. -->
						<button
							type="button"
							class="apps-shell__brand-btn"
							aria-label="Open Earnest assistant"
							@click="handleOpenAI"
						>
							<LayoutEarnestBrand tagline="Do good work." />
							<span
								v-if="aiPendingCount > 0"
								class="apps-shell__brand-badge"
								:aria-label="`${aiPendingCount} action${aiPendingCount === 1 ? '' : 's'} awaiting approval`"
							>
								{{ aiPendingCount > 9 ? '9+' : aiPendingCount }}
							</span>
						</button>
					</div>
					<div class="apps-shell__chrome-right">
						<!-- Search is desktop-chrome only; below sm it moves into the
						     user-menu dropdown. Wrapper carries the responsive hide so
						     the utility isn't out-specified by the scoped button rule. -->
						<div class="hidden sm:flex">
							<button
								class="apps-shell__chrome-btn"
								aria-label="Search"
								@click="spotlightOpen = true"
							>
								<Icon name="lucide:search" class="size-4" />
							</button>
						</div>
						<ClientOnly>
							<LayoutNotificationsMenu />
						</ClientOnly>
						<ClientOnly>
							<div class="hidden sm:flex ml-2">
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

		<!-- Unified Earnest panel (route + entity aware; self-managed open state) -->
		<ClientOnly>
			<AIEarnestPanel />
		</ClientOnly>
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
			<LayoutFloatingDock @open-ai="handleOpenAI" />
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
const { railPosition } = useAppsMode();
const { accentStyle } = useAppAccent();

// Reconcile the global slide-over stack from `?slide=` on every route change.
// Pages opt in via `useAppSlideOver(type)`; this sync makes deep links + back/
// forward / swipe-back drive the same state.
useAppSlideOverStackUrlSync();

// The unified Earnest panel self-derives entity vs route context.
const handleOpenAI = () => openEarnestPanel();

// Pending AI actions (HITL queue) badge on the assistant launcher.
const { pendingCount: aiPendingCount, refresh: refreshAiPending } = useAiPendingActions();
onMounted(() => { refreshAiPending(); });

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

/* The brand acts as the Earnest-assistant launcher. Keep it a bare, tappable
 * wrapper around the logo so the mark itself reads as the affordance. */
.apps-shell__brand-btn {
	@apply relative inline-flex items-center justify-center rounded-xl px-1.5 py-0.5
		transition-transform hover:bg-muted/30 active:scale-95;
}

.apps-shell__brand-badge {
	@apply absolute top-0 right-0 inline-flex items-center justify-center
		min-w-[15px] h-[15px] px-1 rounded-full bg-warning text-[9px]
		font-semibold text-warning-foreground tabular-nums leading-none;
}

.apps-shell__chrome-right {
	@apply flex items-center gap-1.5 justify-self-end;
}

.apps-shell__chrome-btn {
	/* Sized to 28px (w-7) so it matches the notification bell, score gauge,
	 * and avatar — a uniform diameter keeps the chrome cluster evenly
	 * spaced. Pairs with the universal :active scale for tactile feedback. */
	@apply flex items-center justify-center w-7 h-7 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors;
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
</style>

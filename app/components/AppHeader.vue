<script setup lang="ts">
import type { AppIntroId } from '~/composables/useAppIntros';

/**
 * AppHeader — per-app top strip.
 *
 * Slots:
 *   default → page/section title
 *   actions → right-side controls (e.g. "+ New", filters)
 *
 * Pass `:show-back="true"` on detail/sub-pages to render an iOS-style
 * back chevron + previous-screen-name. Landing pages (e.g.
 * /apps/clients/index.vue) leave it off so the rail itself is the
 * top-level way-finding.
 *
 * The back behaviour is intentionally generic — Phase 1 just calls
 * `router.back()`. Phase 2+ apps may want app-scoped history (e.g. an
 * in-app stack); revisit then.
 */

const router = useRouter();
const route = useRoute();
// `useCurrentAccent` dispatches between `useAppAccent` (for /apps/*)
// and `usePortalAccent` (for /portal/*) so this header looks/feels
// identical in both shells without duplicating the component.
const { accent } = useCurrentAccent();

const props = withDefaults(
	defineProps<{
		title?: string;
		backLabel?: string;
		/**
		 * Show the iOS-style back chevron. Landing pages omit it.
		 */
		showBack?: boolean;
		/**
		 * Explicit parent route. When provided, the back button navigates here
		 * directly instead of `router.back()` — important for deep-linked or
		 * bookmarked detail pages where browser history would exit the app
		 * entirely. Omit for plain "go to previous screen" behaviour.
		 */
		backTo?: string;
		/**
		 * When set on a top-level /apps/<id>/index page, this header renders
		 * the always-visible tagline + an info button that toggles the
		 * AppIntroCard (which renders below the floor strip in the page
		 * body). The card is hidden by default — opt-in reference material.
		 */
		appId?: AppIntroId;
	}>(),
	{
		showBack: false,
	},
);

// Intro hooks are scoped to landing pages that pass `:app-id`. Static
// access is fine — the composable is idempotent and the registry lookup
// is cheap.
const { isOpen, toggle, getContent } = useAppIntros();
const introContent = computed(() => (props.appId ? getContent(props.appId) : null));
const introOpen = computed(() => (props.appId ? isOpen(props.appId) : false));

function handleToggleIntro() {
	if (props.appId) toggle(props.appId);
}

function goBack() {
	// If an explicit parent was provided, use it. Otherwise prefer history
	// (preserves scroll + active tab), but fall back to the rail-derived
	// app root so a deep-link / refresh / bookmark doesn't exit the SPA.
	if (props.backTo) {
		router.push(props.backTo);
		return;
	}
	if (import.meta.client && window.history.length > 1) {
		router.back();
		return;
	}
	const seg = route.path.split('/').filter(Boolean);
	if ((seg[0] === 'apps' || seg[0] === 'portal') && seg[1]) {
		router.push(`/${seg[0]}/${seg[1]}`);
		return;
	}
	router.push('/');
}

// Whether an app accent is active. On non-app / default-mode pages `accent`
// is null → the header renders its neutral "plain" variant (foreground title,
// neutral border). The accent *colour* is read from the inherited
// `--app-accent-*` vars (set by the shell's `accentStyle`), NOT from a local
// copy of `accent.value`'s HSL: the shell reference-binds those to the
// reliable html-level `--app-{id}-*` vars, so the header tracks the live
// palette instead of going stale after SSR hydration.
const isAccented = computed(() => !!accent.value);

const fallbackBackLabel = computed(() => {
	if (accent.value) return accent.value.name;
	const seg = route.path.split('/').filter(Boolean);
	// Recognise both /apps/<id> and /portal/<id> as "<Id>".
	if ((seg[0] === 'apps' || seg[0] === 'portal') && seg.length >= 2) {
		const appId = seg[1];
		return appId ? appId.charAt(0).toUpperCase() + appId.slice(1) : 'Back';
	}
	return 'Back';
});
</script>

<template>
	<header class="app-header" :class="{ 'app-header--accented': isAccented }">
		<div class="app-header__inner">
			<!-- Back row — sits on its own line above the title so the back
			     affordance is always discoverable without competing with the
			     title or right-side actions. Only rendered on sub-pages. -->
			<button
				v-if="showBack"
				type="button"
				class="app-header__back app-header__back--row"
				@click="goBack"
			>
				<Icon name="lucide:chevron-left" class="size-4" />
				<span>{{ backLabel ?? fallbackBackLabel }}</span>
			</button>

			<div class="app-header__row">
				<div class="app-header__left">
					<span
						v-if="accent && !showBack"
						class="app-header__accent-icon"
						aria-hidden="true"
					>
						<span class="app-header__accent-glyph">
							<Icon :name="accent.icon" class="app-header__accent-layer app-header__accent-base" />
							<span class="app-header__accent-layer app-header__accent-highlight-mask">
								<Icon :name="accent.icon" class="app-header__accent-highlight" />
							</span>
						</span>
					</span>
					<h1 v-if="title || $slots.default" class="app-header__title">
						<slot>{{ title }}</slot>
					</h1>
					<button
						v-if="appId"
						type="button"
						class="app-header__intro-reopen"
						:class="{ 'app-header__intro-reopen--active': introOpen }"
						:aria-label="introOpen ? 'Hide intro' : 'What is this app?'"
						:aria-expanded="introOpen"
						:title="introOpen ? 'Hide intro' : 'What is this app?'"
						@click="handleToggleIntro"
					>
						<Icon name="lucide:info" class="w-3.5 h-3.5" />
					</button>
				</div>
				<div v-if="$slots.actions" class="app-header__actions">
					<slot name="actions" />
				</div>
			</div>
			<!-- Tagline is part of the intro experience — only surfaces once
			     the user has clicked the info button. Same toggle that
			     reveals the AppIntroCard below the header. -->
			<p v-if="introContent && introOpen" class="app-header__tagline">{{ introContent.tagline }}</p>
		</div>
	</header>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* Border-only header (no background fill): the title sits directly on the
 * page surface — an iOS large-title feel — with only a hairline bottom
 * border + the river-flow shimmer carrying the app's accent. The inner
 * container is constrained + padded to the same max-w/p- as
 * LayoutPageContainer so the title aligns with the page content below it.
 *
 * Two variants, driven by `.app-header--accented`:
 *   • accented (any /apps/* or /portal/* page) → border + title tint in
 *     the active app's accent hue (via the inherited --app-accent-* vars the
 *     shell binds from the active palette).
 *   • plain (default-mode pages, Account, anything with no app accent) →
 *     neutral border + foreground title. */
.app-header {
	@apply relative shrink-0 z-30;
	background: transparent;
	border-bottom: 1px solid hsl(var(--border));
}
.app-header--accented {
	border-bottom-color: hsl(var(--app-accent-h, 220) var(--app-accent-s, 50%) 55% / 0.28);
}
.dark .app-header--accented {
	border-bottom-color: hsl(var(--app-accent-h, 220) var(--app-accent-s, 50%) 60% / 0.30);
}

/* River-flow accent shimmer — a faint highlight pass that traces the bottom
 * edge of the header every 7s. Reads as a quiet "current" tying the chrome
 * into the river language without distracting from page content. Only the
 * accented variant carries it (plain pages keep a clean static border). */
.app-header--accented::after {
	content: '';
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 1px;
	pointer-events: none;
	background: linear-gradient(
		90deg,
		transparent 0%,
		hsl(var(--app-accent-h, 220) 80% 65% / 0) 20%,
		hsl(var(--app-accent-h, 220) 90% 70% / 0.65) 50%,
		hsl(var(--app-accent-h, 220) 80% 65% / 0) 80%,
		transparent 100%
	);
	background-size: 220% 100%;
	background-position: 100% 0;
	opacity: 0.6;
	animation: appHeaderShimmer 7s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
@keyframes appHeaderShimmer {
	0%   { background-position: 100% 0; }
	100% { background-position: -120% 0; }
}
@media (prefers-reduced-motion: reduce) {
	.app-header--accented::after { animation: none; opacity: 0.35; background-position: 50% 0; }
}

.app-header__inner {
	@apply flex flex-col gap-1.5
		max-w-7xl mx-auto w-full
		px-4 md:px-6 pt-5 pb-4;
}

/* Reserve a constant title-row height so pages WITHOUT action buttons
 * (e.g. Dashboard) render at the same height as pages with them — no more
 * vertical "jump" when navigating between them. 2.25rem ≈ the tallest
 * pill button (h-9). */
.app-header__row {
	@apply flex items-center justify-between gap-3;
	min-height: 2.25rem;
}

.app-header__tagline {
	@apply text-xs text-muted-foreground pl-8;
}

.app-header__intro-reopen {
	@apply inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors;
}

.app-header__intro-reopen--active {
	@apply text-foreground bg-muted/50;
}

.app-header__left {
	@apply flex items-center gap-2 min-w-0;
}

.app-header__back {
	@apply flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors -ml-1 px-1.5 py-1 rounded-md hover:bg-muted/40;
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
}

/* When the back chevron sits on its own row above the title, hug the
 * left edge and pin the next row tight (negative margin neutralises the
 * parent `gap-1.5`). Pulling the title row up keeps the back affordance
 * visually anchored to the title without competing for space. */
.app-header__back--row {
	@apply self-start py-0 -mb-1;
}

/* Small app-accent chip echoing the rail's gradient tile — same hue
 * ramp (lighter top → base → shaded bottom), full circle, and inset
 * highlight. Reads as a smaller member of the rail family. */
.app-header__accent-icon {
	@apply inline-flex items-center justify-center shrink-0;
	position: relative;
	width: 24px;
	height: 24px;
	border-radius: 50%;
	background: linear-gradient(
		160deg,
		hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) calc(var(--app-accent-l, 48%) + 12%)) 0%,
		hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%)) 55%,
		hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) calc(var(--app-accent-l, 48%) - 8%)) 100%
	);
	box-shadow:
		inset 0 0.5px 0 hsl(0 0% 100% / 0.28),
		inset 0 -0.5px 0 hsl(0 0% 0% / 0.08),
		0 1px 2px hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%) / 0.25);
}

/* Sheen overlay disabled — kept inert so the rule can be flipped back
 * by setting `content: ''`. */
.app-header__accent-icon::after {
	display: none;
}

/* Dual-layer icon glyph — base (deep) on top, highlight (bright) below
 * via the masked highlight layer. Same composite as the rail chip,
 * scaled down. */
.app-header__accent-glyph {
	position: relative;
	display: inline-block;
	width: 14px;
	height: 14px;
	z-index: 2;
	filter: drop-shadow(0 0.5px 1px rgba(0, 0, 0, 0.28));
}

.app-header__accent-layer {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
}

.app-header__accent-base {
	/* Per-app glyph colour, mirrored from the rail's `--rail-icon`. */
	color: var(--app-accent-icon, hsl(0 0% 100%));
	z-index: 0;
}

.app-header__accent-layer.app-header__accent-highlight-mask {
	display: none;
}

/* ── Neutral / Glass chip mode ─────────────────────────────────── */
/* Swap the per-app gradient for a frosted-glass disc whenever the
 * Neutral palette is active (forces `data-chip-mode='neutral'` on
 * `<html>`) or the Glass toggle is on (`data-surface='glass'`). The
 * chromatic icon (set via `--app-accent-icon` from useAppAccent's
 * glass-aware `accents` computed) sings against the frost, matching
 * the rail's liquid-glass look. Drop the icon's cast shadow in this
 * mode — the disc's border + inner highlight already carry depth.
 *
 * `html[…]` prefix lifts specificity above the scoped attribute
 * selector so these rules beat the default gradient styling. */
html[data-chip-mode='neutral'] .app-header__accent-icon,
html[data-surface='glass'] .app-header__accent-icon {
	background: hsl(0 0% 100% / 0.42);
	backdrop-filter: blur(10px) saturate(1.2);
	-webkit-backdrop-filter: blur(10px) saturate(1.2);
	border: 1px solid hsl(0 0% 100% / 0.7);
	box-shadow:
		inset 0 0.5px 0 hsl(0 0% 100% / 0.85),
		inset 0 -0.5px 0 hsl(0 0% 0% / 0.04),
		0 1px 3px hsl(0 0% 0% / 0.06);
}

html[data-chip-mode='neutral'] .app-header__accent-glyph,
html[data-surface='glass'] .app-header__accent-glyph {
	filter: none;
}

html.dark[data-chip-mode='neutral'] .app-header__accent-icon,
html.dark[data-surface='glass'] .app-header__accent-icon {
	background: hsl(0 0% 100% / 0.1);
	border-color: hsl(0 0% 100% / 0.22);
}

/* Dark + neutral / glass: the per-app icon colour (`--app-accent-icon`)
 * was chosen for the pastel "would-be" gradient and reads as a muddy dark
 * glyph on a dark frosted disc. Force a near-white tone so the header
 * accent reads as confidently as it does in light mode. */
html.dark[data-chip-mode='neutral'] .app-header__accent-base,
html.dark[data-surface='glass'] .app-header__accent-base {
	color: hsl(0 0% 96%);
}

.app-header__title {
	@apply text-base font-semibold truncate;
	color: hsl(var(--foreground));
}

/* Accented variant: tint the title in the active app's accent hue. Darken
 * a touch in light mode and lighten generously in dark mode so the colour
 * stays legible against the page surface across every palette. */
.app-header--accented .app-header__title {
	color: hsl(var(--app-accent-h, 220) var(--app-accent-s, 55%) calc(var(--app-accent-l, 48%) - 10%));
}
.dark .app-header--accented .app-header__title {
	color: hsl(var(--app-accent-h, 220) var(--app-accent-s, 55%) calc(var(--app-accent-l, 48%) + 30%));
}

.app-header__actions {
	@apply flex items-center gap-1.5 shrink-0;
}

/* Task 1a: every control passed into the actions slot reads as a pill,
 * regardless of whether the page used <Button> (rounded-md),
 * <UiActionButton> (rounded-lg), or a raw button. Scoped to the header so
 * it can't leak into page content. */
.app-header__actions :deep(button),
.app-header__actions :deep(a),
.app-header__actions :deep([data-slot='button']) {
	border-radius: 9999px;
}
</style>

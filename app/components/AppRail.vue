<script setup lang="ts">
/**
 * AppRail — top-level navigation rail for Apps Layout mode.
 *
 * Icons + colours come from `useAppAccent` (single source of truth). All
 * chips render with the per-app solid accent (macOS/iOS-app-icon style);
 * the active item just gets a stronger gradient + shadow to stand out.
 * Where labels are hidden (vertical + floating) a hover tooltip surfaces
 * the app name.
 *
 * Position respects `useAppsMode().railPosition`:
 *   left / right → vertical column with footer pinned to bottom
 *   top / bottom → fixed glass pill, anchored to its edge
 *   floating     → fixed glass pill, bottom-center (compact, icon-only)
 *
 * Mobile (< md) forces bottom via useAppsMode.
 */
import { useMediaQuery } from '@vueuse/core';
import { APP_ORDER, APP_FOOTER_ORDER, appIdForPath, formatIconColor, getPaletteChrome, iconHighlightForAccent, type AppAccent } from '~/composables/useAppAccent';
import { useAppPalette } from '~/composables/useAppPalette';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

const route = useRoute();
const { railPosition, railShowLabels } = useAppsMode();
const { accents } = useAppAccent();
const { palette, glassChrome } = useAppPalette();
const { countFor } = useUnreadByCategory();

/** Active chip rendering mode — `palette` for gradient chips, `neutral`
 *  for the frosted-grey-with-accent-icon look. Glass-chrome toggle is
 *  orthogonal: when ON it forces neutral regardless of palette, so
 *  Sea Mist / Aurora users can wear the calm frosted look too. */
const chipMode = computed(() => {
	if (glassChrome.value) return 'neutral';
	return getPaletteChrome(palette.value).chipMode;
});

function badgeFor(app: AppAccent): number {
	if (!app.notificationCategories?.length) return 0;
	return app.notificationCategories.reduce((sum, cat) => sum + countFor(cat), 0);
}
function badgeLabel(count: number) {
	return count > 99 ? '99+' : String(count);
}

const apps = computed<AppAccent[]>(() => APP_ORDER.map((id) => accents.value[id]));
const footer = computed<AppAccent[]>(() => APP_FOOTER_ORDER.map((id) => accents.value[id]));

const activeId = computed(() => appIdForPath(route.path));

const isHorizontal = computed(() =>
	railPosition.value === 'top'
	|| railPosition.value === 'bottom'
	|| railPosition.value === 'floating',
);

// Horizontal rail (top/bottom) becomes icon-only when the user hides
// labels — keep the inline text path for everyone else.
const horizontalLabelsHidden = computed(() =>
	(railPosition.value === 'top' || railPosition.value === 'bottom') && !railShowLabels.value,
);

// Tooltips fill in for the inline label when the rail is icon-only.
const showTooltip = computed(() =>
	railPosition.value === 'left'
	|| railPosition.value === 'right'
	|| railPosition.value === 'floating'
	|| horizontalLabelsHidden.value,
);

const tooltipSide = computed<'top' | 'bottom' | 'left' | 'right'>(() => {
	if (railPosition.value === 'left') return 'right';
	if (railPosition.value === 'right') return 'left';
	return 'top';
});

function styleFor(app: AppAccent) {
	return {
		'--rail-h': String(app.h),
		'--rail-s': `${app.s}%`,
		'--rail-l': `${app.l}%`,
		'--rail-icon': formatIconColor(app),
		'--rail-icon-bright': iconHighlightForAccent(app.h, app.s, app.l),
	};
}

// ─── macOS-style cursor magnification (large + hover-capable only) ──────────
// Tracks the pointer X across the rail and computes a per-chip scale based
// on distance from the cursor. Disabled on touch, small screens, and the
// vertical rails — only horizontal pills (top/bottom/floating) light up.
const railEl = ref<HTMLElement | null>(null);
const isLargeHoverCapable = useMediaQuery('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
const magnifyEnabled = computed(() => isHorizontal.value && isLargeHoverCapable.value);

const itemScales = reactive<Record<string, number>>({});

function applyMagnification(clientX: number) {
	const root = railEl.value;
	if (!root) return;
	const items = root.querySelectorAll<HTMLElement>('[data-app-id]');
	// macOS Dock-style proportions — wider reach so neighbours rise with
	// the focused chip, larger peak so the hovered chip pops clearly.
	const reach = 160;
	const max = 0.65; // hovered chip grows up to 1.65×
	items.forEach((el) => {
		const id = el.getAttribute('data-app-id');
		if (!id) return;
		const rect = el.getBoundingClientRect();
		const center = rect.left + rect.width / 2;
		const dx = Math.abs(clientX - center);
		const t = dx >= reach ? 0 : 1 - dx / reach;
		// Smoothstep for an organic curve — pulls the falloff closer to
		// the cursor so neighbours stay relatively flat until the cursor
		// is near them, then grow quickly. Matches Dock's feel.
		const eased = t * t * (3 - 2 * t);
		itemScales[id] = 1 + eased * max;
	});
}

function resetMagnification() {
	for (const key of Object.keys(itemScales)) itemScales[key] = 1;
}

function onPointerMove(e: PointerEvent) {
	if (!magnifyEnabled.value) return;
	if (e.pointerType !== 'mouse') return;
	applyMagnification(e.clientX);
}

function onPointerLeave() {
	resetMagnification();
}

function chipMagnifyStyle(appId: string) {
	if (!magnifyEnabled.value) return undefined;
	const s = itemScales[appId];
	if (!s || s === 1) return undefined;
	return { transform: `scale(${s})` };
}
</script>

<template>
	<TooltipProvider :delay-duration="120">
		<nav
			class="app-rail"
			:class="[
				`app-rail--${railPosition}`,
				isHorizontal ? 'app-rail--horizontal' : 'app-rail--vertical',
				horizontalLabelsHidden && 'app-rail--icons-only',
			]"
			ref="railEl"
			:data-chip-mode="chipMode"
			aria-label="Apps"
			@pointermove="onPointerMove"
			@pointerleave="onPointerLeave"
		>
			<ul class="app-rail__group app-rail__group--main">
				<li v-for="app in apps" :key="app.id">
					<Tooltip>
						<TooltipTrigger as-child>
							<NuxtLink
								:to="app.to"
								class="app-rail__item"
								:class="{ 'app-rail__item--active': activeId === app.id }"
								:style="styleFor(app)"
								:data-app-id="app.id"
								:aria-label="app.name"
							>
								<span class="app-rail__chip" :style="chipMagnifyStyle(app.id)">
									<span class="app-rail__icon">
										<Icon :name="app.icon" class="app-rail__icon-layer app-rail__icon-base" />
										<span class="app-rail__icon-layer app-rail__icon-highlight-mask" aria-hidden="true">
											<Icon :name="app.icon" class="app-rail__icon-highlight" />
										</span>
									</span>
									<span
										v-if="badgeFor(app) > 0"
										class="app-rail__badge"
										:aria-label="`${badgeFor(app)} unread`"
									>{{ badgeLabel(badgeFor(app)) }}</span>
								</span>
								<span class="app-rail__label">{{ app.name }}</span>
							</NuxtLink>
						</TooltipTrigger>
						<TooltipContent v-if="showTooltip" :side="tooltipSide" :side-offset="8">
							{{ app.name }}
						</TooltipContent>
					</Tooltip>
				</li>
			</ul>

			<span class="app-rail__divider" aria-hidden="true" />

			<ul class="app-rail__group app-rail__group--footer">
				<li v-for="app in footer" :key="app.id">
					<Tooltip>
						<TooltipTrigger as-child>
							<NuxtLink
								:to="app.to"
								class="app-rail__item"
								:class="{ 'app-rail__item--active': activeId === app.id }"
								:style="styleFor(app)"
								:data-app-id="app.id"
								:aria-label="app.name"
							>
								<span class="app-rail__chip" :style="chipMagnifyStyle(app.id)">
									<span class="app-rail__icon">
										<Icon :name="app.icon" class="app-rail__icon-layer app-rail__icon-base" />
										<span class="app-rail__icon-layer app-rail__icon-highlight-mask" aria-hidden="true">
											<Icon :name="app.icon" class="app-rail__icon-highlight" />
										</span>
									</span>
									<span
										v-if="badgeFor(app) > 0"
										class="app-rail__badge"
										:aria-label="`${badgeFor(app)} unread`"
									>{{ badgeLabel(badgeFor(app)) }}</span>
								</span>
								<span class="app-rail__label">{{ app.name }}</span>
							</NuxtLink>
						</TooltipTrigger>
						<TooltipContent v-if="showTooltip" :side="tooltipSide" :side-offset="8">
							{{ app.name }}
						</TooltipContent>
					</Tooltip>
				</li>
			</ul>
		</nav>
	</TooltipProvider>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-rail {
	@apply flex bg-background border-border/40 select-none;
	--rail-gap: 8px;
}

/* ── Layout ──────────────────────────────────────────────────────── */
/* Desktop vertical rail is icon-only (Linear/Slack-style); labels live
 * on the title-attribute tooltip and on horizontal mode. Keeps the rail
 * narrow so the work area gets the screen real-estate it deserves. */
.app-rail--vertical {
	@apply flex-col w-[56px] shrink-0 py-2;
	row-gap: var(--rail-gap);
	justify-content: center;
}

/* Horizontal modes (top/bottom/floating) all use tight, uniform spacing
 * — the rail-level gap (between the main and footer groups) matches the
 * in-group gap below, so the divider-less floating pill and the
 * divider-less top/bottom pills all read as one evenly spaced row.
 *
 * `overflow: visible` is critical: any non-visible overflow on one axis
 * forces the other to clip too (the well-known CSS overflow trap), which
 * was slicing the tops off magnified chips on hover. Icons-only mode
 * already keeps the rail narrow enough to fit on phones without
 * horizontal scroll, so dropping the safety auto-scroll is fine. */
.app-rail--horizontal {
	@apply flex-row w-full px-3 py-1.5 justify-center items-center;
	overflow: visible;
	column-gap: 2px;
}

.app-rail--left { @apply border-r; }
.app-rail--right { @apply border-l; }

/* Top + bottom both render as fixed glass pills, anchored to their edge.
 * They mirror the floating variant's chrome (rounded, translucent, blurred);
 * the layout adds page padding so content does not scroll under them. */
.app-rail--top,
.app-rail--bottom,
.app-rail--floating {
	@apply fixed left-1/2 -translate-x-1/2 z-40
		rounded-full border border-border/40
		bg-background/85 backdrop-blur-md
		w-auto;
	box-shadow:
		0 4px 14px -6px hsl(0 0% 0% / 0.18),
		0 2px 6px -2px hsl(0 0% 0% / 0.08);
}

.app-rail--top {
	top: calc(56px + 0.75rem); /* chrome height + breathing gap */
}

.app-rail--bottom,
.app-rail--floating {
	bottom: calc(0.75rem + env(safe-area-inset-bottom));
}

/* ── Groups ──────────────────────────────────────────────────────── */
.app-rail__group {
	@apply flex list-none m-0 p-0;
}

.app-rail--vertical .app-rail__group {
	@apply flex-col items-stretch w-full;
	row-gap: 6px;
}

.app-rail--horizontal .app-rail__group {
	@apply flex-row items-center;
	column-gap: 2px;
}

.app-rail--vertical .app-rail__group--main,
.app-rail--vertical .app-rail__group--footer {
	@apply px-1;
}

.app-rail__divider {
	@apply bg-border/40 self-center shrink-0;
}

.app-rail--vertical .app-rail__divider {
	@apply h-px w-6 my-1;
}

.app-rail--horizontal .app-rail__divider {
	@apply w-px h-6 mx-1;
}

/* Horizontal pill variants (top/bottom/floating) sit the two groups flush
 * — the rail's own column-gap is enough separation, so the divider is
 * visual noise here. Only the vertical column rails keep it. */
.app-rail--top .app-rail__divider,
.app-rail--bottom .app-rail__divider,
.app-rail--floating .app-rail__divider {
	display: none;
}

/* ── Item ─────────────────────────────────────────────────────────── */
.app-rail__item {
	@apply flex flex-col items-center justify-center
		rounded-lg
		text-muted-foreground
		transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]
		no-underline;
	padding: 2px;
}

.app-rail--horizontal .app-rail__item,
.app-rail--floating .app-rail__item {
	@apply flex-row gap-2;
	padding: 4px 10px;
}

/* ── Chip (icon container) ───────────────────────────────────────── */
/* Solid-gradient app-icon styling — each chip is a rounded square tile
 * carrying a top-light → base → bottom-shaded vertical gradient in the
 * app's accent hue. Reads as a 3D-ish iOS home-screen icon. The icon
 * glyph picks white or near-black (`--rail-icon`) for legibility based
 * on the accent's perceived lightness. */
.app-rail__chip {
	@apply flex items-center justify-center shrink-0;
	/* Two-speed transition: background animates over 200ms for the
	 * smooth hover/active wash, but transform is snappy (80ms) so the
	 * cursor-driven magnification on horizontal rails tracks pointer
	 * motion without visible lag. */
	transition:
		background 200ms cubic-bezier(0.16, 1, 0.3, 1),
		transform 80ms ease-out,
		box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
	position: relative;
	width: 38px;
	height: 38px;
	/* Full circle — chips read as soft, friendly badges. */
	border-radius: 50%;
	background: linear-gradient(
		160deg,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 12%)) 0%,
		hsl(var(--rail-h) var(--rail-s) var(--rail-l)) 55%,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 8%)) 100%
	);
	/* Inset top highlight + bottom shade reinforces the 3D tile read
	 * without a heavy gloss. Drop shadow tinted in the accent hue so the
	 * tile feels "lit" rather than just bordered. */
	box-shadow:
		inset 0 1px 0 hsl(0 0% 100% / 0.28),
		inset 0 -1px 0 hsl(0 0% 0% / 0.08),
		0 1px 2px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.25);
}

/* Magnification grows the chip outward from the rail edge so it doesn't
 * get clipped by the pill's rounded background. Top rail anchors at
 * top, bottom/floating anchor at bottom, vertical rails grow toward
 * the page interior. */
.app-rail--top .app-rail__chip { transform-origin: center top; }
.app-rail--bottom .app-rail__chip,
.app-rail--floating .app-rail__chip { transform-origin: center bottom; }
.app-rail--left .app-rail__chip { transform-origin: left center; }
.app-rail--right .app-rail__chip { transform-origin: right center; }

/* `::after` is reserved for the active-state blurred shadow ring (see
 * the `.app-rail__item--active .app-rail__chip::after` rule below). The
 * sheen overlay this pseudo used to carry has been retired — gradient bg
 * + drop-shadowed icon carry the depth without it. Default state hides
 * the ring; the active rule fills `content` to draw it. */
.app-rail__chip::after {
	content: none;
}

/* Dual-layer icon highlight disabled — single solid white glyph reads
 * cleaner. Markup retained so we can revive the inner gradient by
 * flipping `display: block` here and re-pointing the colour rule below. */
/* Co-applied class on the same element bumps specificity above the
 * generic `.app-rail__icon-layer { display: block }` defined below. */
.app-rail__icon-layer.app-rail__icon-highlight-mask {
	display: none;
}

.app-rail--horizontal .app-rail__chip,
.app-rail--floating .app-rail__chip {
	width: 32px;
	height: 32px;
	/* Inherits border-radius: 50% from the base rule above — circular at
	 * every size, just smaller in the floating/horizontal pills. */
}

/* Icon wrapper stacks two copies of the SVG. The base layer carries the
 * accent color; the highlight layer is white, masked to a fade so it only
 * shows in the top portion of the glyph. The composite reads as a true
 * gradient INSIDE the icon shape (light top → accent bottom). */
.app-rail__icon {
	@apply relative inline-block;
	width: 22px;
	height: 22px;
	z-index: 2;
	transition: transform 0.2s ease;
	/* Soft cast shadow under the glyph — uniform across chips. */
	filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.28));
}

.app-rail--horizontal .app-rail__icon,
.app-rail--floating .app-rail__icon {
	width: 19px;
	height: 19px;
}

.app-rail__icon-layer {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
	stroke-width: 1.75;
}

.app-rail__icon-base {
	/* Per-chip glyph colour, sourced from the palette's `iconColors`
	 * mirror map (Sea Mist pairs Aquamarine bg ↔ Royal Violet glyph).
	 * Falls back to the perceived-lightness contrast colour for
	 * palettes that don't define iconColors. */
	color: var(--rail-icon, hsl(0 0% 100%));
	z-index: 0;
}

/* Hover — slight lift and brighter top stop so the tile catches more
 * "light". Background stays solid-gradient; only the lightness ramp
 * shifts. */
.app-rail__item:hover .app-rail__chip {
	background: linear-gradient(
		160deg,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 16%)) 0%,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 2%)) 55%,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 6%)) 100%
	);
	transform: translateY(-1px);
	box-shadow:
		inset 0 1px 0 hsl(0 0% 100% / 0.32),
		inset 0 -1px 0 hsl(0 0% 0% / 0.08),
		0 4px 10px -3px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.4);
}

.app-rail__item:hover {
	@apply text-foreground;
}

/* ── Active state ────────────────────────────────────────────────── */
/* Active: tile saturates to a deeper shade of the accent. Selected cue
 * is a thin, crisp accent ring sitting just outside the chip — bright
 * and clean, no glow blur. Inset highlights/lowlights + a tinted drop
 * shadow carry the lift. */
.app-rail__item--active {
	@apply text-foreground;
}

.app-rail__item--active .app-rail__chip {
	/* Active tile darkens overall — same hue family, deeper bottom stop,
	 * so the selected app reads as the most saturated tile in the rail. */
	background: linear-gradient(
		160deg,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 6%)) 0%,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 4%)) 55%,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 14%)) 100%
	);
	transform: translateY(-1px);
	box-shadow:
		inset 0 1px 0 hsl(0 0% 100% / 0.35),
		inset 0 -1px 0 hsl(0 0% 0% / 0.12),
		0 4px 12px -3px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.5);
	/* Thin, bright accent ring with a 2px breathing gap — sharp + clean,
	 * reads as a confident "selected" cue without the heavy glow. */
	outline: 1.25px solid hsl(var(--rail-h) var(--rail-s) var(--rail-l));
	outline-offset: 2px;
}

.app-rail__item--active .app-rail__icon-base {
	color: var(--rail-icon, hsl(0 0% 100%));
}

/* ── Neutral chip mode ───────────────────────────────────────────── */
/* When the active palette is Neutral (or Glass toggle is on), chips drop
 * their per-app gradient and render as uniform frosted tiles with a
 * single palette-tinted glyph. The hairline border + soft highlight
 * lifts each chip into iOS 26 "Liquid Glass" territory: a discrete
 * crystalline disc that catches a top-light highlight rather than a
 * flat translucent panel.
 *
 * Icons drop their cast shadow in this mode — the chrome already carries
 * depth via the border + highlight, and a drop-shadow on a coloured glyph
 * inside a translucent disc reads as smudge rather than dimension.
 */
.app-rail[data-chip-mode='neutral'] .app-rail__chip {
	background: hsl(0 0% 100% / 0.42);
	backdrop-filter: blur(14px) saturate(1.2);
	-webkit-backdrop-filter: blur(14px) saturate(1.2);
	border: 1px solid hsl(0 0% 100% / 0.7);
	box-shadow:
		inset 0 1px 0 hsl(0 0% 100% / 0.85),
		inset 0 -1px 0 hsl(0 0% 0% / 0.04),
		0 1px 3px hsl(0 0% 0% / 0.08),
		0 4px 14px -6px hsl(0 0% 0% / 0.12);
}

.app-rail[data-chip-mode='neutral'] .app-rail__icon {
	/* Drop the cast shadow in neutral mode — the disc's own border + inner
	 * highlight already carry depth; a shadow on the coloured glyph reads
	 * as smudge through the glass. */
	filter: none;
}

.app-rail[data-chip-mode='neutral'] .app-rail__item:hover .app-rail__chip {
	background: hsl(0 0% 100% / 0.55);
	border-color: hsl(0 0% 100% / 0.85);
	box-shadow:
		inset 0 1px 0 hsl(0 0% 100% / 0.95),
		inset 0 -1px 0 hsl(0 0% 0% / 0.04),
		0 4px 12px -3px hsl(0 0% 0% / 0.14);
}

.app-rail[data-chip-mode='neutral'] .app-rail__item--active .app-rail__chip {
	background: hsl(0 0% 100% / 0.72);
	border-color: hsl(var(--primary) / 0.45);
	box-shadow:
		inset 0 1px 0 hsl(0 0% 100% / 0.95),
		inset 0 -1px 0 hsl(0 0% 0% / 0.06),
		0 4px 14px -3px hsl(var(--primary) / 0.35);
	/* Selected ring picks up the palette primary so the active state
	 * still sings even with a uniform chrome. */
	outline: 1.25px solid hsl(var(--primary));
	outline-offset: 2px;
}

.dark .app-rail[data-chip-mode='neutral'] .app-rail__chip {
	background: hsl(0 0% 100% / 0.06);
	border-color: hsl(0 0% 100% / 0.14);
	box-shadow:
		inset 0 1px 0 hsl(0 0% 100% / 0.12),
		inset 0 -1px 0 hsl(0 0% 0% / 0.2),
		0 1px 3px hsl(0 0% 0% / 0.4);
}

.dark .app-rail[data-chip-mode='neutral'] .app-rail__item:hover .app-rail__chip {
	background: hsl(0 0% 100% / 0.1);
	border-color: hsl(0 0% 100% / 0.2);
}

.dark .app-rail[data-chip-mode='neutral'] .app-rail__item--active .app-rail__chip {
	background: hsl(0 0% 100% / 0.16);
	border-color: hsl(var(--primary) / 0.55);
}

/* ── Neutral rail surface — slate tint for chip contrast ─────────── */
/* The default rail background is `bg-background` (near-white), which
 * leaves the frosted chips floating against a same-colour backdrop —
 * the disc shape disappears. A whisper of neutral-grey on the rail
 * itself gives the chips something to sit on, without crossing into
 * "panel" territory. Floating / top / bottom pills already have their
 * own translucent backdrop, so we tint them slightly cooler instead. */
.app-rail[data-chip-mode='neutral'] {
	background: hsl(220 14% 95%);
}

.app-rail[data-chip-mode='neutral'].app-rail--top,
.app-rail[data-chip-mode='neutral'].app-rail--bottom,
.app-rail[data-chip-mode='neutral'].app-rail--floating {
	background: hsl(220 14% 95% / 0.78);
}

.dark .app-rail[data-chip-mode='neutral'] {
	background: hsl(0 0% 10%);
}

.dark .app-rail[data-chip-mode='neutral'].app-rail--top,
.dark .app-rail[data-chip-mode='neutral'].app-rail--bottom,
.dark .app-rail[data-chip-mode='neutral'].app-rail--floating {
	background: hsl(0 0% 8% / 0.78);
}

/* Glass-chrome icon overrides live in theme.css under
 * `[data-surface='glass']` — scoped styles can't reach an ancestor
 * `<html>` attribute, so the global stylesheet owns those rules. */

/* ── Label ───────────────────────────────────────────────────────── */
/* Vertical rail is icon-only; the title-attribute tooltip carries the
 * label. Horizontal mode keeps labels inline. Floating stays icon-only.
 * On narrow viewports (forced-bottom on mobile) we drop the labels too
 * so the centered pill fits comfortably without overflowing. */
.app-rail--vertical .app-rail__label,
.app-rail--floating .app-rail__label,
.app-rail--icons-only .app-rail__label {
	@apply sr-only;
}

@media (max-width: 767px) {
	.app-rail--horizontal .app-rail__label {
		@apply sr-only;
	}
}

.app-rail__label {
	font-size: 11px;
	font-weight: 500;
	letter-spacing: 0.02em;
	line-height: 1;
	color: hsl(var(--muted-foreground));
	transition: color 0.2s ease;
}

.app-rail__item:hover .app-rail__label {
	color: hsl(var(--foreground));
}

.app-rail__item--active .app-rail__label {
	color: hsl(var(--foreground));
	font-weight: 600;
}

/* ── Badge ────────────────────────────────────────────────────────── */
/* Unread-count pill anchored to the chip's top-right. Sized so single
 * digits render as a tight circle and longer counts (10+, "99+") grow
 * naturally into a pill. The cyan accent matches the bell's unread dot
 * for visual rhyme between the rail and the bell. */
.app-rail__badge {
	position: absolute;
	top: -4px;
	right: -4px;
	min-width: 16px;
	height: 16px;
	padding: 0 4px;
	border-radius: 999px;
	background: hsl(var(--primary));
	color: hsl(var(--primary-foreground));
	font-size: 9px;
	font-weight: 700;
	line-height: 1;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 1px 3px hsl(0 0% 0% / 0.25), 0 0 0 1.5px hsl(var(--background));
	pointer-events: none;
	z-index: 3;
}
</style>

<script setup lang="ts">
/**
 * AppRail — top-level navigation rail for Apps Layout mode.
 *
 * Icons + colours come from `useAppAccent` (single source of truth). All
 * chips render with the per-app solid accent (macOS/iOS-app-icon style);
 * the active item just gets a stronger gradient + shadow to stand out.
 * Vertical (left/right) pills are icon-only with a hover tooltip; horizontal
 * (top/bottom) pills show inline labels unless the user hides them.
 *
 * Position respects `useAppsMode().railPosition` — every position renders
 * as a fixed glass pill hugging the chosen edge (left / right / top / bottom).
 *
 * Mobile (< md) forces bottom via useAppsMode.
 */
import { useMediaQuery } from '@vueuse/core';
import { APP_ORDER, APP_FOOTER_ORDER, appIdForPath, formatIconColor, iconHighlightForAccent, type AppAccent } from '~/composables/useAppAccent';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

// Haptic tap on app switch — mirrors AppSegmentedControl + AppFloorStrip
// so navigating apps via the rail feels tactile-consistent with switching
// floors within an app.
const { tap: hapticTap } = useHaptic();

const route = useRoute();
const { railPosition, railShowLabels } = useAppsMode();
/**
 * `accents` and `chipMode` MUST come from the same `useAppAccent()` call so
 * they resolve against one palette ref. Deriving chipMode from a separate
 * `useAppPalette()` here let the two desync during hydration — accents would
 * flip to the user's palette (e.g. Neutral) while chipMode stayed on the SSR
 * default, rendering Neutral's same-hue glyphs on gradient chips → invisible
 * icons. One source keeps gradient-vs-frosted in lockstep with the glyph hue.
 */
const { accents, chipMode } = useAppAccent();
const { countFor } = useUnreadByCategory();

// Channels unread is read-state driven (channel_members), not notification
// categories — keep it fresh here so the rail badge updates app-wide.
const channelUnread = useChannelUnread();
let channelUnreadTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
	channelUnread.refresh();
	channelUnreadTimer = setInterval(() => channelUnread.refresh(), 45_000);
});
onBeforeUnmount(() => {
	if (channelUnreadTimer) clearInterval(channelUnreadTimer);
});

function badgeFor(app: AppAccent): number {
	if (app.id === 'channels') return channelUnread.total.value;
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
	railPosition.value === 'top' || railPosition.value === 'bottom',
);

// Horizontal rail (top/bottom) becomes icon-only when the user hides
// labels — keep the inline text path for everyone else. Vertical pills
// (left/right) are always icon-only since the pill is too narrow for
// inline text.
const horizontalLabelsHidden = computed(() =>
	isHorizontal.value && !railShowLabels.value,
);

// Tooltips fill in for the inline label when the rail is icon-only.
const showTooltip = computed(() =>
	!isHorizontal.value || horizontalLabelsHidden.value,
);

const tooltipSide = computed<'top' | 'bottom' | 'left' | 'right'>(() => {
	if (railPosition.value === 'left') return 'right';
	if (railPosition.value === 'right') return 'left';
	return 'top';
});

// On the horizontal (top/bottom/floating) rail the hovered chip magnifies to
// ~1.65× and visually overhangs its layout box, so the default 8px tooltip
// offset let the label render ON TOP of the magnified icon. Clear the grown
// footprint — half the peak overhang of a ~38px chip is ~13px — so the
// tooltip sits cleanly above (or beside) the magnified app instead.
const tooltipOffset = computed(() => (magnifyEnabled.value ? 22 : 8));

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
// `any-hover` + `any-pointer` instead of `hover`/`pointer` so devices with a
// secondary fine pointer light up the dock — iPadOS reports a coarse primary
// pointer even with a Magic Keyboard / trackpad / mouse attached, but exposes
// the fine pointer via the `any-*` variants. Threshold drops to 980px so
// iPad Air landscape (1180px) clears it with margin.
const isLargeHoverCapable = useMediaQuery('(min-width: 980px) and (any-hover: hover) and (any-pointer: fine)');
const magnifyEnabled = computed(() => isHorizontal.value && isLargeHoverCapable.value);

const itemScales = reactive<Record<string, number>>({});
// Sideways push for each chip, in CSS pixels. Adjacent chips shift outward
// from the focal chip to make room for its scaled-up footprint — the macOS
// Dock effect. Re-computed every pointermove alongside `itemScales`.
const itemShifts = reactive<Record<string, number>>({});

// How far the outermost chips poke past the rail's natural left/right
// edges at peak magnification. We mirror that as extra inline padding so
// the pill background grows with the chips instead of letting them spill
// out of the chrome. Magnification only fires on horizontal rails ≥980px,
// so we don't bother with vertical-axis handling.
const magnifyPadLeft = ref(0);
const magnifyPadRight = ref(0);

function applyMagnification(clientX: number) {
	const root = railEl.value;
	if (!root) return;
	const items = root.querySelectorAll<HTMLElement>('[data-app-id]');
	// macOS Dock-style proportions — wider reach so neighbours rise with
	// the focused chip, larger peak so the hovered chip pops clearly.
	const reach = 160;
	const max = 0.65; // hovered chip grows up to 1.65×
	// Base chip diameter (matches `.app-rail__chip` width on horizontal
	// rails). Used to convert each chip's scale into the number of extra
	// CSS pixels its footprint adds, which then drives the push-aside
	// shift below.
	const chipBase = 32;

	// First pass: per-chip scale based on cursor distance.
	const data: Array<{ id: string; scale: number }> = [];
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
		const scale = 1 + eased * max;
		data.push({ id, scale });
	});

	// Second pass: push-aside shift. Each chip's added footprint is
	// `(scale - 1) * chipBase`; half of that pushes left, half pushes
	// right. For a chip at index i, sum the half-footprints from chips
	// to its left (push i rightward) and subtract those from the right
	// (push i leftward) so the visual gaps open symmetrically around
	// the focal chip while the rail's total width stays constant.
	data.forEach((cur, i) => {
		let shift = 0;
		for (let j = 0; j < data.length; j++) {
			if (j === i) continue;
			const grown = (data[j]!.scale - 1) * chipBase;
			if (j < i) shift += grown / 2;
			else shift -= grown / 2;
		}
		itemScales[cur.id] = cur.scale;
		itemShifts[cur.id] = shift;
	});

	// Third pass: grow the pill chrome to contain the magnified chips. The
	// leftmost chip's visual left edge sits at `(natural_x + shift)
	// - (scale - 1) * chipBase / 2`; we want the pill's content box to
	// extend by that overhang so the chip stays inside the rounded
	// background. Same logic mirrored on the right.
	const first = data[0];
	const last = data[data.length - 1];
	const overhang = (entry: { id: string; scale: number } | undefined, sign: 1 | -1) => {
		if (!entry) return 0;
		const halfGrown = (entry.scale - 1) * chipBase / 2;
		const shift = itemShifts[entry.id] ?? 0;
		return Math.max(0, sign * shift + halfGrown);
	};
	magnifyPadLeft.value = overhang(first, -1);
	magnifyPadRight.value = overhang(last, 1);
}

function resetMagnification() {
	for (const key of Object.keys(itemScales)) itemScales[key] = 1;
	for (const key of Object.keys(itemShifts)) itemShifts[key] = 0;
	magnifyPadLeft.value = 0;
	magnifyPadRight.value = 0;
}

/**
 * Inline padding override that grows the pill background to envelope
 * the magnified chips. Magnification only fires on horizontal rails at
 * ≥980px, so the base padding here is the md+ value (`px-4` = 16px) —
 * the inline rule simply adds the overhang to that. Returns `undefined`
 * when no growth is needed so the rail falls back to its scoped CSS
 * padding without an inline override fighting the stylesheet.
 */
function railMagnifyStyle() {
	if (!magnifyEnabled.value) return undefined;
	if (magnifyPadLeft.value === 0 && magnifyPadRight.value === 0) return undefined;
	const base = 16; // px-4 — magnification is gated to ≥980px
	return {
		paddingLeft: `${(base + magnifyPadLeft.value).toFixed(2)}px`,
		paddingRight: `${(base + magnifyPadRight.value).toFixed(2)}px`,
	};
}

function onPointerMove(e: PointerEvent) {
	if (!magnifyEnabled.value) return;
	if (e.pointerType !== 'mouse') return;
	applyMagnification(e.clientX);
}

function onPointerLeave() {
	resetMagnification();
}

/**
 * Sideways push for the whole item (chip + label). Living on the wrapper
 * means the label rides along with its chip — just like a macOS Dock icon
 * label hugs the icon as it slides aside. The wrapper itself doesn't scale.
 */
function itemMagnifyStyle(appId: string) {
	if (!magnifyEnabled.value) return undefined;
	const x = itemShifts[appId] ?? 0;
	if (Math.abs(x) < 0.25) return undefined;
	return { transform: `translateX(${x.toFixed(2)}px)` };
}

/**
 * Per-chip scale only. Kept separate from the wrapper's translate so the
 * label below stays a constant size — only the gradient tile lifts and
 * grows, matching the Dock convention where the caption never scales.
 */
function chipMagnifyStyle(appId: string) {
	if (!magnifyEnabled.value) return undefined;
	const s = itemScales[appId];
	if (!s || s === 1) return undefined;
	return { transform: `scale(${s.toFixed(3)})` };
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
			:style="railMagnifyStyle()"
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
								:style="[styleFor(app), itemMagnifyStyle(app.id)]"
								:data-app-id="app.id"
								:aria-label="app.name"
								@click="activeId !== app.id && hapticTap()"
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
								<span class="app-rail__label">{{ app.shortName || app.name }}</span>
							</NuxtLink>
						</TooltipTrigger>
						<TooltipContent v-if="showTooltip" :side="tooltipSide" :side-offset="tooltipOffset" class="z-[70]">
							{{ app.name }}
						</TooltipContent>
					</Tooltip>
				</li>
			</ul>

			<ul class="app-rail__group app-rail__group--footer">
				<li>
					<Tooltip>
						<TooltipTrigger as-child>
							<NuxtLink
								to="/director"
								class="app-rail__item"
								:class="{ 'app-rail__item--active': route.path.startsWith('/director') }"
								:style="[{
									'--rail-h': 'var(--app-director-h, 222)',
									'--rail-s': 'var(--app-director-s, 12%)',
									'--rail-l': 'var(--app-director-l, 24%)',
									'--rail-icon': 'var(--app-director-icon, hsl(0 0% 60%))',
									'--rail-icon-bright': 'var(--app-director-icon, hsl(0 0% 92%))',
								}, itemMagnifyStyle('director')]"
								data-app-id="director"
								aria-label="Director's Office"
								@click="hapticTap()"
							>
								<span class="app-rail__chip" :style="chipMagnifyStyle('director')">
									<span class="app-rail__icon">
										<ExecutiveChairIcon mono class="app-rail__icon-layer app-rail__icon-base" />
									</span>
								</span>
								<span class="app-rail__label">Director</span>
							</NuxtLink>
						</TooltipTrigger>
						<TooltipContent v-if="showTooltip" :side="tooltipSide" :side-offset="tooltipOffset" class="z-[70]">
							Director's Office
						</TooltipContent>
					</Tooltip>
				</li>
				<li v-for="app in footer" :key="app.id">
					<Tooltip>
						<TooltipTrigger as-child>
							<NuxtLink
								:to="app.to"
								class="app-rail__item"
								:class="{ 'app-rail__item--active': activeId === app.id }"
								:style="[styleFor(app), itemMagnifyStyle(app.id)]"
								:data-app-id="app.id"
								:aria-label="app.name"
								@click="activeId !== app.id && hapticTap()"
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
								<span class="app-rail__label">{{ app.shortName || app.name }}</span>
							</NuxtLink>
						</TooltipTrigger>
						<TooltipContent v-if="showTooltip" :side="tooltipSide" :side-offset="tooltipOffset" class="z-[70]">
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
/* Every position renders as a fixed glass pill hugging the chosen edge.
 * Horizontal (top/bottom) pills lay chips out left-to-right; vertical
 * (left/right) pills lay them top-to-bottom. Pill chrome (rounded,
 * translucent, blurred) is identical across all four — only orientation
 * + anchor coordinates change.
 *
 * `overflow: visible` is critical: any non-visible overflow on one axis
 * forces the other to clip too (the well-known CSS overflow trap), which
 * was slicing the magnified chips on hover. */
.app-rail--horizontal {
	@apply flex-row px-3 py-1.5 justify-center items-center;
	overflow: visible;
	column-gap: 2px;
	/* Snap padding alongside the per-chip translate so the pill chrome
	 * grows in lockstep with the magnification. Matches the chip
	 * transform timing so the background never lags behind the chips. */
	transition: padding 80ms ease-out;
}

/* Phones: tighten chip spacing so the centered pill fits all chips
 * comfortably without horizontal overflow when icon-only. */
@media (max-width: 767px) {
	.app-rail--horizontal {
		@apply px-1.5 py-1;
		column-gap: 0;
	}
	.app-rail--horizontal .app-rail__item {
		padding: 4px 4px;
	}
}

/* Tablet + desktop, horizontal rails only (top / bottom): give chips
 * room to breathe so the row reads as a line-up of distinct iOS-style
 * tiles instead of a packed strip. Bumps both the rail-level gap
 * (between groups) and the per-group gap (between chips). Vertical
 * rails keep their tighter row-gap. */
@media (min-width: 768px) {
	.app-rail--horizontal {
		@apply px-4 py-2;
		column-gap: 8px;
	}
	.app-rail--horizontal .app-rail__group {
		column-gap: 8px;
	}
}

.app-rail--vertical {
	@apply flex-col px-1.5 py-3 justify-center items-center;
	overflow: visible;
	row-gap: 4px;
}

.app-rail--top,
.app-rail--bottom,
.app-rail--left,
.app-rail--right {
	@apply fixed z-40
		rounded-full border border-border/40
		w-auto;
	/* Liquid-glass plinth — bumped from backdrop-blur-md (12px) to 24px +
	 * saturate(160%) so the rail reads as a true iOS-26 glass pill against
	 * whatever's underneath. Palette-tint overlay (below) still layers on
	 * top of this for color. */
	backdrop-filter: blur(24px) saturate(160%);
	-webkit-backdrop-filter: blur(24px) saturate(160%);
	background: hsl(220 14% 95% / 0.72);
	box-shadow:
		0 1px 0 0 hsl(0 0% 100% / 0.55) inset,
		0 6px 18px -8px hsl(0 0% 0% / 0.22),
		0 2px 6px -2px hsl(0 0% 0% / 0.08);
}
@media (prefers-reduced-transparency: reduce) {
	.app-rail--top,
	.app-rail--bottom,
	.app-rail--left,
	.app-rail--right {
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		background: hsl(220 14% 95%);
	}
}

.dark .app-rail--top,
.dark .app-rail--bottom,
.dark .app-rail--left,
.dark .app-rail--right {
	/* Dark glass: deeper translucent slab so the saturate boost picks up
	 * the page's accent gradients beneath without washing the chips out. */
	background: rgba(34, 36, 40, 0.74);
	box-shadow:
		0 1px 0 0 hsl(0 0% 100% / 0.06) inset,
		0 8px 24px -10px hsl(0 0% 0% / 0.55),
		0 2px 6px -2px hsl(0 0% 0% / 0.30);
}
@media (prefers-reduced-transparency: reduce) {
	.dark .app-rail--top,
	.dark .app-rail--bottom,
	.dark .app-rail--left,
	.dark .app-rail--right {
		background: rgb(34, 36, 40);
	}
}

/* ── Palette tint overlay ────────────────────────────────────────────
 * When `data-rail-tint='on'` (default — toggled in the rail settings),
 * paint the floating pill with a soft multi-stop linear gradient sampled
 * from the active palette's per-app accents over a darkened plinth in
 * dark mode and a softer pastel wash in light mode. The gradient stops
 * read four palette accents (work → clients → marketing → money) so
 * the rail visibly carries the palette identity instead of sitting as
 * a neutral grey pill.
 *
 * `html[data-rail-tint='on']` is set client-side by the palette plugin;
 * SSR markup defaults to `on` via useAppPalette's hydrate default. The
 * `:where()` wrapper keeps specificity flat so per-position overrides
 * (top/bottom/left/right backgrounds) still win when needed.
 *
 * The HSL var triples consumed below (`--app-work-h`, etc.) are emitted
 * by `applyPaletteToDocument` — see useAppAccent.ts. They re-sample on
 * every palette switch, so the tint follows the palette automatically. */
html[data-rail-tint='on'] .app-rail--top,
html[data-rail-tint='on'] .app-rail--bottom,
html[data-rail-tint='on'] .app-rail--left,
html[data-rail-tint='on'] .app-rail--right {
	background:
		linear-gradient(
			135deg,
			hsl(var(--app-work-h, 220) var(--app-work-s, 50%) var(--app-work-l, 55%) / 0.22) 0%,
			hsl(var(--app-clients-h, 200) var(--app-clients-s, 50%) var(--app-clients-l, 55%) / 0.18) 35%,
			hsl(var(--app-marketing-h, 320) var(--app-marketing-s, 50%) var(--app-marketing-l, 55%) / 0.20) 65%,
			hsl(var(--app-money-h, 145) var(--app-money-s, 50%) var(--app-money-l, 55%) / 0.22) 100%
		),
		hsl(220 14% 95% / 0.78);
}

html.dark[data-rail-tint='on'] .app-rail--top,
html.dark[data-rail-tint='on'] .app-rail--bottom,
html.dark[data-rail-tint='on'] .app-rail--left,
html.dark[data-rail-tint='on'] .app-rail--right {
	/* Dark + tint: stronger saturation but darker baseline so the gradient
	 * reads as a tinted-dark plinth, not a glowy bar. The base is shifted
	 * a touch darker (28/30/32) so the palette stops have headroom to
	 * show without blowing out the contrast on the chips on top. */
	background:
		linear-gradient(
			135deg,
			hsl(var(--app-work-h, 220) var(--app-work-s, 50%) var(--app-work-l, 55%) / 0.34) 0%,
			hsl(var(--app-clients-h, 200) var(--app-clients-s, 50%) var(--app-clients-l, 55%) / 0.28) 35%,
			hsl(var(--app-marketing-h, 320) var(--app-marketing-s, 50%) var(--app-marketing-l, 55%) / 0.30) 65%,
			hsl(var(--app-money-h, 145) var(--app-money-s, 50%) var(--app-money-l, 55%) / 0.34) 100%
		),
		rgba(28, 30, 32, 0.92);
}

.app-rail--top,
.app-rail--bottom {
	@apply left-1/2 -translate-x-1/2;
}

.app-rail--top {
	top: calc(56px + 0.75rem); /* chrome height + breathing gap */
}

.app-rail--bottom {
	bottom: calc(0.75rem + env(safe-area-inset-bottom));
}

.app-rail--left,
.app-rail--right {
	@apply top-1/2 -translate-y-1/2;
}

.app-rail--left {
	left: 0.75rem;
}

.app-rail--right {
	right: 0.75rem;
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

/* Floating pills sit the two groups flush — the rail's own gap is enough
 * separation, so the divider is visual noise. Hide everywhere. */
.app-rail__divider {
	display: none;
}

/* ── Item ─────────────────────────────────────────────────────────── */
.app-rail__item {
	@apply flex flex-col items-center justify-center
		rounded-lg
		text-muted-foreground
		no-underline;
	padding: 2px;
	will-change: transform;
	/* Two-speed transitions: snap the transform (80ms) so cursor-driven
	 * push-aside tracks the pointer in real time, while colour / bg /
	 * shadow keep the existing 200ms ease for soft hover state. */
	transition:
		color 200ms cubic-bezier(0.16, 1, 0.3, 1),
		background 200ms cubic-bezier(0.16, 1, 0.3, 1),
		box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1),
		transform 80ms ease-out;
}

.app-rail--horizontal .app-rail__item {
	@apply flex-col items-center justify-center;
	gap: 4px;
	padding: 4px 4px;
}

/* Fixed cell width when labels are visible — chip ≈ 32px + breathing pad
 * keeps every chip on the same column even when the label below is
 * "Mktg" vs "Clients". Without labels, items hug the chip naturally so
 * mobile/phones with sr-only labels don't waste horizontal space. */
.app-rail--horizontal:not(.app-rail--icons-only) .app-rail__item {
	width: 48px;
}

.app-rail--vertical .app-rail__item {
	padding: 4px 2px;
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
 * get clipped by the pill's rounded background. Each position anchors
 * its transform-origin to the page-facing side. */
.app-rail--top .app-rail__chip { transform-origin: center top; }
.app-rail--bottom .app-rail__chip { transform-origin: center bottom; }
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
.app-rail--vertical .app-rail__chip {
	width: 32px;
	height: 32px;
	/* Inherits border-radius: 50% from the base rule above — circular at
	 * every size, just smaller in the floating pills. */
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
.app-rail--vertical .app-rail__icon {
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

/* Hover — iOS-dock-style lift: 2px translateY + brighter top stop + a
 * larger accent-tinted glow halo. The chip feels like it rises toward
 * the cursor instead of just brightening. */
.app-rail__item:hover .app-rail__chip {
	background: linear-gradient(
		160deg,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 18%)) 0%,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 3%)) 55%,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 6%)) 100%
	);
	transform: translateY(-2px);
	box-shadow:
		inset 0 1px 0 hsl(0 0% 100% / 0.36),
		inset 0 -1px 0 hsl(0 0% 0% / 0.08),
		0 6px 18px -4px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.55),
		0 0 24px -6px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.35);
}
@media (prefers-reduced-motion: reduce) {
	.app-rail__item:hover .app-rail__chip { transform: none; }
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
	background: hsl(0 0% 100% / 0.22);
	border-color: hsl(var(--primary) / 0.7);
	box-shadow:
		inset 0 1px 0 hsl(0 0% 100% / 0.18),
		inset 0 -1px 0 hsl(0 0% 0% / 0.2),
		0 4px 14px -3px hsl(var(--primary) / 0.5);
}

/* Dark + neutral chip mode: the per-chip icon colour was picked for the
 * pastel "would-be" gradient (often a deep accent), which leaves it
 * fighting the dark frosted disc. Swap to the bright variant so the glyph
 * lifts off the chip — especially on the active state where we want it
 * to read first. */
.dark .app-rail[data-chip-mode='neutral'] .app-rail__icon-base {
	color: var(--rail-icon-bright, hsl(0 0% 92%));
}

.dark .app-rail[data-chip-mode='neutral'] .app-rail__item--active .app-rail__icon-base {
	color: hsl(0 0% 100%);
}

/* Glass-chrome icon overrides live in theme.css under
 * `[data-surface='glass']` — scoped styles can't reach an ancestor
 * `<html>` attribute, so the global stylesheet owns those rules. */

/* ── Label ───────────────────────────────────────────────────────── */
/* Vertical rails (left/right) are always icon-only; the tooltip carries
 * the label. Horizontal mode keeps labels inline unless icons-only is
 * toggled. On narrow viewports (forced-bottom on mobile) we also drop
 * the labels so the centered pill fits comfortably without overflowing. */
.app-rail--vertical .app-rail__label,
.app-rail--icons-only .app-rail__label {
	@apply sr-only;
}

@media (max-width: 767px) {
	.app-rail--horizontal .app-rail__label {
		@apply sr-only;
	}
}

/* iOS home-screen style — tiny, ALL CAPS, widely tracked, low contrast.
 * Hidden by default (railShowLabels=false); when shown they sit directly
 * under the chip in horizontal rails. */
.app-rail__label {
	font-size: 8px;
	font-weight: 600;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	line-height: 1;
	color: hsl(var(--muted-foreground));
	transition: color 0.2s ease;
	/* Truncate inside the chip cell so a longer name can't overflow into
	 * its neighbour and break the iOS-grid alignment. */
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
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

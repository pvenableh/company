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
import { APP_ORDER, APP_FOOTER_ORDER, type AppAccent } from '~/composables/useAppAccent';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

const route = useRoute();
const { railPosition, railShowLabels } = useAppsMode();
const { accents } = useAppAccent();
const { countFor } = useUnreadByCategory();

function badgeFor(app: AppAccent): number {
	if (!app.notificationCategories?.length) return 0;
	return app.notificationCategories.reduce((sum, cat) => sum + countFor(cat), 0);
}
function badgeLabel(count: number) {
	return count > 99 ? '99+' : String(count);
}

const apps = computed<AppAccent[]>(() => APP_ORDER.map((id) => accents.value[id]));
const footer = computed<AppAccent[]>(() => APP_FOOTER_ORDER.map((id) => accents.value[id]));

const activeId = computed(() => {
	const path = route.path;
	if (path.startsWith('/account')) return 'account';
	if (path === '/' || path === '/apps' || path === '/apps/') return 'dashboard';
	const seg = path.split('/').filter(Boolean);
	if (seg[0] !== 'apps') return null;
	return seg[1] ?? null;
});

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
	const reach = 110; // px — how far on either side the effect extends
	const max = 0.35;  // chip can grow up to 1 + max = 1.35×
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
/* iOS-app-icon styling — every chip is a rounded square tile in the
 * app's accent colour. Inactive tiles use a light tint (0.15 alpha) so
 * the rail reads colourful at rest. Active tile saturates to a darker
 * shade with a white icon and a colour rim, mirroring how iOS
 * highlights the selected dock icon. */
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
	/* iOS home-screen app icons use a ~22% corner radius (the "squircle"
	 * is approximated with this proportion in CSS). 8px on a 38px chip
	 * gives ~21%, which reads cleanly as "rounded square app icon" rather
	 * than the pill-ish rounded-lg / rounded-xl. */
	border-radius: 8px;
	background: hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.15);
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

/* Sheen overlay from the previous rich treatment isn't used in this
 * simpler iOS-icon style. The rule is kept so the ::after pseudo-element
 * stays inert. */
.app-rail__chip::after {
	display: none;
}

/* Dual-layer icon (base + highlight mask) was for the rich glass
 * treatment. The iOS-icon style uses a single solid-colour glyph, so
 * the highlight layer is hidden via CSS. Template is intact so the
 * richer look can be restored later without re-adding markup. */
.app-rail__icon-highlight-mask {
	display: none;
}

.app-rail--horizontal .app-rail__chip,
.app-rail--floating .app-rail__chip {
	width: 32px;
	height: 32px;
	border-radius: 7px;
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
	/* Inactive icons render in the app's accent colour against the light
	 * tinted bg — the chip reads as a coloured tile, like an iOS icon.
	 * The active state below switches the icon to white when the tile
	 * darkens. */
	color: hsl(var(--rail-h) var(--rail-s) var(--rail-l));
	z-index: 0;
}

/* Highlight wrapper — applies the gradient mask. Putting the mask on the
 * wrapper (not the Icon) avoids overriding Nuxt Icon's own internal
 * mask-image (which is what makes the icon shape). The Icon inside still
 * renders normally; the wrapper's mask just clips the bottom away. */
.app-rail__icon-highlight-mask {
	-webkit-mask-image: linear-gradient(180deg, black 0%, rgba(0, 0, 0, 0.5) 35%, transparent 70%);
	mask-image: linear-gradient(180deg, black 0%, rgba(0, 0, 0, 0.5) 35%, transparent 70%);
	pointer-events: none;
	z-index: 1;
}

.app-rail__icon-highlight {
	display: block;
	width: 100%;
	height: 100%;
	color: hsl(0 0% 100% / 0.8);
}

/* Hover — strengthen the accent tint so the chip lights up under the
 * cursor. Icon stays in the accent colour; only the bg shifts. */
.app-rail__item:hover .app-rail__chip {
	background: hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.25);
	transform: translateY(-1px);
}

.app-rail__item:hover {
	@apply text-foreground;
}

/* ── Active state ────────────────────────────────────────────────── */
/* Active: tile saturates to a deeper shade of the accent and the icon
 * flips to white — like the highlighted iOS dock icon. A 1.5px rim at
 * the true accent colour with a 2px offset gives the "selected" ring
 * back from the original design. */
.app-rail__item--active {
	@apply text-foreground;
}

.app-rail__item--active .app-rail__chip {
	background: hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 12%));
	transform: translateY(-1px);
	box-shadow:
		/* Subtle top-edge highlight — light catching the rim of the tile. */
		inset 0 0.5px 0 hsl(0 0% 100% / 0.35),
		/* Tinted drop shadow that grounds the tile against the rail. */
		0 3px 10px -3px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.4);
	/* Colour rim with a small breathing gap — restores the "selected"
	 * outline cue from the previous design without bringing back the
	 * heavy gradient + sheen treatment. */
	outline: 1.5px solid hsl(var(--rail-h) var(--rail-s) var(--rail-l));
	outline-offset: 2px;
}

.app-rail__item--active .app-rail__icon-base {
	color: hsl(0 0% 100%);
}

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
	background: var(--cyan, #06b6d4);
	color: white;
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

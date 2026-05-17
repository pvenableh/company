<script setup lang="ts">
/**
 * PortalRail — top-level navigation rail for the client portal.
 *
 * Mirrors `AppRail` exactly so the portal shell shares the same iOS
 * liquid-glass language as the main apps shell. Icons + colours come
 * from `usePortalAccent` (single source of truth) and the active
 * `useAppPalette` palette — switching palettes in Appearance re-skins
 * the portal the same way it re-skins the main rail.
 *
 * Visibility: items whose `availabilityKey` returns false from
 * `/api/portal/nav-availability` are hidden so clients without social
 * data, marketing data, etc. don't see dead rail entries.
 *
 * Position respects `useAppsMode().railPosition` — the portal reuses
 * the same per-user preference as the main app so the user's chosen
 * rail layout follows them between shells. Every position renders as a
 * fixed glass pill hugging the chosen edge.
 *
 * Mobile (< md) forces bottom via useAppsMode.
 */
import { useMediaQuery } from '@vueuse/core';
import {
	formatIconColor,
	getPaletteChrome,
	iconHighlightForAccent,
} from '~/composables/useAppAccent';
import { useAppPalette } from '~/composables/useAppPalette';
import {
	PORTAL_ORDER,
	PORTAL_FOOTER_ORDER,
	usePortalAccent,
	type PortalAppAccent,
} from '~/composables/usePortalAccent';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

const route = useRoute();
const { railPosition, railShowLabels } = useAppsMode();
const { accents: portalAccents, activeAppId } = usePortalAccent();
const { palette, glassChrome } = useAppPalette();
const { user } = useDirectusAuth();
const { countFor } = useUnreadByCategory();

/** Active chip rendering mode — `palette` for gradient chips, `neutral`
 *  for the frosted-grey-with-accent-icon look. Glass-chrome toggle is
 *  orthogonal: when ON it forces neutral regardless of palette. */
const chipMode = computed(() => {
	if (glassChrome.value) return 'neutral';
	return getPaletteChrome(palette.value).chipMode;
});

function badgeFor(app: PortalAppAccent): number {
	if (!app.notificationCategories?.length) return 0;
	return app.notificationCategories.reduce((sum, cat) => sum + countFor(cat), 0);
}
function badgeLabel(count: number) {
	return count > 99 ? '99+' : String(count);
}

// Availability: which portal apps have data for the active client.
// The endpoint returns `{ progress, billing, performance, messages }`
// as booleans. Defaults to "show everything" so the rail never
// flickers empty on first paint.
type AvailabilityKey = NonNullable<PortalAppAccent['availabilityKey']>;
const availability = ref<Partial<Record<AvailabilityKey, boolean>>>({
	progress: true,
	billing: true,
	performance: true,
	messages: true,
});

async function loadAvailability() {
	if (!user.value) return;
	try {
		availability.value = await $fetch('/api/portal/nav-availability');
	} catch {
		// Keep defaults — better to show optional items than confuse the user.
	}
}

onMounted(() => {
	if (import.meta.client) loadAvailability();
});
watch(() => user.value?.id, (id) => {
	if (id) loadAvailability();
});

function shouldShow(app: PortalAppAccent): boolean {
	if (!app.availabilityKey) return true;
	return availability.value[app.availabilityKey] !== false;
}

const apps = computed<PortalAppAccent[]>(() =>
	PORTAL_ORDER.map((id) => portalAccents.value[id]).filter(shouldShow),
);
const footer = computed<PortalAppAccent[]>(() =>
	PORTAL_FOOTER_ORDER.map((id) => portalAccents.value[id]).filter(shouldShow),
);

const activeId = computed(() => activeAppId.value);

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

function styleFor(app: PortalAppAccent) {
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
// vertical rails — only horizontal pills (top/bottom) light up.
const railEl = ref<HTMLElement | null>(null);
const isLargeHoverCapable = useMediaQuery('(min-width: 980px) and (any-hover: hover) and (any-pointer: fine)');
const magnifyEnabled = computed(() => isHorizontal.value && isLargeHoverCapable.value);

const itemScales = reactive<Record<string, number>>({});
const itemShifts = reactive<Record<string, number>>({});

// Tracks how far the outermost chips poke past the rail's natural edges
// at peak magnification so we can grow the pill background to envelope
// them. Mirrors AppRail's handling.
const magnifyPadLeft = ref(0);
const magnifyPadRight = ref(0);

function applyMagnification(clientX: number) {
	const root = railEl.value;
	if (!root) return;
	const items = root.querySelectorAll<HTMLElement>('[data-app-id]');
	const reach = 160;
	const max = 0.65;
	const chipBase = 32;

	const data: Array<{ id: string; scale: number }> = [];
	items.forEach((el) => {
		const id = el.getAttribute('data-app-id');
		if (!id) return;
		const rect = el.getBoundingClientRect();
		const center = rect.left + rect.width / 2;
		const dx = Math.abs(clientX - center);
		const t = dx >= reach ? 0 : 1 - dx / reach;
		const eased = t * t * (3 - 2 * t);
		const scale = 1 + eased * max;
		data.push({ id, scale });
	});

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

function railMagnifyStyle() {
	if (!magnifyEnabled.value) return undefined;
	if (magnifyPadLeft.value === 0 && magnifyPadRight.value === 0) return undefined;
	const base = 16;
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

function itemMagnifyStyle(appId: string) {
	if (!magnifyEnabled.value) return undefined;
	const x = itemShifts[appId] ?? 0;
	if (Math.abs(x) < 0.25) return undefined;
	return { transform: `translateX(${x.toFixed(2)}px)` };
}

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
			aria-label="Portal sections"
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
						<TooltipContent v-if="showTooltip" :side="tooltipSide" :side-offset="8">
							{{ app.name }}
						</TooltipContent>
					</Tooltip>
				</li>
			</ul>

			<ul class="app-rail__group app-rail__group--footer">
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

/* Styles are a 1:1 mirror of AppRail's so the portal shell shares the
 * same iOS liquid-glass language as the main app. Keep these in lockstep —
 * only the route list + availability gating differ between the two rails. */

.app-rail {
	@apply flex bg-background border-border/40 select-none;
	--rail-gap: 8px;
}

/* ── Layout ──────────────────────────────────────────────────────── */
.app-rail--horizontal {
	@apply flex-row px-3 py-1.5 justify-center items-center;
	overflow: visible;
	column-gap: 2px;
	transition: padding 80ms ease-out;
}

@media (max-width: 767px) {
	.app-rail--horizontal {
		@apply px-1.5 py-1;
		column-gap: 0;
	}
	.app-rail--horizontal .app-rail__item {
		padding: 4px 4px;
	}
}

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
		backdrop-blur-md
		w-auto;
	background: hsl(220 14% 95% / 0.78);
	box-shadow:
		0 4px 14px -6px hsl(0 0% 0% / 0.18),
		0 2px 6px -2px hsl(0 0% 0% / 0.08);
}

.dark .app-rail--top,
.dark .app-rail--bottom,
.dark .app-rail--left,
.dark .app-rail--right {
	/* Match the .glass header backdrop (rgba(40,40,40,0.88)) so the rail
	 * reads as the same plinth as the chrome above it in dark mode. */
	background: rgba(40, 40, 40, 0.88);
}

.app-rail--top,
.app-rail--bottom {
	@apply left-1/2 -translate-x-1/2;
}

.app-rail--top {
	top: calc(56px + 0.75rem);
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

/* ── Item ─────────────────────────────────────────────────────────── */
.app-rail__item {
	@apply flex flex-col items-center justify-center
		rounded-lg
		text-muted-foreground
		no-underline;
	padding: 2px;
	will-change: transform;
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

.app-rail--horizontal:not(.app-rail--icons-only) .app-rail__item {
	width: 48px;
}

.app-rail--vertical .app-rail__item {
	padding: 4px 2px;
}

/* ── Chip ────────────────────────────────────────────────────────── */
.app-rail__chip {
	@apply flex items-center justify-center shrink-0;
	transition:
		background 200ms cubic-bezier(0.16, 1, 0.3, 1),
		transform 80ms ease-out,
		box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
	position: relative;
	width: 38px;
	height: 38px;
	border-radius: 50%;
	background: linear-gradient(
		160deg,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 12%)) 0%,
		hsl(var(--rail-h) var(--rail-s) var(--rail-l)) 55%,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 8%)) 100%
	);
	box-shadow:
		inset 0 1px 0 hsl(0 0% 100% / 0.28),
		inset 0 -1px 0 hsl(0 0% 0% / 0.08),
		0 1px 2px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.25);
}

.app-rail--top .app-rail__chip { transform-origin: center top; }
.app-rail--bottom .app-rail__chip { transform-origin: center bottom; }
.app-rail--left .app-rail__chip { transform-origin: left center; }
.app-rail--right .app-rail__chip { transform-origin: right center; }

.app-rail__chip::after {
	content: none;
}

.app-rail__icon-layer.app-rail__icon-highlight-mask {
	display: none;
}

.app-rail--horizontal .app-rail__chip,
.app-rail--vertical .app-rail__chip {
	width: 32px;
	height: 32px;
}

.app-rail__icon {
	@apply relative inline-block;
	width: 22px;
	height: 22px;
	z-index: 2;
	transition: transform 0.2s ease;
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
	color: var(--rail-icon, hsl(0 0% 100%));
	z-index: 0;
}

/* Hover */
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
.app-rail__item--active {
	@apply text-foreground;
}

.app-rail__item--active .app-rail__chip {
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
	outline: 1.25px solid hsl(var(--rail-h) var(--rail-s) var(--rail-l));
	outline-offset: 2px;
}

.app-rail__item--active .app-rail__icon-base {
	color: var(--rail-icon, hsl(0 0% 100%));
}

/* ── Neutral chip mode ───────────────────────────────────────────── */
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

.dark .app-rail[data-chip-mode='neutral'] .app-rail__icon-base {
	color: var(--rail-icon-bright, hsl(0 0% 92%));
}

.dark .app-rail[data-chip-mode='neutral'] .app-rail__item--active .app-rail__icon-base {
	color: hsl(0 0% 100%);
}

/* ── Label ───────────────────────────────────────────────────────── */
.app-rail--vertical .app-rail__label,
.app-rail--icons-only .app-rail__label {
	@apply sr-only;
}

@media (max-width: 767px) {
	.app-rail--horizontal .app-rail__label {
		@apply sr-only;
	}
}

.app-rail__label {
	font-size: 8px;
	font-weight: 600;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	line-height: 1;
	color: hsl(var(--muted-foreground));
	transition: color 0.2s ease;
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

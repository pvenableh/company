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
			aria-label="Apps"
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
								:aria-label="app.name"
							>
								<span class="app-rail__chip">
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
								:aria-label="app.name"
							>
								<span class="app-rail__chip">
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

.app-rail--horizontal {
	@apply flex-row w-full px-3 py-1.5 overflow-x-auto justify-center items-center;
	column-gap: 14px;
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
	column-gap: 4px;
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
/* iOS-style liquid glass — diagonal dark wash from bottom-right gives
 * the tile weight; a white plus-lighter sheen from the top-left adds
 * Apple's signature highlight and brightens the icon glyph beneath. */
.app-rail__chip {
	@apply flex items-center justify-center shrink-0
		rounded-md
		transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)];
	position: relative;
	width: 32px;
	height: 32px;
	background:
		/* heavier angled dark wash for that submerged iOS look */
		linear-gradient(335deg, rgba(0, 0, 0, 0.32) 0%, rgba(0, 0, 0, 0.08) 60%),
		/* deeper colored gradient — lightness shifts noticeably darker */
		linear-gradient(
			155deg,
			hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.85),
			hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 10%) / 0.78) 55%,
			hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 22%) / 0.7)
		);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	box-shadow:
		/* inset bottom shadow — depth from underneath */
		inset 0 -1.5px 2px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 35%) / 0.45),
		/* inset top-edge highlight — light catching the rim */
		inset 0 0.5px 0 hsl(0 0% 100% / 0.45),
		/* hairline accent rim */
		0 0 0 0.5px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 12%) / 0.5) inset,
		/* soft tinted drop shadow */
		0 2px 8px -2px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.3);
}

/* White sheen overlay — plus-lighter is Apple's signature blend mode for
 * liquid glass. Brightens both the chip's top-left and the icon glyph
 * beneath without washing out the rest of the tile. */
.app-rail__chip::after {
	content: '';
	position: absolute;
	inset: 0;
	border-radius: inherit;
	background: linear-gradient(
		335deg,
		hsl(0 0% 100% / 0) 50%,
		hsl(0 0% 100% / 0.18) 80%,
		hsl(0 0% 100% / 0.42) 100%
	);
	mix-blend-mode: plus-lighter;
	pointer-events: none;
}

.app-rail--horizontal .app-rail__chip,
.app-rail--floating .app-rail__chip {
	width: 26px;
	height: 26px;
}

/* Icon wrapper stacks two copies of the SVG. The base layer carries the
 * accent color; the highlight layer is white, masked to a fade so it only
 * shows in the top portion of the glyph. The composite reads as a true
 * gradient INSIDE the icon shape (light top → accent bottom). */
.app-rail__icon {
	@apply relative inline-block;
	width: 18px;
	height: 18px;
	z-index: 2;
	transition: transform 0.2s ease;
}

.app-rail--horizontal .app-rail__icon,
.app-rail--floating .app-rail__icon {
	width: 17px;
	height: 17px;
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
	/* Push the icon much lighter than the chip base so it pops against the
	 * deeper colored backdrop. */
	color: hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 32%));
	filter: drop-shadow(0 1.5px 2px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 18%) / 0.6));
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

/* Hover lift — raise 1px and brighten the rim/sheen. */
.app-rail__item:hover .app-rail__chip {
	transform: translateY(-1px);
	box-shadow:
		0 0 0 0.5px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 14%) / 0.5) inset,
		0 1px 0 0 hsl(0 0% 100% / 0.65) inset,
		0 4px 12px -2px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.3);
}

/* On hover-capable devices, surface the same colored ring preview as the
 * active state — at lower opacity so it reads as "hint" not "selected".
 * Excluded from touch devices via @media (hover: hover). */
@media (hover: hover) {
	.app-rail__item:not(.app-rail__item--active):hover .app-rail__chip {
		outline: 1.5px solid hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.55);
		outline-offset: 2px;
	}
}

.app-rail__item:hover {
	@apply text-foreground;
}

/* ── Active state ────────────────────────────────────────────────── */
/* Active: glass becomes brighter + more saturated, icon deepens slightly. */
.app-rail__item--active {
	@apply text-foreground;
}

.app-rail__item--active .app-rail__chip {
	background:
		linear-gradient(335deg, rgba(0, 0, 0, 0.36) 0%, rgba(0, 0, 0, 0.1) 60%),
		linear-gradient(
			155deg,
			hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 4%) / 0.95),
			hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 10%) / 0.88) 55%,
			hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 22%) / 0.82)
		);
	box-shadow:
		inset 0 -1.5px 2px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 35%) / 0.5),
		inset 0 0.5px 0 hsl(0 0% 100% / 0.55),
		0 0 0 0.5px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 12%) / 0.65) inset,
		0 4px 14px -2px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.45);
	/* Floating ring at the app's true color with a small breathing gap.
	 * outline-offset adds the gap; outline itself draws the colored ring. */
	outline: 1.5px solid hsl(var(--rail-h) var(--rail-s) var(--rail-l));
	outline-offset: 2px;
}

.app-rail__item--active .app-rail__chip::after {
	background: linear-gradient(
		335deg,
		hsl(0 0% 100% / 0) 45%,
		hsl(0 0% 100% / 0.22) 78%,
		hsl(0 0% 100% / 0.5) 100%
	);
}

.app-rail__item--active .app-rail__icon-base {
	color: hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 38%));
	filter: drop-shadow(0 1.5px 3px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 20%) / 0.65));
}

.app-rail__item--active .app-rail__icon-highlight {
	color: hsl(0 0% 100% / 0.85);
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

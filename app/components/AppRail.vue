<script setup lang="ts">
/**
 * AppRail — top-level navigation rail for Apps Layout mode.
 *
 * Icons + colours come from `useAppAccent` (single source of truth). Active
 * chip uses the per-app accent at full saturation; inactive items echo the
 * accent in their icon tint at low opacity so the rail still reads as a
 * coloured palette without active state.
 *
 * Position respects `useAppsMode().railPosition`:
 *   left / right → vertical column with footer pinned to bottom
 *   top / bottom → horizontal strip, footer wraps to the right
 *   floating     → glass + shadow pill, bottom-center
 *
 * Mobile (< md) forces bottom via useAppsMode.
 */
import { APP_ACCENTS, APP_ORDER, APP_FOOTER_ORDER, type AppAccent } from '~/composables/useAppAccent';

const route = useRoute();
const { railPosition } = useAppsMode();

const apps = computed<AppAccent[]>(() => APP_ORDER.map((id) => APP_ACCENTS[id]));
const footer = computed<AppAccent[]>(() => APP_FOOTER_ORDER.map((id) => APP_ACCENTS[id]));

const activeId = computed(() => {
	const path = route.path;
	if (path.startsWith('/account')) return 'account';
	const seg = path.split('/').filter(Boolean);
	if (seg[0] !== 'apps') return null;
	return seg[1] ?? null;
});

const isHorizontal = computed(() =>
	railPosition.value === 'top'
	|| railPosition.value === 'bottom'
	|| railPosition.value === 'floating',
);

function styleFor(app: AppAccent) {
	return {
		'--rail-h': String(app.h),
		'--rail-s': `${app.s}%`,
		'--rail-l': `${app.l}%`,
	};
}
</script>

<template>
	<nav
		class="app-rail"
		:class="[
			`app-rail--${railPosition}`,
			isHorizontal ? 'app-rail--horizontal' : 'app-rail--vertical',
		]"
		aria-label="Apps"
	>
		<ul class="app-rail__group app-rail__group--main">
			<li v-for="app in apps" :key="app.id">
				<NuxtLink
					:to="app.to"
					class="app-rail__item"
					:class="{ 'app-rail__item--active': activeId === app.id }"
					:style="styleFor(app)"
					:title="app.name"
					:aria-label="app.name"
				>
					<span class="app-rail__chip">
						<Icon :name="app.icon" class="app-rail__icon" />
					</span>
					<span class="app-rail__label">{{ app.name }}</span>
				</NuxtLink>
			</li>
		</ul>

		<span class="app-rail__divider" aria-hidden="true" />

		<ul class="app-rail__group app-rail__group--footer">
			<li v-for="app in footer" :key="app.id">
				<NuxtLink
					:to="app.to"
					class="app-rail__item"
					:class="{ 'app-rail__item--active': activeId === app.id }"
					:style="styleFor(app)"
					:title="app.name"
					:aria-label="app.name"
				>
					<span class="app-rail__chip">
						<Icon :name="app.icon" class="app-rail__icon" />
					</span>
					<span class="app-rail__label">{{ app.name }}</span>
				</NuxtLink>
			</li>
		</ul>
	</nav>
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
.app-rail--top { @apply border-b; }
.app-rail--bottom { @apply border-t pb-[env(safe-area-inset-bottom)]; }

.app-rail--floating {
	@apply fixed left-1/2 -translate-x-1/2 z-40
		flex-row items-center
		rounded-full border border-border/40 shadow-2xl
		bg-background/85 backdrop-blur-md
		px-2 py-1.5 w-auto;
	bottom: calc(1rem + env(safe-area-inset-bottom));
	column-gap: 6px;
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
.app-rail__chip {
	@apply flex items-center justify-center shrink-0
		rounded-lg
		transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)];
	width: 32px;
	height: 32px;
	background: hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.08);
}

.app-rail--horizontal .app-rail__chip,
.app-rail--floating .app-rail__chip {
	width: 26px;
	height: 26px;
}

.app-rail__icon {
	@apply size-4;
	stroke-width: 1.75;
	color: hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 4%));
	transition: color 0.2s ease, transform 0.2s ease;
}

.app-rail--horizontal .app-rail__icon,
.app-rail--floating .app-rail__icon {
	@apply size-[15px];
}

/* Hover lift — fill the chip with a stronger tint, raise it 1px. */
.app-rail__item:hover .app-rail__chip {
	transform: translateY(-1px);
	background: hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.16);
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
		135deg,
		hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 8%)),
		hsl(var(--rail-h) var(--rail-s) var(--rail-l))
	);
	box-shadow:
		0 1px 0 0 hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 14%) / 0.5) inset,
		0 6px 14px -8px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.6);
	transform: none;
}

.app-rail__item--active .app-rail__icon {
	color: white;
}

/* ── Label ───────────────────────────────────────────────────────── */
/* Vertical rail is icon-only; the title-attribute tooltip carries the
 * label. Horizontal mode keeps labels inline. Floating stays icon-only. */
.app-rail--vertical .app-rail__label,
.app-rail--floating .app-rail__label {
	@apply sr-only;
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
</style>

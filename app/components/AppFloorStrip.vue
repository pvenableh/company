<script setup lang="ts" generic="K extends string">
/**
 * AppFloorStrip — shared per-app sub-navigation.
 *
 * The "floors" of an app (Gantt / Projects / Tasks / Tickets ... in Work,
 * Cash flow / Invoices / ... in Money) render as a pill-segmented control.
 * Picks up `--app-accent-h/s/l` from an ancestor (the apps shell sets these
 * from `useAppAccent`) so the active pill matches the rail.
 *
 * Renders a single absolutely-positioned thumb that slides between segments
 * with the universal iOS spring (`cubic-bezier(0.36, 0.66, 0.04, 1) @
 * 400ms`). Variable-width measurement handles labels of differing length.
 * Buttons themselves are transparent; only the thumb carries the accent
 * gradient. Mirrors AppSegmentedControl's pattern so every tab switch in
 * the product reads as one nav family.
 *
 * Sticky-positioned by default so the strip stays reachable while users
 * scroll long floors. Hosts can pass `:sticky="false"` to opt out.
 */

import { nextTick, onMounted, onUnmounted, ref, watch, computed } from 'vue';

const { tap } = useHaptic();

interface FloorItem<TKey extends string> {
	key: TKey;
	label: string;
	icon: string;
}

const props = withDefaults(
	defineProps<{
		modelValue: K;
		items: FloorItem<K>[];
		sticky?: boolean;
		ariaLabel?: string;
	}>(),
	{
		sticky: true,
		ariaLabel: 'Sections',
	},
);

const emit = defineEmits<{
	(e: 'update:modelValue', value: K): void;
}>();

// ── Sliding thumb ──────────────────────────────────────────────────
// We measure each segment after mount + when items change + on resize,
// then compute the active segment's left/width. The thumb transitions
// to those values via CSS (400ms iOS curve), giving a true "slide"
// rather than the previous snap-to-new-element behavior.
const scrollerEl = ref<HTMLElement | null>(null);
const itemRefs = ref<HTMLElement[]>([]);
const segMetrics = ref<{ left: number; width: number }[]>([]);

function setItemRef(idx: number) {
	return (el: any) => {
		if (el) itemRefs.value[idx] = el as HTMLElement;
	};
}

function measure() {
	const els = itemRefs.value.filter(Boolean);
	if (!els.length) return;
	segMetrics.value = els.map((el) => ({ left: el.offsetLeft, width: el.offsetWidth }));
}

const activeIndex = computed(() => Math.max(0, props.items.findIndex((i) => i.key === props.modelValue)));

const thumbStyle = computed(() => {
	const m = segMetrics.value[activeIndex.value];
	if (!m) return { opacity: '0' } as Record<string, string>;
	return {
		left: `${m.left}px`,
		width: `${m.width}px`,
		opacity: '1',
	} as Record<string, string>;
});

let ro: ResizeObserver | null = null;
onMounted(() => {
	nextTick(measure);
	if (scrollerEl.value && typeof ResizeObserver !== 'undefined') {
		ro = new ResizeObserver(() => measure());
		ro.observe(scrollerEl.value);
	}
});
onUnmounted(() => {
	ro?.disconnect();
	ro = null;
});

watch(() => props.items, () => nextTick(measure), { deep: true });
watch(() => props.modelValue, () => nextTick(measure));
</script>

<template>
	<div
		class="app-floor-strip"
		:class="{ 'app-floor-strip--sticky': sticky }"
		role="tablist"
		:aria-label="ariaLabel"
	>
		<div ref="scrollerEl" class="app-floor-strip__scroller">
			<div class="app-floor-strip__thumb" aria-hidden="true" :style="thumbStyle" />
			<button
				v-for="(seg, idx) in items"
				:key="seg.key"
				:ref="setItemRef(idx)"
				type="button"
				role="tab"
				:aria-selected="modelValue === seg.key"
				class="app-floor-strip__item"
				:class="{ 'app-floor-strip__item--active': modelValue === seg.key }"
				@click="modelValue !== seg.key && (emit('update:modelValue', seg.key), tap())"
			>
				<EarnestIcon v-if="seg.icon === 'earnest'" class="app-floor-strip__icon" />
				<Icon v-else :name="seg.icon" class="app-floor-strip__icon" />
				<span class="app-floor-strip__label">{{ seg.label }}</span>
			</button>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-floor-strip {
	@apply -mx-1 mb-5 flex;
	/* Local fallback so a stray instance outside the apps shell still renders. */
	--accent-h: var(--app-accent-h, 220);
	--accent-s: var(--app-accent-s, 10%);
	--accent-l: var(--app-accent-l, 48%);
}

.app-floor-strip--sticky {
	@apply sticky top-0 z-20 -mt-1 pt-1 pb-1 px-1
		bg-gradient-to-b from-background via-background to-background/80
		backdrop-blur-sm;
}

.app-floor-strip__scroller {
	@apply relative inline-flex items-center gap-0 rounded-full
		border border-border bg-card p-1
		overflow-x-auto max-w-full;
	scrollbar-width: none;
}

.app-floor-strip__scroller::-webkit-scrollbar {
	display: none;
}

/* Sliding thumb — single absolutely-positioned pill that morphs between
 * segments. Carries the accent-gradient that used to live on each item.
 * The CSS transition (400ms iOS curve on left + width) makes the switch
 * read as a slide rather than a snap. Mirrors AppSegmentedControl. */
.app-floor-strip__thumb {
	position: absolute;
	top: 4px;
	bottom: 4px;
	left: 0;
	width: 0;
	border-radius: 9999px;
	background: linear-gradient(
		135deg,
		hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 8%)),
		hsl(var(--accent-h) var(--accent-s) var(--accent-l))
	);
	box-shadow:
		0 1px 0 0 hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 14%) / 0.5) inset,
		0 4px 12px -6px hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.55);
	transition:
		left 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
		width 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
		opacity 200ms ease;
	pointer-events: none;
	z-index: 0;
}
@media (prefers-reduced-motion: reduce) {
	.app-floor-strip__thumb { transition: opacity 120ms ease; }
}

.app-floor-strip__item {
	position: relative;
	z-index: 1;
	@apply inline-flex items-center gap-1.5 rounded-full
		px-4 py-2 text-xs font-medium whitespace-nowrap
		text-muted-foreground transition-colors duration-200
		ease-[cubic-bezier(0.16,1,0.3,1)];
	background: transparent;
	min-height: 36px;
}

.app-floor-strip__item:hover {
	@apply text-foreground;
}

.app-floor-strip__icon {
	@apply size-3.5 shrink-0;
	stroke-width: 1.85;
}

.app-floor-strip__label {
	@apply leading-none;
}

/* Active state: just color the text white — the gradient pill is the
 * sliding thumb behind, not the button's own background. */
.app-floor-strip__item--active {
	color: white;
}

.app-floor-strip__item--active:hover {
	color: white;
}

/* Neutral palette + Glass-toggle override — per-app accent vars are flat
 * grey for the Neutral palette (since its sourceColors are all grey), so
 * the default gradient would render as white-on-grey gradient → invisible.
 * Force the thumb onto `--primary` for those modes.
 *
 * `html[…]` prefix lifts specificity above the scoped style attribute. */
html[data-chip-mode='neutral'] .app-floor-strip__thumb,
html[data-surface='glass'] .app-floor-strip__thumb {
	background: linear-gradient(
		135deg,
		hsl(var(--primary) / 0.92),
		hsl(var(--primary))
	);
	box-shadow:
		0 1px 0 0 hsl(var(--primary) / 0.4) inset,
		0 4px 12px -6px hsl(var(--primary) / 0.55);
}
</style>

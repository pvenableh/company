<!--
  Shared tab pill row for the project surface. Both the full-page detail
  and the slide-over render the same tabs with the same counts so the two
  surfaces stay aligned. Mirrors `ClientTabsBar`.

  Carries the same sliding-thumb animation as the app floor nav
  (AppFloorStrip): one absolutely-positioned pill slides between tabs on the
  iOS spring, so switching tabs reads as one nav family across the product.
-->
<script setup lang="ts">
export type ProjectTabKey =
	| 'overview'
	| 'timeline'
	| 'activity'
	| 'touchpoints'
	| 'tasks'
	| 'tickets'
	| 'channels'
	| 'meetings'
	| 'invoices'
	| 'library'
	| 'contacts';

const props = defineProps<{
	modelValue: ProjectTabKey;
	counts: Partial<Record<ProjectTabKey, number>>;
}>();

const emit = defineEmits<{
	(e: 'update:modelValue', value: ProjectTabKey): void;
	(e: 'prefetch', value: ProjectTabKey): void;
}>();

// Hovering/focusing a tab is a strong signal of intent — fire `prefetch`
// so the parent can warm the lazy loader before the click lands. Dedupe
// per-key so a wandering cursor doesn't re-emit on every mouse re-entry.
const _prefetched = new Set<ProjectTabKey>();
function prefetch(key: ProjectTabKey) {
	if (_prefetched.has(key)) return;
	_prefetched.add(key);
	emit('prefetch', key);
}

const tabs: Array<{ key: ProjectTabKey; label: string; icon: string }> = [
	{ key: 'overview', label: 'Overview', icon: 'lucide:info' },
	{ key: 'timeline', label: 'Timeline', icon: 'lucide:gantt-chart' },
	{ key: 'tasks', label: 'Tasks', icon: 'lucide:check-square' },
	{ key: 'tickets', label: 'Tickets', icon: 'lucide:ticket' },
	{ key: 'touchpoints', label: 'Touchpoints', icon: 'lucide:megaphone' },
	{ key: 'channels', label: 'Channels', icon: 'lucide:message-square' },
	{ key: 'meetings', label: 'Meetings', icon: 'lucide:video' },
	{ key: 'invoices', label: 'Invoices', icon: 'lucide:file-text' },
	{ key: 'library', label: 'Files & Docs', icon: 'lucide:files' },
	{ key: 'contacts', label: 'Contacts', icon: 'lucide:user-circle' },
	// Activity lives last — the deepest history, not the landing view.
	{ key: 'activity', label: 'Activity', icon: 'lucide:activity' },
];

const HAS_COUNT = (key: ProjectTabKey) => !['overview', 'timeline', 'activity'].includes(key);

// ── Sliding thumb (mirrors AppFloorStrip) ──────────────────────────────
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

const activeIndex = computed(() => Math.max(0, tabs.findIndex((t) => t.key === props.modelValue)));

const thumbStyle = computed(() => {
	const m = segMetrics.value[activeIndex.value];
	if (!m) return { opacity: '0' } as Record<string, string>;
	return { left: `${m.left}px`, width: `${m.width}px`, opacity: '1' } as Record<string, string>;
});

// Keep the active tab scrolled into view when it changes off-screen (e.g.
// deep-links to Contacts/Activity, or a directional switch past the fold).
watch(() => props.modelValue, () => {
	nextTick(() => {
		measure();
		itemRefs.value[activeIndex.value]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
	});
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
</script>

<template>
	<!-- One horizontal, swipeable row that scrolls instead of wrapping into
	     stacked rows on narrow screens. The thumb slides between tabs. -->
	<div ref="scrollerEl" class="project-tabs relative flex flex-nowrap items-center gap-1 overflow-x-auto -mx-1 px-1 scrollbar-hide">
		<!-- Sliding thumb — one pill morphs between tabs on the iOS spring. -->
		<div class="project-tabs__thumb" aria-hidden="true" :style="thumbStyle" />
		<button
			v-for="(tab, idx) in tabs"
			:key="tab.key"
			:ref="setItemRef(idx)"
			class="project-tabs__item"
			:class="{ 'project-tabs__item--active': modelValue === tab.key }"
			@click="$emit('update:modelValue', tab.key)"
			@mouseenter="prefetch(tab.key)"
			@focus="prefetch(tab.key)"
			@touchstart.passive="prefetch(tab.key)"
		>
			<Icon :name="tab.icon" class="w-3.5 h-3.5 shrink-0" />
			{{ tab.label }}
			<span v-if="HAS_COUNT(tab.key) && counts[tab.key] !== undefined" class="text-[10px] opacity-70 ml-0.5">
				{{ counts[tab.key] }}
			</span>
		</button>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.project-tabs__item {
	position: relative;
	z-index: 1;
	@apply inline-flex shrink-0 items-center gap-2 h-8 px-3.5 rounded-full
		text-xs font-medium whitespace-nowrap text-muted-foreground
		transition-colors duration-200;
	background: transparent;
}
.project-tabs__item:hover {
	@apply text-foreground;
}
.project-tabs__item--active {
	color: hsl(var(--primary-foreground));
}
.project-tabs__item--active:hover {
	color: hsl(var(--primary-foreground));
}

/* Sliding thumb — a single primary pill that slides + resizes between tabs
 * on the universal iOS spring (matches AppFloorStrip). Buttons are
 * transparent; only the thumb carries the fill. */
.project-tabs__thumb {
	position: absolute;
	top: 0;
	height: 2rem; /* h-8 */
	left: 0;
	width: 0;
	border-radius: 9999px;
	background: hsl(var(--primary));
	box-shadow: 0 4px 12px -6px hsl(var(--primary) / 0.5);
	transition:
		left 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
		width 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
		opacity 200ms ease;
	pointer-events: none;
	z-index: 0;
}
@media (prefers-reduced-motion: reduce) {
	.project-tabs__thumb {
		transition: opacity 120ms ease;
	}
}
</style>

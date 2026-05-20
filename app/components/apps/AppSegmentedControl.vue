<script setup lang="ts" generic="T extends string | number">
/**
 * Shared iOS-style segmented control. One rounded-rect track + a single
 * sliding thumb pseudo-element driven by --active-index. The thumb uses the
 * universal iOS spring curve (cubic-bezier(0.36, 0.66, 0.04, 1) @ 400ms) so
 * every tab switch in the product reads as one nav family.
 *
 * Two layout modes:
 *   - "equal" (default): grid columns sized 1fr, thumb width = (100% - 6px) / count
 *   - "variable": JS-measures each segment, thumb left/width pulled from the
 *     active segment's bounding box. Use for pill rows where labels differ
 *     in length and equal-width would look uneven (e.g. Studio approval-state).
 *
 * Labels collapse to icon-only under 520px viewport. Tap-target press
 * feedback (scale 0.97) is built in.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

interface Tab<V> {
  key: V;
  label: string;
  icon?: string;
  /** Optional badge count rendered to the right of the label. */
  count?: number | null;
}

const props = withDefaults(
  defineProps<{
    tabs: Tab<T>[];
    modelValue: T;
    /** "equal" splits the track into fr columns; "variable" measures segments. */
    variableWidth?: boolean;
    /** ARIA label for the tablist. */
    ariaLabel?: string;
  }>(),
  { variableWidth: false, ariaLabel: 'View' },
);

const emit = defineEmits<{ 'update:modelValue': [T] }>();

const { tap } = useHaptic();

const activeIndex = computed(() =>
  Math.max(0, props.tabs.findIndex((t) => t.key === props.modelValue)),
);

function select(tab: Tab<T>) {
  if (tab.key === props.modelValue) return;
  emit('update:modelValue', tab.key);
  tap();
}

// Variable-width: measure each segment after mount, on tab list change, and
// on resize; cache offsetLeft + offsetWidth for the thumb's left/width.
const trackEl = ref<HTMLElement | null>(null);
const itemRefs = ref<HTMLElement[]>([]);
const segMetrics = ref<{ left: number; width: number }[]>([]);

function setItemRef(idx: number) {
  return (el: any) => {
    if (el) itemRefs.value[idx] = el as HTMLElement;
  };
}

function measure() {
  if (!props.variableWidth) return;
  const els = itemRefs.value.filter(Boolean);
  if (!els.length) return;
  segMetrics.value = els.map((el) => ({ left: el.offsetLeft, width: el.offsetWidth }));
}

let ro: ResizeObserver | null = null;
onMounted(() => {
  nextTick(measure);
  if (props.variableWidth && trackEl.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure());
    ro.observe(trackEl.value);
  }
});
onUnmounted(() => {
  ro?.disconnect();
  ro = null;
});

watch(() => props.tabs, () => nextTick(measure), { deep: true });
watch(() => props.variableWidth, () => nextTick(measure));

const thumbStyle = computed(() => {
  if (!props.variableWidth) {
    return {
      '--active-index': String(activeIndex.value),
    } as Record<string, string>;
  }
  const m = segMetrics.value[activeIndex.value];
  if (!m) return { opacity: '0' };
  return {
    left: `${m.left}px`,
    width: `${m.width}px`,
    transform: 'translate3d(0, 0, 0)',
  } as Record<string, string>;
});

const trackStyle = computed(() => ({
  '--tab-count': String(props.tabs.length),
}));
</script>

<template>
  <div
    ref="trackEl"
    class="apps-segmented"
    :class="{ 'apps-segmented--variable': variableWidth }"
    role="tablist"
    :aria-label="ariaLabel"
    :style="trackStyle"
  >
    <div class="apps-segmented__thumb" aria-hidden="true" :style="thumbStyle" />
    <button
      v-for="(tab, idx) in tabs"
      :key="tab.key"
      :ref="setItemRef(idx)"
      type="button"
      role="tab"
      :aria-selected="tab.key === modelValue"
      class="apps-segmented__item"
      :class="{ 'apps-segmented__item--active': tab.key === modelValue }"
      @click="select(tab)"
    >
      <Icon v-if="tab.icon" :name="tab.icon" class="w-3.5 h-3.5" />
      <span class="apps-segmented__label">{{ tab.label }}</span>
      <span
        v-if="tab.count !== undefined && tab.count !== null"
        class="apps-segmented__count"
      >{{ tab.count }}</span>
    </button>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.apps-segmented {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--tab-count, 5), 1fr);
  align-items: stretch;
  gap: 0;
  width: 100%;
  padding: 3px;
  border-radius: 10px;
  background: hsl(var(--muted) / 0.55);
  border: 1px solid hsl(var(--border) / 0.5);
  box-shadow: inset 0 1px 0 rgb(0 0 0 / 0.02);
  -webkit-tap-highlight-color: transparent;
}

/* Variable-width: let segments size to content; thumb is positioned via JS. */
.apps-segmented--variable {
  display: inline-flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  max-width: 100%;
}
.apps-segmented--variable::-webkit-scrollbar { display: none; }

.apps-segmented__thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 6px) / var(--tab-count, 5));
  border-radius: 7px;
  background: hsl(var(--background));
  box-shadow:
    0 0 0 0.5px rgb(0 0 0 / 0.04),
    0 1px 2px rgb(0 0 0 / 0.08),
    0 2px 4px -1px rgb(0 0 0 / 0.04);
  transform: translate3d(calc(var(--active-index, 0) * 100%), 0, 0);
  transition:
    transform 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
    left 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
    width 400ms cubic-bezier(0.36, 0.66, 0.04, 1);
  pointer-events: none;
  z-index: 0;
}

.apps-segmented__item {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 0.5rem;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  transition: color 200ms ease, transform 120ms ease;
  -webkit-tap-highlight-color: transparent;
}

.apps-segmented--variable .apps-segmented__item {
  padding: 0.5rem 0.75rem;
}

.apps-segmented__item:active {
  transform: scale(0.97);
}

.apps-segmented__item--active {
  color: hsl(var(--foreground));
  font-weight: 600;
}

.apps-segmented__label { line-height: 1; }

.apps-segmented__count {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: hsl(var(--muted) / 0.85);
  color: hsl(var(--muted-foreground));
  line-height: 1.2;
}

.apps-segmented__item--active .apps-segmented__count {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

@media (max-width: 520px) {
  .apps-segmented:not(.apps-segmented--variable) .apps-segmented__label { display: none; }
  .apps-segmented:not(.apps-segmented--variable) .apps-segmented__item { gap: 0; }
}
</style>

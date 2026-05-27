<script setup lang="ts" generic="T extends RiverItem">
/**
 * RiverChart — reusable time-on-a-river visualization.
 *
 * Sibling primitive to SocialRiverSurface. Same visual vocabulary
 * (day strip + hour bed + temperature curve + glowing now indicator +
 * channel-tinted breathing leaves) but data-shape-agnostic and read-only.
 *
 * Consumers pass an array of `RiverItem`s with a `when` ISO date, an
 * optional hue (0-360), a label, and an optional icon. The chart places
 * each item as a leaf, runs the temperature curve to expose rhythm gaps,
 * and emits `select` on click.
 *
 * Drag-to-reschedule is intentionally NOT here — SocialRiverSurface keeps
 * its bespoke drag pipeline because it owes mutations to two different
 * endpoints with FLIP-driven detail cards. Other surfaces (campaigns,
 * payments, activity) are display-only and use this component instead.
 */
import { format, startOfDay, addDays, differenceInCalendarDays, parseISO, isSameDay } from 'date-fns';

export interface RiverItem {
  id: string;
  /** When the item lives on the timeline. ISO string. */
  when: string;
  /** Visible label, truncated. */
  label: string;
  /** 0-360 hue. Drives leaf gradient + halo. Defaults to chart accent. */
  hue?: number;
  /** 0-100 saturation %. Defaults to 65. */
  sat?: number;
  /** Lucide icon name. Defaults to a small dot. */
  icon?: string;
  /** Soft-faded leaf (e.g. past, sent, completed). */
  past?: boolean;
  /** Optional sublabel rendered on hover/tooltip. */
  sublabel?: string;
}

const props = withDefaults(defineProps<{
  items: T[];
  /** Days to show before today. */
  daysBack?: number;
  /** Days to show after today. */
  daysForward?: number;
  /** Column width in px. */
  dayWidth?: number;
  /** Hour row height in px. */
  hourHeight?: number;
  /** Accent hue (0-360). Drives water gradient + now glow + temperature curve. */
  accentHue?: number;
  /** Compact variant — smaller heights, no temperature curve. */
  compact?: boolean;
  /** Hide hour rails (good for day-granularity data like campaigns). */
  hideHours?: boolean;
  /** Empty-state copy. */
  emptyTitle?: string;
  emptySubtitle?: string;
  /** Disable inner border + bg so a parent surface can frame it. */
  bare?: boolean;
}>(), {
  daysBack: 7,
  daysForward: 14,
  dayWidth: 168,
  hourHeight: 22,
  accentHue: 220,
  compact: false,
  hideHours: false,
  emptyTitle: 'The river is quiet.',
  emptySubtitle: 'Nothing in this window yet.',
  bare: false,
});

const emit = defineEmits<{
  (e: 'select', item: T): void;
}>();

const TOTAL_DAYS = computed(() => props.daysBack + props.daysForward);
const RIVER_HEIGHT = computed(() => props.hourHeight * 24);
const TEMPERATURE_H = computed(() => (props.compact ? 0 : 56));

const now = useNow({ interval: 60_000 });
const todayStart = computed(() => startOfDay(now.value));
const rangeStart = computed(() => addDays(todayStart.value, -props.daysBack));

const days = computed(() => {
  const out: Date[] = [];
  for (let i = 0; i < TOTAL_DAYS.value; i++) out.push(addDays(rangeStart.value, i));
  return out;
});

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

interface PlacedLeaf {
  item: T;
  dayIdx: number;
  hour: number;
  hue: number;
  sat: number;
  breath: number;
}

const leaves = computed<PlacedLeaf[]>(() => {
  const out: PlacedLeaf[] = [];
  for (const item of props.items) {
    if (!item.when) continue;
    let when: Date;
    try { when = parseISO(item.when); } catch { continue; }
    const dayIdx = differenceInCalendarDays(when, rangeStart.value);
    if (dayIdx < 0 || dayIdx >= TOTAL_DAYS.value) continue;
    const hour = when.getHours() + when.getMinutes() / 60;
    out.push({
      item,
      dayIdx,
      hour,
      hue: item.hue ?? props.accentHue,
      sat: item.sat ?? 65,
      breath: 2.6 + (hashStr(String(item.id)) % 34) / 10,
    });
  }
  return out;
});

const tempCounts = computed(() => {
  const counts = new Array(TOTAL_DAYS.value).fill(0);
  for (const leaf of leaves.value) counts[leaf.dayIdx]++;
  return counts;
});
const tempMax = computed(() => Math.max(2, ...tempCounts.value));

const tempPath = computed(() => {
  if (props.compact) return '';
  const w = props.dayWidth;
  const h = TEMPERATURE_H.value;
  const pts = tempCounts.value.map((c, i) => {
    const x = i * w + w / 2;
    const norm = c / tempMax.value;
    const y = h - 6 - norm * (h - 14);
    return [x, y] as [number, number];
  });
  if (!pts.length) return '';
  let d = `M ${pts[0][0]} ${h} L ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    d += ` Q ${x1} ${y1} ${cx} ${cy}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]} L ${last[0]} ${h} Z`;
  return d;
});

const nowX = computed(() => {
  const dayIdx = differenceInCalendarDays(now.value, rangeStart.value);
  return dayIdx * props.dayWidth + props.dayWidth / 2;
});
const nowY = computed(() => (now.value.getHours() + now.value.getMinutes() / 60) * props.hourHeight);

const scroller = ref<HTMLElement | null>(null);
function scrollToNow(smooth = true) {
  const el = scroller.value;
  if (!el) return;
  const target = nowX.value - el.clientWidth / 2 + props.dayWidth / 2;
  el.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
}
onMounted(async () => {
  await nextTick();
  scrollToNow(false);
});

defineExpose({ scrollToNow });

const dayLabel = (d: Date) => format(d, 'EEE').toUpperCase();
const dayNum = (d: Date) => format(d, 'd');
</script>

<template>
  <div
    ref="scroller"
    class="river-chart"
    :class="{ 'river-chart--bare': bare }"
    :style="{ '--accent-h': accentHue }"
  >
    <div
      class="river-chart__canvas"
      :style="{
        width: `${TOTAL_DAYS * dayWidth}px`,
        '--river-h': `${RIVER_HEIGHT}px`,
        '--temp-h': `${TEMPERATURE_H}px`,
        '--day-w': `${dayWidth}px`,
      }"
    >
      <svg
        v-if="!compact"
        class="river-chart__temperature"
        :width="TOTAL_DAYS * dayWidth"
        :height="TEMPERATURE_H"
        aria-hidden="true"
      >
        <defs>
          <linearGradient :id="`rc-grad-${accentHue}`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" :stop-color="`hsl(${accentHue} 80% 60% / 0.45)`" />
            <stop offset="100%" :stop-color="`hsl(${accentHue} 80% 60% / 0)`" />
          </linearGradient>
        </defs>
        <path :d="tempPath" :fill="`url(#rc-grad-${accentHue})`" />
        <path
          :d="tempPath.split(' Z')[0]"
          fill="none"
          :stroke="`hsl(${accentHue} 80% 55% / 0.7)`"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>

      <div class="river-chart__days">
        <div
          v-for="(d, i) in days"
          :key="i"
          class="river-chart__day"
          :class="{
            'is-today': isSameDay(d, now),
            'is-past': d < todayStart,
            'is-weekend': [0, 6].includes(d.getDay()),
          }"
          :style="{ width: `${dayWidth}px` }"
        >
          <span class="river-chart__dow">{{ dayLabel(d) }}</span>
          <span class="river-chart__dnum tabular-nums">{{ dayNum(d) }}</span>
          <span v-if="isSameDay(d, now)" class="river-chart__today-pill">today</span>
        </div>
      </div>

      <div
        class="river-chart__bed"
        :style="{ height: `${RIVER_HEIGHT}px` }"
      >
        <div
          v-for="(d, i) in days"
          :key="`col-${i}`"
          class="river-chart__col"
          :class="{
            'is-today': isSameDay(d, now),
            'is-weekend': [0, 6].includes(d.getDay()),
          }"
          :style="{ left: `${i * dayWidth}px`, width: `${dayWidth}px` }"
        />

        <template v-if="!hideHours">
          <div
            v-for="h in [3, 6, 9, 12, 15, 18, 21]"
            :key="`h-${h}`"
            class="river-chart__rail"
            :style="{ top: `${h * hourHeight}px` }"
          >
            <span class="river-chart__rail-label">{{ h }}:00</span>
          </div>
        </template>

        <div
          class="river-chart__now"
          :style="{ left: `${nowX}px`, top: `0px`, height: `${nowY}px` }"
        >
          <span class="river-chart__now-pulse" />
        </div>

        <button
          v-for="leaf in leaves"
          :key="leaf.item.id"
          type="button"
          class="river-chart__leaf"
          :class="{
            'is-past': leaf.item.past,
          }"
          :title="leaf.item.sublabel || leaf.item.label"
          :style="{
            left: `${leaf.dayIdx * dayWidth + dayWidth / 2}px`,
            top: `${leaf.hour * hourHeight}px`,
            '--leaf-h': leaf.hue,
            '--leaf-s': `${leaf.sat}%`,
            '--leaf-b': `${leaf.breath}s`,
          }"
          @click="emit('select', leaf.item)"
        >
          <span class="river-chart__leaf-halo" aria-hidden="true" />
          <span class="river-chart__leaf-body">
            <Icon v-if="leaf.item.icon" :name="leaf.item.icon" class="river-chart__leaf-icon" />
            <span class="river-chart__leaf-caption">{{ leaf.item.label }}</span>
          </span>
        </button>

        <div
          v-if="!leaves.length"
          class="river-chart__empty"
          :style="{ left: `${nowX - 160}px` }"
        >
          <Icon name="lucide:waves" class="w-6 h-6 text-muted-foreground/50 mb-1" />
          <p class="text-xs text-muted-foreground">{{ emptyTitle }}</p>
          <p class="text-[11px] text-muted-foreground/70">{{ emptySubtitle }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.river-chart {
  @apply relative w-full overflow-x-auto overflow-y-hidden rounded-2xl
    border border-border bg-card;
  background-image:
    radial-gradient(ellipse 80% 50% at 50% 0%, hsl(var(--accent-h) 70% 65% / 0.10), transparent 70%),
    radial-gradient(ellipse 60% 40% at 30% 100%, hsl(var(--accent-h) 65% 50% / 0.08), transparent 70%),
    radial-gradient(ellipse 60% 40% at 80% 100%, hsl(calc(var(--accent-h) + 40) 65% 55% / 0.06), transparent 70%);
  scrollbar-width: thin;
}
.river-chart--bare {
  @apply border-0 bg-transparent rounded-none;
  background-image: none;
}

.river-chart__canvas {
  @apply relative;
  height: calc(var(--temp-h) + 64px + var(--river-h) + 4px);
}

.river-chart__temperature {
  @apply absolute top-0 left-0 pointer-events-none;
  filter: drop-shadow(0 2px 6px hsl(var(--accent-h) 60% 40% / 0.18));
}

.river-chart__days {
  @apply absolute left-0 flex items-end;
  top: var(--temp-h);
  height: 64px;
}
.river-chart__day {
  @apply relative flex flex-col items-center justify-end gap-0.5 px-2 pb-2
    border-r border-border/40 select-none;
  height: 64px;
}
.river-chart__dow {
  @apply text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase;
}
.river-chart__dnum {
  @apply text-base font-semibold text-foreground/85;
}
.river-chart__day.is-past .river-chart__dnum { @apply text-muted-foreground/55; }
.river-chart__day.is-weekend .river-chart__dow { color: hsl(var(--accent-h) 50% 55%); }
.river-chart__day.is-today .river-chart__dnum {
  color: hsl(var(--accent-h) 80% 55%);
  text-shadow: 0 0 12px hsl(var(--accent-h) 80% 55% / 0.4);
}
.river-chart__today-pill {
  @apply absolute mt-1 px-1.5 py-px rounded-full text-[9px] font-semibold
    uppercase tracking-wide text-white;
  background: linear-gradient(135deg, hsl(var(--accent-h) 80% 60%), hsl(var(--accent-h) 80% 45%));
  transform: translateY(20px);
  box-shadow: 0 2px 6px hsl(var(--accent-h) 70% 45% / 0.4);
}

.river-chart__bed {
  @apply absolute left-0 right-0;
  top: calc(var(--temp-h) + 64px);
}
.river-chart__col {
  @apply absolute top-0 bottom-0 pointer-events-none;
  border-right: 1px solid hsl(var(--border) / 0.4);
}
.river-chart__col.is-weekend { background: hsl(var(--accent-h) 50% 50% / 0.025); }
.river-chart__col.is-today {
  background: linear-gradient(
    180deg,
    hsl(var(--accent-h) 75% 60% / 0.10),
    hsl(var(--accent-h) 75% 60% / 0.03) 50%,
    transparent
  );
}

.river-chart__rail {
  @apply absolute left-0 right-0 pointer-events-none;
  border-top: 1px dashed hsl(var(--border) / 0.5);
}
.river-chart__rail-label {
  @apply absolute -top-2 left-2 px-1 text-[9px] tabular-nums
    text-muted-foreground/60 bg-card;
}

.river-chart__now {
  @apply absolute pointer-events-none;
  width: 2px;
  background: linear-gradient(
    180deg,
    hsl(var(--accent-h) 90% 65%) 0%,
    hsl(var(--accent-h) 90% 55% / 0.5) 70%,
    transparent
  );
  box-shadow: 0 0 12px hsl(var(--accent-h) 90% 60% / 0.6);
  transform: translateX(-1px);
}
.river-chart__now-pulse {
  @apply absolute -left-1.5 -bottom-1.5 w-3 h-3 rounded-full;
  background: hsl(var(--accent-h) 90% 60%);
  box-shadow: 0 0 14px hsl(var(--accent-h) 90% 60% / 0.8);
  animation: rcNowPulse 2.4s ease-in-out infinite;
}
@keyframes rcNowPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.55; }
}

.river-chart__leaf {
  @apply absolute flex items-center gap-1.5 px-2.5 py-1.5
    rounded-2xl text-left cursor-pointer select-none;
  transform-origin: left top;
  transform: translate(-50%, -50%);
  min-width: 120px;
  max-width: 170px;
  color: white;
  background: linear-gradient(
    135deg,
    hsl(var(--leaf-h) var(--leaf-s) 60%) 0%,
    hsl(var(--leaf-h) var(--leaf-s) 42%) 100%
  );
  box-shadow:
    0 6px 18px -10px hsl(var(--leaf-h) var(--leaf-s) 30% / 0.7),
    inset 0 1px 0 0 hsl(var(--leaf-h) var(--leaf-s) 80% / 0.4);
  transition:
    transform 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
    box-shadow 240ms ease;
  animation: rcLeafBreathe var(--leaf-b, 4s) ease-in-out infinite;
}
.river-chart__leaf:hover {
  transform: translate(-50%, -50%) scale(1.05);
  box-shadow:
    0 10px 24px -10px hsl(var(--leaf-h) var(--leaf-s) 30% / 0.85),
    inset 0 1px 0 0 hsl(var(--leaf-h) var(--leaf-s) 85% / 0.5);
}
.river-chart__leaf:active {
  transform: translate(-50%, -50%) scale(0.97);
}
.river-chart__leaf.is-past {
  opacity: 0.7;
  filter: saturate(0.7);
}
.river-chart__leaf-halo {
  @apply absolute inset-0 rounded-2xl pointer-events-none;
  background: radial-gradient(
    ellipse at 30% 0%,
    hsl(var(--leaf-h) var(--leaf-s) 80% / 0.45) 0%,
    transparent 60%
  );
}
.river-chart__leaf-body {
  @apply relative flex items-center gap-1.5 min-w-0;
}
.river-chart__leaf-icon {
  @apply w-3.5 h-3.5 text-white/95 shrink-0;
}
.river-chart__leaf-caption {
  @apply text-[11px] font-medium leading-tight truncate;
}

@keyframes rcLeafBreathe {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.02); }
}

@media (prefers-reduced-motion: reduce) {
  .river-chart__leaf,
  .river-chart__now-pulse {
    animation: none !important;
  }
}

.river-chart__empty {
  @apply absolute top-1/2 -translate-y-1/2 flex flex-col items-center
    gap-1 text-center px-4 py-3 rounded-xl border border-dashed border-border/60
    bg-background/60 backdrop-blur-sm;
  width: 320px;
}
</style>

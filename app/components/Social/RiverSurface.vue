<script setup lang="ts">
/**
 * SocialRiverSurface — liquid horizontal timeline replacing the 7-col grid.
 *
 * Composition Canvas redesign, Phase 1. Premise: time is terrain, not a
 * spreadsheet. Posts become channel-tinted "leaves" floating above a river
 * of days; vertical position = hour-of-day; drag horizontally to re-day,
 * vertically to re-hour, release to PATCH scheduled_at. A content-temperature
 * curve above shows where the week is sagging.
 *
 * Motion: single shared spring `cubic-bezier(0.36, 0.66, 0.04, 1) @ 400ms`
 * per the universal iOS-native policy. Per-leaf breathing 2.4–6s phase-offset
 * by id hash so the school of leaves feels alive without strobing.
 *
 * Drag uses raw Pointer Events (no Vue Transition, no GSAP ticker) —
 * compositor-driven transforms only, per the motion-stack policy.
 */
import { Button } from '~/components/ui/button';
import { format, startOfDay, addDays, differenceInCalendarDays, parseISO, isSameDay } from 'date-fns';
import type { SocialPost } from '~~/shared/social';
import { getSocialPlatformIcon } from '~/utils/icons';

const toast = useToast();
const route = useRoute();

// Composition Canvas P3.2 — `?canvas=1` reroutes leaf clicks into the
// canvas lift path instead of opening the legacy modal. The composable
// singleton is shared with the StudioSurface wrapper (the `?canvas=1`
// host), so the FLIP source rect we capture here drives the same
// lifted-card component the canvas mounts.
const canvasOn = computed<boolean>(() => {
  const v = route.query.canvas;
  return v === '1' || v === 'true';
});
const zoom = useCompositionZoom();

// ── Range window ─────────────────────────────────────────────────
// 21-day rolling window: 7 days back, today, 13 days forward. Enough
// context to see what just published and what's queued without the
// month-grid muscle memory.
const DAYS_BACK = 7;
const DAYS_FWD = 14;
const TOTAL_DAYS = DAYS_BACK + DAYS_FWD;
const DAY_WIDTH = 168; // px — each day column
const HOUR_HEIGHT = 22; // px — 22 × 24 = 528px river height
const RIVER_HEIGHT = HOUR_HEIGHT * 24;

const now = useNow({ interval: 60_000 });
const todayStart = computed(() => startOfDay(now.value));
const rangeStart = computed(() => addDays(todayStart.value, -DAYS_BACK));
const rangeEnd = computed(() => addDays(todayStart.value, DAYS_FWD));

const days = computed(() => {
  const out: Date[] = [];
  for (let i = 0; i < TOTAL_DAYS; i++) {
    out.push(addDays(rangeStart.value, i));
  }
  return out;
});

// ── Filters ──────────────────────────────────────────────────────
const selectedPlatform = ref<string | null>(null);
const selectedStatus = ref<string | null>(null);

// ── Data ─────────────────────────────────────────────────────────
const isoRangeStart = computed(() => rangeStart.value.toISOString());
const isoRangeEnd = computed(() => addDays(rangeEnd.value, 1).toISOString());

const { data: postsData, refresh: refreshPosts } = useLazyFetch('/api/social/posts', {
  query: {
    scheduled_after: isoRangeStart,
    scheduled_before: isoRangeEnd,
    limit: 200,
  },
  watch: [isoRangeStart, isoRangeEnd],
});

const allPosts = computed(() => ((postsData.value as any)?.data || []) as SocialPost[]);

const filteredPosts = computed(() => {
  let list = allPosts.value;
  if (selectedPlatform.value) {
    list = list.filter((p) => p.platforms?.some((t) => t.platform === selectedPlatform.value));
  }
  if (selectedStatus.value) {
    list = list.filter((p) => p.status === selectedStatus.value);
  }
  return list;
});

// ── Geometry ─────────────────────────────────────────────────────
function dayIndexFor(iso: string | null | undefined): number {
  if (!iso) return -1;
  try {
    const d = parseISO(iso);
    return differenceInCalendarDays(d, rangeStart.value);
  } catch { return -1; }
}

function hourFor(iso: string | null | undefined): number {
  if (!iso) return 12;
  try {
    const d = parseISO(iso);
    return d.getHours() + d.getMinutes() / 60;
  } catch { return 12; }
}

interface PlacedLeaf {
  post: SocialPost;
  dayIdx: number;
  hour: number;
  channel: string;
  hue: number;
  breath: number;
}

// Stable hue mapping per channel for "tinted by channel" — Hue's
// palette anchor: instagram warm-pink, tiktok cyan, linkedin marine,
// threads graphite, facebook indigo, twitter sky, youtube ember.
const CHANNEL_HUE: Record<string, number> = {
  instagram: 330,
  tiktok: 188,
  linkedin: 210,
  facebook: 232,
  threads: 0,
  twitter: 198,
  x: 198,
  youtube: 8,
};

const CHANNEL_SAT: Record<string, number> = {
  instagram: 78,
  tiktok: 70,
  linkedin: 72,
  facebook: 60,
  threads: 0,
  twitter: 75,
  x: 75,
  youtube: 75,
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const leaves = computed<PlacedLeaf[]>(() => {
  return filteredPosts.value
    .map((post) => {
      const dayIdx = dayIndexFor(post.scheduled_at);
      if (dayIdx < 0 || dayIdx >= TOTAL_DAYS) return null;
      const channel = (post.platforms?.[0]?.platform || 'threads').toLowerCase();
      const hue = CHANNEL_HUE[channel] ?? 220;
      // Stable breath period 2.4-6.0s by id hash so the school doesn't strobe.
      const breath = 2.4 + (hashStr(String(post.id)) % 36) / 10;
      return {
        post,
        dayIdx,
        hour: hourFor(post.scheduled_at),
        channel,
        hue,
        breath,
      } as PlacedLeaf;
    })
    .filter((x): x is PlacedLeaf => x !== null);
});

// ── Content-temperature curve ────────────────────────────────────
// Posts-per-day mapped to an SVG path. Under-posted weeks visibly sag.
const TEMPERATURE_H = 56;
const tempCounts = computed(() => {
  const counts = new Array(TOTAL_DAYS).fill(0);
  for (const leaf of leaves.value) counts[leaf.dayIdx]++;
  return counts;
});

const tempMax = computed(() => Math.max(2, ...tempCounts.value));

const tempPath = computed(() => {
  const w = DAY_WIDTH;
  const pts = tempCounts.value.map((c, i) => {
    const x = i * w + w / 2;
    const norm = c / tempMax.value;
    const y = TEMPERATURE_H - 6 - norm * (TEMPERATURE_H - 14);
    return [x, y] as [number, number];
  });
  if (!pts.length) return '';
  // Smooth catmull-rom-ish: use quadratic curves between midpoints.
  let d = `M ${pts[0][0]} ${TEMPERATURE_H} L ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    d += ` Q ${x1} ${y1} ${cx} ${cy}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]} L ${last[0]} ${TEMPERATURE_H} Z`;
  return d;
});

// ── Now indicator ────────────────────────────────────────────────
const nowX = computed(() => {
  const dayIdx = differenceInCalendarDays(now.value, rangeStart.value);
  return dayIdx * DAY_WIDTH + DAY_WIDTH / 2;
});
const nowY = computed(() => (now.value.getHours() + now.value.getMinutes() / 60) * HOUR_HEIGHT);

// ── Auto-scroll to today on mount ────────────────────────────────
const scroller = ref<HTMLElement | null>(null);

function scrollToNow(smooth = true) {
  const el = scroller.value;
  if (!el) return;
  const target = nowX.value - el.clientWidth / 2 + DAY_WIDTH / 2;
  el.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
}

onMounted(async () => {
  await nextTick();
  scrollToNow(false);
});

// ── Drag-to-reschedule ───────────────────────────────────────────
// Pointer-event based, compositor-only transforms. Below 5px = click,
// else drag. On release, compute new day+hour from final position
// and PATCH /api/social/posts/:id. Local list optimistically updates.
interface DragState {
  postId: number | string;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  dx: number;
  dy: number;
  moved: boolean;
  /** Bounding rect of the leaf at pointerdown — captured so the canvas
   *  FLIP has the source pose even after the leaf re-renders post-drag. */
  sourceRect: DOMRect | null;
}

const drag = ref<DragState | null>(null);
const savingDragId = ref<number | string | null>(null);

function onPointerDown(e: PointerEvent, leaf: PlacedLeaf) {
  // Locked statuses can't be rescheduled by drag — but you can still
  // click them open.
  const lockable = !['draft', 'scheduled', 'failed'].includes(leaf.post.status);
  if (lockable) return;
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  drag.value = {
    postId: leaf.post.id,
    startX: e.clientX,
    startY: e.clientY,
    baseX: leaf.dayIdx * DAY_WIDTH + DAY_WIDTH / 2,
    baseY: leaf.hour * HOUR_HEIGHT,
    dx: 0,
    dy: 0,
    moved: false,
    // Capture BEFORE any hover transform applies — getBoundingClientRect()
    // here gives the leaf's current screen pose, which is what the lifted
    // card needs to FLIP from. We stash it on pointerdown rather than click
    // so the breathing animation's transient transforms don't perturb it.
    sourceRect: target.getBoundingClientRect(),
  };
}

function onPointerMove(e: PointerEvent) {
  const d = drag.value;
  if (!d) return;
  d.dx = e.clientX - d.startX;
  d.dy = e.clientY - d.startY;
  if (Math.hypot(d.dx, d.dy) > 5) d.moved = true;
}

async function onPointerUp(e: PointerEvent, leaf: PlacedLeaf) {
  const d = drag.value;
  drag.value = null;
  if (!d) return;
  if (!d.moved) {
    // Click. Under `?canvas=1`, the canvas owns the drill-in — hand the
    // captured source rect to the zoom composable so the lifted card can
    // FLIP from the leaf's bounding rect. Otherwise fall through to the
    // legacy modal (kept until P3.6 retires this surface).
    if (canvasOn.value) {
      zoom.lift(String(leaf.post.id), d.sourceRect
        ? { x: d.sourceRect.x, y: d.sourceRect.y, width: d.sourceRect.width, height: d.sourceRect.height }
        : null);
      return;
    }
    openPost(leaf.post);
    return;
  }
  // Snap: each DAY_WIDTH = 1 day, each HOUR_HEIGHT = 1 hour.
  const deltaDays = Math.round(d.dx / DAY_WIDTH);
  const deltaHours = Math.round(d.dy / HOUR_HEIGHT);
  if (deltaDays === 0 && deltaHours === 0) return;

  const original = parseISO(leaf.post.scheduled_at);
  const target = new Date(original);
  target.setDate(target.getDate() + deltaDays);
  target.setHours(Math.max(0, Math.min(23, target.getHours() + deltaHours)));

  savingDragId.value = leaf.post.id;
  try {
    await $fetch(`/api/social/posts/${leaf.post.id}`, {
      method: 'PATCH',
      body: { scheduled_at: target.toISOString() },
    });
    toast.add({
      title: 'Rescheduled',
      description: format(target, 'EEE MMM d, h:mm a'),
      icon: 'i-lucide-waves',
      color: 'green',
    });
    await refreshPosts();
  } catch (err: any) {
    toast.add({
      title: 'Could not reschedule',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    });
  } finally {
    savingDragId.value = null;
  }
}

// Per-leaf live transform during a drag.
function dragTranslate(postId: number | string): string {
  const d = drag.value;
  if (!d || d.postId !== postId) return '';
  return `translate(${d.dx}px, ${d.dy}px)`;
}

// ── Post modal ───────────────────────────────────────────────────
const selectedPost = ref<SocialPost | null>(null);
const showPostModal = ref(false);

function openPost(post: SocialPost) {
  selectedPost.value = post;
  showPostModal.value = true;
}

const composeSlide = useAppSlideOver('social-compose');
function openCompose() {
  composeSlide.open('new');
}

// ── Stats strip ──────────────────────────────────────────────────
const stats = computed(() => ({
  total: filteredPosts.value.length,
  scheduled: filteredPosts.value.filter((p) => p.status === 'scheduled').length,
  published: filteredPosts.value.filter((p) => p.status === 'published').length,
  draft: filteredPosts.value.filter((p) => p.status === 'draft').length,
}));

// ── Display helpers ──────────────────────────────────────────────
function leafLabel(post: SocialPost): string {
  return (post.caption || 'Untitled').slice(0, 40);
}

function dayLabel(d: Date) {
  return format(d, 'EEE').toUpperCase();
}
function dayNum(d: Date) {
  return format(d, 'd');
}

const platformIcon = (p: string) => getSocialPlatformIcon(p);
</script>

<template>
  <div class="river-shell">
    <!-- Header: stats + filters + new post -->
    <div class="river-header">
      <div class="river-header__stats">
        <span class="river-stat">
          <span class="river-stat__dot river-stat__dot--total" />
          <strong class="tabular-nums">{{ stats.total }}</strong> in window
        </span>
        <span class="river-stat">
          <span class="river-stat__dot river-stat__dot--sched" />
          <strong class="tabular-nums">{{ stats.scheduled }}</strong> scheduled
        </span>
        <span class="river-stat">
          <span class="river-stat__dot river-stat__dot--pub" />
          <strong class="tabular-nums">{{ stats.published }}</strong> published
        </span>
        <span v-if="stats.draft" class="river-stat">
          <span class="river-stat__dot river-stat__dot--draft" />
          <strong class="tabular-nums">{{ stats.draft }}</strong> draft
        </span>
      </div>

      <div class="river-header__actions">
        <USelectMenu
          v-model="selectedPlatform"
          :options="[
            { label: 'All channels', value: null },
            { label: 'Instagram', value: 'instagram' },
            { label: 'TikTok', value: 'tiktok' },
            { label: 'LinkedIn', value: 'linkedin' },
            { label: 'Threads', value: 'threads' },
          ]"
          value-attribute="value"
          option-attribute="label"
          placeholder="All channels"
          class="w-36"
          size="xs"
        />
        <USelectMenu
          v-model="selectedStatus"
          :options="[
            { label: 'Any status', value: null },
            { label: 'Scheduled', value: 'scheduled' },
            { label: 'Published', value: 'published' },
            { label: 'Draft', value: 'draft' },
            { label: 'Failed', value: 'failed' },
          ]"
          value-attribute="value"
          option-attribute="label"
          placeholder="Any status"
          class="w-32"
          size="xs"
        />
        <Button size="sm" variant="outline" @click="scrollToNow(true)">
          <Icon name="lucide:locate-fixed" class="w-3.5 h-3.5 mr-1" />
          Now
        </Button>
        <Button size="sm" @click="openCompose">
          <Icon name="lucide:pen-line" class="w-3.5 h-3.5 mr-1" />
          New Post
        </Button>
      </div>
    </div>

    <!-- The river. One horizontal scroller; everything below is absolute-
         positioned inside a single canvas for crisp drag math. -->
    <div ref="scroller" class="river-scroller">
      <div
        class="river-canvas"
        :style="{
          width: `${TOTAL_DAYS * DAY_WIDTH}px`,
          '--river-height': `${RIVER_HEIGHT}px`,
          '--temp-height': `${TEMPERATURE_H}px`,
        }"
      >
        <!-- Content-temperature curve. Under-posted spans visibly sag. -->
        <svg
          class="river-temperature"
          :width="TOTAL_DAYS * DAY_WIDTH"
          :height="TEMPERATURE_H"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="hsl(var(--accent-h, 220) 80% 60% / 0.45)" />
              <stop offset="100%" stop-color="hsl(var(--accent-h, 220) 80% 60% / 0)" />
            </linearGradient>
          </defs>
          <path :d="tempPath" fill="url(#tempGrad)" />
          <path
            :d="tempPath.split(' Z')[0]"
            fill="none"
            stroke="hsl(var(--accent-h, 220) 80% 55% / 0.75)"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>

        <!-- Day header strip (Sun 18, Mon 19…) -->
        <div class="river-days">
          <div
            v-for="(d, i) in days"
            :key="i"
            class="river-day"
            :class="{
              'river-day--today': isSameDay(d, now),
              'river-day--past': d < todayStart,
              'river-day--weekend': [0, 6].includes(d.getDay()),
            }"
            :style="{ width: `${DAY_WIDTH}px` }"
          >
            <span class="river-day__dow">{{ dayLabel(d) }}</span>
            <span class="river-day__num tabular-nums">{{ dayNum(d) }}</span>
            <span v-if="isSameDay(d, now)" class="river-day__today-pill">today</span>
          </div>
        </div>

        <!-- The river itself: hour grid + columns + now-line + leaves. -->
        <div
          class="river-bed"
          :style="{ height: `${RIVER_HEIGHT}px` }"
          @pointermove="onPointerMove"
        >
          <!-- Vertical day columns with subtle stripes -->
          <div
            v-for="(d, i) in days"
            :key="`col-${i}`"
            class="river-col"
            :class="{
              'river-col--today': isSameDay(d, now),
              'river-col--weekend': [0, 6].includes(d.getDay()),
            }"
            :style="{ left: `${i * DAY_WIDTH}px`, width: `${DAY_WIDTH}px` }"
          />

          <!-- Hour rails (every 3h) -->
          <div
            v-for="h in [3, 6, 9, 12, 15, 18, 21]"
            :key="`h-${h}`"
            class="river-hour-rail"
            :style="{ top: `${h * HOUR_HEIGHT}px` }"
          >
            <span class="river-hour-rail__label">{{ h }}:00</span>
          </div>

          <!-- Now: vertical glow line dropping from current day's top to nowY -->
          <div
            class="river-now"
            :style="{
              left: `${nowX}px`,
              top: `0px`,
              height: `${nowY}px`,
            }"
          >
            <span class="river-now__pulse" />
          </div>

          <!-- Floating leaves: one per post -->
          <button
            v-for="leaf in leaves"
            :key="leaf.post.id"
            type="button"
            class="river-leaf"
            :class="{
              'river-leaf--past': leaf.post.status === 'published',
              'river-leaf--dragging': drag?.postId === leaf.post.id,
              'river-leaf--saving': savingDragId === leaf.post.id,
            }"
            :style="{
              left: `${leaf.dayIdx * DAY_WIDTH + DAY_WIDTH / 2}px`,
              top: `${leaf.hour * HOUR_HEIGHT}px`,
              transform: dragTranslate(leaf.post.id),
              '--leaf-hue': leaf.hue,
              '--leaf-sat': `${CHANNEL_SAT[leaf.channel] ?? 60}%`,
              '--leaf-breath': `${leaf.breath}s`,
            }"
            @pointerdown="onPointerDown($event, leaf)"
            @pointerup="onPointerUp($event, leaf)"
            @pointercancel="drag = null"
          >
            <span class="river-leaf__halo" aria-hidden="true" />
            <span class="river-leaf__body">
              <span class="river-leaf__chips">
                <Icon
                  v-for="(plat, pi) in [...new Set(leaf.post.platforms?.map((p) => p.platform) || [])]"
                  :key="pi"
                  :name="platformIcon(plat)"
                  class="river-leaf__chip"
                />
              </span>
              <span class="river-leaf__caption">{{ leafLabel(leaf.post) }}</span>
              <span v-if="savingDragId === leaf.post.id" class="river-leaf__saving">
                <Icon name="lucide:loader-2" class="w-3 h-3 animate-spin" />
              </span>
            </span>
          </button>

          <!-- Empty-river hint when nothing in window -->
          <div v-if="!leaves.length" class="river-empty" :style="{ left: `${nowX - 160}px` }">
            <Icon name="lucide:waves" class="w-6 h-6 text-muted-foreground/50 mb-1" />
            <p class="text-xs text-muted-foreground">The river is quiet.</p>
            <p class="text-[11px] text-muted-foreground/70">Compose a post to set the current.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend strip -->
    <div class="river-legend">
      <span class="river-legend__hint">
        <Icon name="lucide:hand" class="w-3 h-3" />
        Drag a leaf to reschedule.
      </span>
      <span class="river-legend__channels">
        <span v-for="(hue, ch) in CHANNEL_HUE" :key="ch" class="river-legend__chip">
          <span
            class="river-legend__swatch"
            :style="{
              background: `linear-gradient(135deg, hsl(${hue} ${CHANNEL_SAT[ch] ?? 60}% 65%), hsl(${hue} ${CHANNEL_SAT[ch] ?? 60}% 45%))`,
            }"
          />
          {{ ch }}
        </span>
      </span>
    </div>

    <!-- Post detail (kept simple — reuse the Studio detail pattern in a
         later phase; for now the bare UModal preserves parity with the
         legacy calendar surface so deep-links keep working). -->
    <UModal v-model="showPostModal" class="sm:max-w-xl">
      <template v-if="selectedPost" #header>
        <div class="flex items-center gap-2">
          <UBadge :color="selectedPost.status === 'published' ? 'green' : selectedPost.status === 'failed' ? 'red' : 'blue'" variant="subtle">
            {{ selectedPost.status }}
          </UBadge>
          <span class="text-sm text-muted-foreground">
            {{ format(parseISO(selectedPost.scheduled_at), 'EEE MMM d, h:mm a') }}
          </span>
        </div>
      </template>
      <template v-if="selectedPost">
        <div v-if="selectedPost.thumbnail_url || selectedPost.media_urls?.length" class="mb-4">
          <img
            :src="selectedPost.thumbnail_url || selectedPost.media_urls[0]"
            :alt="selectedPost.caption"
            class="w-full max-h-72 object-cover rounded-lg"
          />
        </div>
        <p class="text-foreground whitespace-pre-wrap mb-4">{{ selectedPost.caption }}</p>
        <div class="flex flex-wrap gap-2 mb-4">
          <div
            v-for="t in selectedPost.platforms"
            :key="t.account_id"
            class="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-full text-xs"
          >
            <Icon :name="platformIcon(t.platform)" class="w-3 h-3" />
            {{ t.account_name }}
          </div>
        </div>
      </template>
      <template v-if="selectedPost" #footer>
        <div class="flex justify-end gap-2">
          <UButton
            v-if="['scheduled', 'draft', 'failed'].includes(selectedPost.status)"
            variant="soft"
            size="sm"
            :to="`/social/posts/${selectedPost.id}/edit?from=${encodeURIComponent($route.fullPath)}`"
          >
            Edit
          </UButton>
          <UButton size="sm" @click="showPostModal = false">Close</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.river-shell {
  --accent-h: var(--app-accent-h, 220);
  --accent-s: var(--app-accent-s, 70%);
  --accent-l: var(--app-accent-l, 55%);
  @apply flex flex-col gap-3;
}

/* ── Header ───────────────────────────────────────────────────── */

.river-header {
  @apply flex items-center justify-between flex-wrap gap-3;
}

.river-header__stats {
  @apply flex items-center gap-4 text-xs text-muted-foreground;
}

.river-stat {
  @apply inline-flex items-center gap-1.5;
}

.river-stat strong {
  @apply text-foreground font-semibold;
}

.river-stat__dot {
  @apply w-1.5 h-1.5 rounded-full;
}
.river-stat__dot--total { @apply bg-foreground/40; }
.river-stat__dot--sched { background: hsl(210 80% 55%); }
.river-stat__dot--pub { background: hsl(150 60% 45%); }
.river-stat__dot--draft { @apply bg-muted-foreground; }

.river-header__actions {
  @apply flex items-center gap-2;
}

/* ── River canvas ─────────────────────────────────────────────── */

.river-scroller {
  @apply relative w-full overflow-x-auto overflow-y-hidden rounded-2xl
    border border-border bg-card;
  /* Soft water gradient — the "river floor" the leaves float above. */
  background-image:
    radial-gradient(ellipse 80% 50% at 50% 0%, hsl(var(--accent-h) 70% 65% / 0.10), transparent 70%),
    radial-gradient(ellipse 60% 40% at 30% 100%, hsl(var(--accent-h) 65% 50% / 0.08), transparent 70%),
    radial-gradient(ellipse 60% 40% at 80% 100%, hsl(calc(var(--accent-h) + 40) 65% 55% / 0.06), transparent 70%);
  scrollbar-width: thin;
}

.river-canvas {
  @apply relative;
  height: calc(var(--temp-height) + 64px + var(--river-height) + 4px);
}

/* ── Temperature curve ────────────────────────────────────────── */

.river-temperature {
  @apply absolute top-0 left-0 pointer-events-none;
  filter: drop-shadow(0 2px 6px hsl(var(--accent-h) 60% 40% / 0.18));
}

/* ── Day header strip ─────────────────────────────────────────── */

.river-days {
  @apply absolute left-0 flex items-end;
  top: var(--temp-height);
  height: 64px;
}

.river-day {
  @apply flex flex-col items-center justify-end gap-0.5 px-2 pb-2
    border-r border-border/40 select-none;
  height: 64px;
}

.river-day__dow {
  @apply text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase;
}

.river-day__num {
  @apply text-base font-semibold text-foreground/85;
}

.river-day--past .river-day__num {
  @apply text-muted-foreground/55;
}

.river-day--weekend .river-day__dow {
  color: hsl(var(--accent-h) 50% 55%);
}

.river-day--today .river-day__num {
  color: hsl(var(--accent-h) 80% 55%);
  text-shadow: 0 0 12px hsl(var(--accent-h) 80% 55% / 0.4);
}

.river-day__today-pill {
  @apply absolute mt-1 px-1.5 py-px rounded-full text-[9px] font-semibold
    uppercase tracking-wide text-white;
  background: linear-gradient(135deg, hsl(var(--accent-h) 80% 60%), hsl(var(--accent-h) 80% 45%));
  transform: translateY(20px);
  box-shadow: 0 2px 6px hsl(var(--accent-h) 70% 45% / 0.4);
}

/* ── River bed (the hour-tall surface holding leaves) ────────── */

.river-bed {
  @apply absolute left-0 right-0;
  top: calc(var(--temp-height) + 64px);
}

.river-col {
  @apply absolute top-0 bottom-0 pointer-events-none;
  border-right: 1px solid hsl(var(--border) / 0.4);
}

.river-col--weekend {
  background: hsl(var(--accent-h) 50% 50% / 0.025);
}

.river-col--today {
  background: linear-gradient(
    180deg,
    hsl(var(--accent-h) 75% 60% / 0.10),
    hsl(var(--accent-h) 75% 60% / 0.03) 50%,
    transparent
  );
}

.river-hour-rail {
  @apply absolute left-0 right-0 pointer-events-none;
  border-top: 1px dashed hsl(var(--border) / 0.5);
}

.river-hour-rail__label {
  @apply absolute -top-2 left-2 px-1 text-[9px] tabular-nums
    text-muted-foreground/60 bg-card;
}

/* ── Now indicator ────────────────────────────────────────────── */

.river-now {
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

.river-now__pulse {
  @apply absolute -left-1.5 -bottom-1.5 w-3 h-3 rounded-full;
  background: hsl(var(--accent-h) 90% 60%);
  box-shadow: 0 0 14px hsl(var(--accent-h) 90% 60% / 0.8);
  animation: riverNowPulse 2.4s ease-in-out infinite;
}

@keyframes riverNowPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.55; }
}

/* ── Leaves (the floating post cards) ─────────────────────────── */

.river-leaf {
  @apply absolute flex items-center gap-1.5 px-2.5 py-1.5
    rounded-2xl text-left cursor-grab select-none;
  /* Anchored centred horizontally on the day midpoint, top to the hour. */
  transform-origin: left top;
  transform: translate(-50%, -50%);
  min-width: 120px;
  max-width: 160px;
  color: white;
  background: linear-gradient(
    135deg,
    hsl(var(--leaf-hue) var(--leaf-sat) 60%) 0%,
    hsl(var(--leaf-hue) var(--leaf-sat) 42%) 100%
  );
  box-shadow:
    0 6px 18px -10px hsl(var(--leaf-hue) var(--leaf-sat) 30% / 0.7),
    inset 0 1px 0 0 hsl(var(--leaf-hue) var(--leaf-sat) 80% / 0.4);
  transition:
    transform 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
    box-shadow 240ms ease;
  /* Subtle breathing: scale 1.0 → 1.02 → 1.0 with phase offset per leaf. */
  animation: riverLeafBreathe var(--leaf-breath, 4s) ease-in-out infinite;
}

.river-leaf:hover {
  transform: translate(-50%, -50%) scale(1.05);
  box-shadow:
    0 10px 24px -10px hsl(var(--leaf-hue) var(--leaf-sat) 30% / 0.85),
    inset 0 1px 0 0 hsl(var(--leaf-hue) var(--leaf-sat) 85% / 0.5);
}

.river-leaf:active {
  cursor: grabbing;
  transform: translate(-50%, -50%) scale(0.97);
}

.river-leaf--dragging {
  animation: none !important;
  transition: none !important;
  z-index: 30;
  box-shadow:
    0 18px 42px -12px hsl(var(--leaf-hue) var(--leaf-sat) 25% / 0.85),
    inset 0 1px 0 0 hsl(var(--leaf-hue) var(--leaf-sat) 88% / 0.55);
}

.river-leaf--past {
  opacity: 0.7;
  filter: saturate(0.7);
}

.river-leaf--saving {
  opacity: 0.85;
}

.river-leaf__halo {
  @apply absolute inset-0 rounded-2xl pointer-events-none;
  background: radial-gradient(
    ellipse at 30% 0%,
    hsl(var(--leaf-hue) var(--leaf-sat) 80% / 0.45) 0%,
    transparent 60%
  );
}

.river-leaf__body {
  @apply relative flex items-center gap-1.5 min-w-0;
}

.river-leaf__chips {
  @apply flex items-center gap-0.5 shrink-0;
}

.river-leaf__chip {
  @apply w-3 h-3 text-white/95;
}

.river-leaf__caption {
  @apply text-[11px] font-medium leading-tight truncate;
}

.river-leaf__saving {
  @apply ml-1 shrink-0;
}

@keyframes riverLeafBreathe {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.02); }
}

@media (prefers-reduced-motion: reduce) {
  .river-leaf,
  .river-now__pulse {
    animation: none !important;
  }
}

/* ── Empty state ──────────────────────────────────────────────── */

.river-empty {
  @apply absolute top-1/2 -translate-y-1/2 flex flex-col items-center
    gap-1 text-center px-4 py-3 rounded-xl border border-dashed border-border/60
    bg-background/60 backdrop-blur-sm;
  width: 320px;
}

/* ── Legend strip ─────────────────────────────────────────────── */

.river-legend {
  @apply flex items-center justify-between flex-wrap gap-2 text-[11px]
    text-muted-foreground px-1;
}

.river-legend__hint {
  @apply inline-flex items-center gap-1.5;
}

.river-legend__channels {
  @apply inline-flex items-center gap-2 flex-wrap;
}

.river-legend__chip {
  @apply inline-flex items-center gap-1 capitalize;
}

.river-legend__swatch {
  @apply w-2 h-2 rounded-full;
  box-shadow: 0 0 6px currentColor;
}
</style>

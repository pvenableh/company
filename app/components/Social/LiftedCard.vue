<script setup lang="ts">
/**
 * LiftedCard — the focused leaf at z=2 of the Composition Canvas.
 *
 * P3 Phase 3.2. Replaces the Phase-3.1 lifted stub with the real card that
 * FLIPs from the river leaf's bounding rect to canvas center. At z=2 this
 * card is the focus; at z>=2.5 the canvas crossfades it into the composer
 * (see `CompositionComposer`).
 *
 * Motion contract (load-bearing — see feedback_motion_stack_policy):
 *   - FLIP is reactive inline transform + CSS transition. We mount with the
 *     source-rect-derived `translate + scale`, then on next paint flip to
 *     identity. The compositor runs the spring directly.
 *   - NO Vue Transition, NO GSAP. The card's `transform` is bound to a
 *     `ref<CSSProperties>` and CSS owns the 400ms cubic-bezier
 *     `cubic-bezier(0.36, 0.66, 0.04, 1)` interpolation.
 *   - prefers-reduced-motion → opacity crossfade only, no scale/translate.
 *
 * Content: thumbnail (design_image_url > first media), caption, channel
 * chips (one per unique platform target), status badge, scheduled-at
 * footer. All read from the existing SocialPost row already in memory on
 * the river — NO new fetch.
 *
 * @see app/components/Social/CompositionCanvas.vue — host that mounts this.
 * @see app/components/Social/RiverSurface.vue — captures the source rect.
 * @see project_composition_canvas_redesign — design rationale.
 */
import type { SocialPost, SocialPlatform } from '~~/shared/social';
import { getSocialPlatformIcon } from '~/utils/icons';
import type { LiftSourceRect } from '~/composables/useCompositionZoom';

const props = defineProps<{
  /** Post row already loaded on the river. We don't re-fetch — the canvas
   *  hands us the same row the leaf was rendered from. */
  post: SocialPost;
  /** Bounding rect of the leaf at click time, in viewport coordinates.
   *  When null (deep-link landing at ?z=2&id=... without a click) we skip
   *  the FLIP and fade in at the rest pose. */
  sourceRect: LiftSourceRect | null;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

/**
 * FLIP state machine.
 *
 *   'from'    initial paint at the source-rect pose
 *   'to'      identity (rest at canvas center)
 *
 * We start in 'from' so the first paint matches the leaf's position, then
 * flip to 'to' on the next animation frame so the CSS transition picks up
 * the delta.
 */
const cardEl = ref<HTMLElement | null>(null);
const flipStage = ref<'from' | 'to'>('from');

const prefersReducedMotion = ref(false);
onMounted(() => {
  if (typeof window === 'undefined') return;
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion.value = mq.matches;
  const onChange = (e: MediaQueryListEvent) => {
    prefersReducedMotion.value = e.matches;
  };
  mq.addEventListener('change', onChange);
  onBeforeUnmount(() => mq.removeEventListener('change', onChange));
});

/**
 * Initial-pose transform. Maps the card's rest rect to the leaf's
 * source rect via translate + scale, so the first paint of the card
 * lines up exactly with where the leaf was. Computed once per
 * `sourceRect` change so retargeting (clicking another leaf without
 * closing) re-runs the FLIP cleanly.
 */
function computeFromTransform(): string {
  if (!props.sourceRect || !cardEl.value) return 'translate3d(0, 0, 0) scale(1)';
  const rest = cardEl.value.getBoundingClientRect();
  const src = props.sourceRect;
  // Center of source vs center of rest — translate by the delta.
  const dx = (src.x + src.width / 2) - (rest.x + rest.width / 2);
  const dy = (src.y + src.height / 2) - (rest.y + rest.height / 2);
  // Source is smaller than rest in both dimensions; scale axes can
  // diverge but we use the larger ratio to avoid distortion (leaves
  // are ~150px wide vs ~360px rest, the height ratio is similar).
  const sx = Math.max(0.05, src.width / Math.max(1, rest.width));
  const sy = Math.max(0.05, src.height / Math.max(1, rest.height));
  const s = Math.max(sx, sy);
  return `translate3d(${dx}px, ${dy}px, 0) scale(${s})`;
}

const flipStyle = ref<{ transform: string; opacity: string }>({
  transform: 'translate3d(0, 0, 0) scale(1)',
  opacity: props.sourceRect ? '0' : '1',
});

// Run the FLIP once the card is mounted. Two passes:
//   1. paint at the source-rect pose (transform + opacity 0)
//   2. on next frame, flip to identity + opacity 1 → CSS transition spans
//      the 400ms master spring.
//
// We use setTimeout(0) for the flip rather than requestAnimationFrame
// because RAF can stall in headless/throttled environments (motion-stack
// policy). A 16ms macrotask survives those and is still imperceptibly
// fast for an interactive paint.
onMounted(() => {
  nextTick(() => {
    if (prefersReducedMotion.value || !props.sourceRect) {
      flipStyle.value = { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '1' };
      flipStage.value = 'to';
      return;
    }
    // From pose: at the source rect, fully visible (we're modelling a
    // continuation of the leaf, not a fade-in).
    flipStyle.value = { transform: computeFromTransform(), opacity: '1' };
    flipStage.value = 'from';
    // Then on the next macrotask, flip to identity. The CSS transition
    // runs the spring.
    setTimeout(() => {
      flipStyle.value = { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '1' };
      flipStage.value = 'to';
    }, 16);
  });
});

// Retarget: if the user clicks another leaf without closing, re-flip from
// the new source rect. We compute the FROM transform against the current
// rest pose so the card visually flies back through the new leaf.
watch(
  () => props.sourceRect,
  (next, prev) => {
    if (!next || next === prev) return;
    nextTick(() => {
      if (prefersReducedMotion.value) return;
      flipStyle.value = { transform: computeFromTransform(), opacity: '1' };
      flipStage.value = 'from';
      setTimeout(() => {
        flipStyle.value = { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '1' };
        flipStage.value = 'to';
      }, 16);
    });
  },
);

// ── Display helpers ─────────────────────────────────────────────
const thumbnail = computed(() => {
  return (
    props.post.design_image_url ||
    props.post.thumbnail_url ||
    props.post.media_urls?.[0] ||
    null
  );
});

const uniquePlatforms = computed<SocialPlatform[]>(() => {
  const set = new Set<SocialPlatform>();
  for (const t of props.post.platforms || []) set.add(t.platform);
  return [...set];
});

function platformIcon(p: SocialPlatform) {
  return getSocialPlatformIcon(p);
}

const statusLabel = computed(() => {
  const s = props.post.approval_state || props.post.status;
  if (!s) return 'Draft';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
});

const statusTone = computed(() => {
  const s = props.post.approval_state || props.post.status;
  switch (s) {
    case 'approved':
    case 'published':
      return 'lifted-card__status--approved';
    case 'in_review':
      return 'lifted-card__status--review';
    case 'requested_changes':
    case 'rejected':
    case 'failed':
      return 'lifted-card__status--blocked';
    case 'scheduled':
      return 'lifted-card__status--scheduled';
    default:
      return 'lifted-card__status--draft';
  }
});

const scheduledLabel = computed(() => {
  if (!props.post.scheduled_at) return null;
  const d = new Date(props.post.scheduled_at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
});
</script>

<template>
  <div
    ref="cardEl"
    class="lifted-card"
    :data-flip-stage="flipStage"
    :style="flipStyle"
    @click.stop
  >
    <div v-if="thumbnail" class="lifted-card__media">
      <img :src="thumbnail" :alt="post.caption.slice(0, 80)" />
    </div>
    <div v-else class="lifted-card__media lifted-card__media--empty">
      <Icon name="lucide:image" class="w-10 h-10 text-muted-foreground/40" />
    </div>

    <div class="lifted-card__body">
      <div class="lifted-card__chips">
        <Icon
          v-for="p in uniquePlatforms"
          :key="p"
          :name="platformIcon(p)"
          class="lifted-card__chip"
        />
        <span class="lifted-card__status" :class="statusTone">{{ statusLabel }}</span>
      </div>

      <p class="lifted-card__caption">{{ post.caption || 'Untitled draft' }}</p>

      <div v-if="scheduledLabel" class="lifted-card__schedule">
        <Icon name="lucide:calendar-clock" class="w-3.5 h-3.5" />
        <span>{{ scheduledLabel }}</span>
      </div>

      <p class="lifted-card__hint">
        <Icon name="lucide:expand" class="w-3 h-3" />
        Zoom in (Cmd +) to edit
      </p>
    </div>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.lifted-card {
  @apply relative overflow-hidden rounded-3xl border border-border bg-card shadow-2xl;
  width: min(420px, calc(100vw - 32px));
  transform-origin: center center;
  will-change: transform, opacity;
  /* The master spring — same curve as the canvas surface transform so
     the FLIP feels like part of the same gesture, not a separate
     animation layered on top. */
  transition:
    transform 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
    opacity 400ms cubic-bezier(0.36, 0.66, 0.04, 1);
}

.lifted-card__media {
  @apply relative w-full overflow-hidden bg-muted/40;
  aspect-ratio: 16 / 9;
}

.lifted-card__media img {
  @apply w-full h-full object-cover;
}

.lifted-card__media--empty {
  @apply flex items-center justify-center;
}

.lifted-card__body {
  @apply flex flex-col gap-2 px-4 py-3;
}

.lifted-card__chips {
  @apply flex items-center gap-1.5 flex-wrap;
}

.lifted-card__chip {
  @apply w-3.5 h-3.5 text-muted-foreground;
}

.lifted-card__status {
  @apply ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full
    text-[10px] font-semibold uppercase tracking-wide border;
}

.lifted-card__status--draft { @apply bg-muted/60 text-muted-foreground border-border; }
.lifted-card__status--review { @apply bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30; }
.lifted-card__status--approved { @apply bg-success/12 text-success border-success/30; }
.lifted-card__status--scheduled { @apply bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30; }
.lifted-card__status--blocked { @apply bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30; }

.lifted-card__caption {
  @apply text-sm text-foreground whitespace-pre-wrap line-clamp-4;
}

.lifted-card__schedule {
  @apply inline-flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums;
}

.lifted-card__hint {
  @apply mt-1 inline-flex items-center gap-1.5 text-[11px]
    text-muted-foreground/80;
}

@media (prefers-reduced-motion: reduce) {
  .lifted-card {
    transition: opacity 200ms linear;
  }
}
</style>

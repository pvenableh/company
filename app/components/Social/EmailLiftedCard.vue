<script setup lang="ts">
/**
 * EmailLiftedCard — the focused email leaf at z=2 of the Composition Canvas.
 *
 * P3 Phase 3.3 (composition-canvas-redesign). Sibling of `LiftedCard.vue`
 * for the social side. The chrome is intentionally parallel (FLIP from
 * leaf rect → identity, master spring, opacity-only under
 * prefers-reduced-motion) so the canvas's z=2 affordance feels the same
 * across kinds, but the content shape diverges enough that one form
 * would be more confusing than two siblings. Per the handoff:
 *   "Don't unify the social + email composer into one form yet. Three
 *    failed attempts at 'one form, two configs' patterns."
 *
 * Content: subject (large), preview text, audience-segment chip,
 * delivery-status badge, scheduled-at footer.
 *
 * Motion contract — same as `LiftedCard`:
 *   - Reactive inline transform + CSS transition. NO Vue Transition.
 *   - setTimeout(_, 16) flip (NOT RAF — survives throttled environments).
 *   - prefers-reduced-motion → opacity crossfade only.
 *
 * @see app/components/Social/LiftedCard.vue — the social sibling.
 * @see app/components/Social/CompositionCanvas.vue — host that mounts this.
 */
import type { EmailComposition } from '~~/shared/composition';
import type { LiftSourceRect } from '~/composables/useCompositionZoom';

const props = defineProps<{
  /** Email Composition view-model already loaded by the canvas. */
  composition: EmailComposition;
  /** Bounding rect of the leaf at click time. Null on deep-link entry
   *  (no FLIP source — we just fade in at rest). */
  sourceRect: LiftSourceRect | null;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

// ── FLIP state machine (mirrors LiftedCard) ────────────────────────
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

function computeFromTransform(): string {
  if (!props.sourceRect || !cardEl.value) return 'translate3d(0, 0, 0) scale(1)';
  const rest = cardEl.value.getBoundingClientRect();
  const src = props.sourceRect;
  const dx = (src.x + src.width / 2) - (rest.x + rest.width / 2);
  const dy = (src.y + src.height / 2) - (rest.y + rest.height / 2);
  const sx = Math.max(0.05, src.width / Math.max(1, rest.width));
  const sy = Math.max(0.05, src.height / Math.max(1, rest.height));
  const s = Math.max(sx, sy);
  return `translate3d(${dx}px, ${dy}px, 0) scale(${s})`;
}

const flipStyle = ref<{ transform: string; opacity: string }>({
  transform: 'translate3d(0, 0, 0) scale(1)',
  opacity: props.sourceRect ? '0' : '1',
});

onMounted(() => {
  nextTick(() => {
    if (prefersReducedMotion.value || !props.sourceRect) {
      flipStyle.value = { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '1' };
      flipStage.value = 'to';
      return;
    }
    flipStyle.value = { transform: computeFromTransform(), opacity: '1' };
    flipStage.value = 'from';
    setTimeout(() => {
      flipStyle.value = { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '1' };
      flipStage.value = 'to';
    }, 16);
  });
});

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

// ── Content helpers ──────────────────────────────────────────────
const subject = computed(() => props.composition.subject || 'Untitled email');
const previewText = computed(() => props.composition.preview_text || '');
const bodyPreview = computed(() => {
  const md = props.composition.body || '';
  // Strip markdown structural chars for a one-glance preview. Not a
  // full renderer — the composer at z=3 is where the user actually
  // reads/edits the body.
  return md.replace(/[#>*_`~\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
});

const audienceLabel = computed(() => {
  const t = props.composition.targets[0];
  if (!t) return 'All contacts';
  if (t.kind === 'audience_segment') {
    if (t.filter.startsWith('cluster:')) {
      return t.filter.slice('cluster:'.length).replace(/_/g, ' ');
    }
    if (t.filter === 'all') return 'All contacts';
    if (t.filter === 'opened_previous') return 'Opened previously';
    if (t.filter === 'unopened_previous') return 'Unopened previously';
    return t.filter;
  }
  if (t.kind === 'mailing_list') return t.list_name;
  return 'Audience';
});

const statusLabel = computed(() => {
  switch (props.composition.status) {
    case 'draft': return 'Draft';
    case 'scheduled': return 'Scheduled';
    case 'sending': return 'Sending';
    case 'sent': return 'Sent';
    case 'failed': return 'Failed';
  }
});

const statusTone = computed(() => {
  switch (props.composition.status) {
    case 'scheduled': return 'lifted-card__status--scheduled';
    case 'sent': return 'lifted-card__status--approved';
    case 'sending': return 'lifted-card__status--review';
    case 'failed': return 'lifted-card__status--blocked';
    default: return 'lifted-card__status--draft';
  }
});

const scheduledLabel = computed(() => {
  if (!props.composition.scheduled_at) return null;
  const d = new Date(props.composition.scheduled_at);
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
    class="lifted-card lifted-card--email"
    :data-flip-stage="flipStage"
    :style="flipStyle"
    @click.stop
  >
    <div class="lifted-card__email-banner">
      <Icon name="lucide:mail" class="w-5 h-5" />
      <span class="lifted-card__kind">Email</span>
      <span class="lifted-card__status" :class="statusTone">{{ statusLabel }}</span>
    </div>

    <div class="lifted-card__body">
      <p class="lifted-card__subject">{{ subject }}</p>

      <p v-if="previewText" class="lifted-card__preview">
        <Icon name="lucide:eye" class="w-3 h-3 inline mr-1 opacity-60" />
        {{ previewText }}
      </p>

      <p v-if="bodyPreview" class="lifted-card__body-excerpt">{{ bodyPreview }}…</p>

      <div class="lifted-card__chips">
        <span class="lifted-card__audience">
          <Icon name="lucide:users" class="w-3 h-3" />
          {{ audienceLabel }}
        </span>
      </div>

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
  width: min(440px, calc(100vw - 32px));
  transform-origin: center center;
  will-change: transform, opacity;
  transition:
    transform 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
    opacity 400ms cubic-bezier(0.36, 0.66, 0.04, 1);
}

.lifted-card--email {
  /* Email hue — muted violet (h=270) distinct from any social channel
     (instagram 330, tiktok 188, linkedin 210, facebook 232, threads 0,
     twitter 198, youtube 8). Picked to feel quietly editorial rather
     than competing with the social colourful palette. */
  --email-hue: 270;
}

.lifted-card__email-banner {
  @apply flex items-center gap-2 px-4 py-3 text-white;
  background: linear-gradient(
    135deg,
    hsl(var(--email-hue) 55% 55%) 0%,
    hsl(var(--email-hue) 60% 38%) 100%
  );
  box-shadow: inset 0 -1px 0 0 hsl(var(--email-hue) 65% 25% / 0.5);
}

.lifted-card__kind {
  @apply text-[11px] font-semibold uppercase tracking-wider;
}

.lifted-card__body {
  @apply flex flex-col gap-2 px-4 py-3;
}

.lifted-card__subject {
  @apply text-base font-semibold text-foreground leading-snug line-clamp-2;
}

.lifted-card__preview {
  @apply text-xs text-muted-foreground italic line-clamp-1;
}

.lifted-card__body-excerpt {
  @apply text-[12px] text-foreground/80 leading-relaxed line-clamp-3;
}

.lifted-card__chips {
  @apply flex items-center gap-1.5 flex-wrap;
}

.lifted-card__audience {
  @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-full
    text-[10px] font-medium uppercase tracking-wide
    bg-muted/60 text-muted-foreground border border-border;
}

.lifted-card__status {
  @apply ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full
    text-[10px] font-semibold uppercase tracking-wide border;
}

.lifted-card__status--draft { @apply bg-white/15 text-white border-white/25; }
.lifted-card__status--review { @apply bg-amber-500/25 text-amber-50 border-amber-400/40; }
.lifted-card__status--approved { @apply bg-success/30 text-white border-success/40; }
.lifted-card__status--scheduled { @apply bg-sky-500/25 text-sky-50 border-sky-400/40; }
.lifted-card__status--blocked { @apply bg-rose-500/30 text-rose-50 border-rose-400/40; }

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

<!--
  PlanCardStack — collapsed-plan render for StudioSurface.

  Shows a front-most StudioPostCard with up to 2 peeking "back" cards behind
  it (translate-y + scale + opacity for the deck illusion). Arrow buttons /
  ← → keys cycle frontIndex; Enter opens the per-post detail (parent handles).
  "Open Plan" CTA deep-links to /social/plans/[id].

  Cover order: posts sorted by scheduled_at ascending (nulls last). When the
  state filter has reduced bucket.posts to a single match, the stack renders
  a flat single card (no arrows, no peeking layers).
-->
<script setup lang="ts">
import { Icon } from '#components';
import { useSwipe } from '@vueuse/core';
import { Button } from '~/components/ui/button';
import type { ContentPlanRecord, SocialPost } from '~~/shared/social';
import StudioPostCard from './StudioPostCard.vue';

const props = defineProps<{
  plan: ContentPlanRecord;
  posts: SocialPost[];
}>();

const emit = defineEmits<{ (e: 'open-post', post: SocialPost): void }>();

// Earliest scheduled_at first; missing scheduled_at sorts last so plans with
// any scheduled posts surface those before stray drafts.
const ordered = computed(() => {
  const list = [...props.posts];
  list.sort((a, b) => {
    const aTs = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
    const bTs = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
    return aTs - bTs;
  });
  return list;
});

const frontIndex = ref(0);
watch(ordered, () => { frontIndex.value = 0; });

const front = computed<SocialPost | null>(() => ordered.value[frontIndex.value] ?? null);
const backOne = computed<SocialPost | null>(() => {
  if (ordered.value.length < 2) return null;
  return ordered.value[(frontIndex.value + 1) % ordered.value.length] ?? null;
});
const backTwo = computed<SocialPost | null>(() => {
  if (ordered.value.length < 3) return null;
  return ordered.value[(frontIndex.value + 2) % ordered.value.length] ?? null;
});

const canCycle = computed(() => ordered.value.length > 1);

function next() {
  if (!canCycle.value) return;
  frontIndex.value = (frontIndex.value + 1) % ordered.value.length;
}

function prev() {
  if (!canCycle.value) return;
  frontIndex.value = (frontIndex.value - 1 + ordered.value.length) % ordered.value.length;
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  else if (e.key === 'Enter' && front.value) { e.preventDefault(); emit('open-post', front.value); }
}

// Touch swipe — left advances, right goes back. Skip when there's nothing to
// cycle. useSwipe ignores mouse drags by default (touch-only), which is the
// intent: desktop has the arrow buttons + keyboard.
const deckEl = useTemplateRef<HTMLElement>('deckEl');
useSwipe(deckEl, {
  threshold: 40,
  onSwipeEnd: (_e, direction) => {
    if (!canCycle.value) return;
    if (direction === 'left') next();
    else if (direction === 'right') prev();
  },
});
</script>

<template>
  <div
    class="plan-card-stack"
    role="region"
    :aria-label="`Posts in ${plan.title || 'plan'}`"
    tabindex="0"
    @keydown="onKey"
  >
    <div ref="deckEl" class="plan-card-stack__deck">
      <!-- Back layer 2 (farthest) — absolute, sized to match front -->
      <div
        v-if="backTwo"
        class="plan-card-stack__layer plan-card-stack__layer--back-2"
        aria-hidden="true"
      >
        <StudioPostCard :post="backTwo" as-background-layer />
      </div>
      <!-- Back layer 1 — absolute, sized to match front -->
      <div
        v-if="backOne"
        class="plan-card-stack__layer plan-card-stack__layer--back-1"
        aria-hidden="true"
      >
        <StudioPostCard :post="backOne" as-background-layer />
      </div>
      <!-- Front (interactive) — in flow, defines deck height -->
      <div v-if="front" class="plan-card-stack__layer plan-card-stack__layer--front">
        <StudioPostCard :post="front" @click="emit('open-post', front!)" />
      </div>
    </div>

    <div class="plan-card-stack__controls">
      <button
        v-if="canCycle"
        type="button"
        class="plan-card-stack__nav"
        aria-label="Previous post"
        @click="prev"
      >
        <Icon name="lucide:chevron-left" class="w-4 h-4" />
      </button>
      <div class="plan-card-stack__counter" aria-live="polite">
        <template v-if="ordered.length === 1">
          <span>1 post</span>
        </template>
        <template v-else>
          <span aria-hidden="true">{{ frontIndex + 1 }} / {{ ordered.length }}</span>
          <span class="sr-only">{{ frontIndex + 1 }} of {{ ordered.length }}</span>
        </template>
      </div>
      <button
        v-if="canCycle"
        type="button"
        class="plan-card-stack__nav"
        aria-label="Next post"
        @click="next"
      >
        <Icon name="lucide:chevron-right" class="w-4 h-4" />
      </button>
    </div>

    <div class="plan-card-stack__cta">
      <Button as-child size="sm">
        <NuxtLink :to="`/social/plans/${plan.id}`">
          Open Plan
          <Icon name="lucide:arrow-right" class="w-3.5 h-3.5 ml-1" />
        </NuxtLink>
      </Button>
    </div>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.plan-card-stack {
  @apply flex flex-col items-center gap-3 py-4 outline-none;
}

.plan-card-stack__deck {
  /* Front layer is in flow and defines the deck height. Back layers are
     absolute and matched to inset-0 so they tile behind the front at the
     same dimensions, then transform-translated to peek above. */
  @apply relative w-full max-w-sm mx-auto;
}

.plan-card-stack__layer--front {
  @apply relative z-20;
}

.plan-card-stack__layer--back-1,
.plan-card-stack__layer--back-2 {
  @apply absolute inset-0 transition-transform duration-200 ease-out pointer-events-none;
}

.plan-card-stack__layer--back-2 {
  transform: translateY(-14px) scale(0.94);
  opacity: 0.55;
  z-index: 10;
  filter: blur(0.5px);
}

.plan-card-stack__layer--back-1 {
  transform: translateY(-7px) scale(0.97);
  opacity: 0.8;
  z-index: 15;
}

.plan-card-stack__controls {
  @apply flex items-center gap-3;
}

.plan-card-stack__nav {
  @apply inline-flex items-center justify-center w-7 h-7 rounded-full
    border border-border bg-card text-muted-foreground
    hover:text-foreground hover:border-foreground/40 transition-colors;
}

.plan-card-stack__counter {
  @apply text-xs font-medium tabular-nums text-muted-foreground min-w-[3rem] text-center;
}

.plan-card-stack__cta {
  @apply mt-1;
}
</style>

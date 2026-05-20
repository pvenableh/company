<!--
  PlanGridCard — one cell of the Studio Approval grid.

  Renders a plan as a self-contained card: title chip + state + client meta on
  top, a Swiper effect-cards stack of its posts in the middle, and an
  "Open Plan" CTA at the bottom. Posts ordered by scheduled_at ascending
  (nulls last). Empty plans render an "Add posts" empty-state in the stack
  zone instead of the swiper. Single-post plans skip Swiper and render the
  card flat — no point in a 1-card deck.
-->
<script setup lang="ts">
import { Swiper, SwiperSlide } from 'swiper/vue';
import { EffectCards } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-cards';
import type { ContentPlanRecord, ContentPlanState, SocialPost } from '~~/shared/social';
import StudioPostCard from './StudioPostCard.vue';

const props = defineProps<{
  plan: ContentPlanRecord;
  posts: SocialPost[];
  clientName?: string | null;
}>();

defineEmits<{ (e: 'open-post', post: SocialPost): void }>();

// Open Plan → push the 'social-plan' slide-over panel instead of routing
// away. The page route /social/plans/[id] still works as a deep-link.
const planSlide = useAppSlideOver('social-plan');
function openPlan() {
  planSlide.open(String(props.plan.id));
}

const ordered = computed(() => {
  const list = [...props.posts];
  list.sort((a, b) => {
    const aTs = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
    const bTs = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
    return aTs - bTs;
  });
  return list;
});

function stateTone(s: ContentPlanState | undefined): string {
  switch (s) {
    case 'approved': return 'bg-success/12 text-success border-success/30';
    case 'in_review': return 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30';
    case 'archived': return 'bg-muted/60 text-muted-foreground border-border';
    default: return 'bg-muted/60 text-muted-foreground border-border';
  }
}

function stateLabel(s: ContentPlanState | undefined): string {
  if (!s) return 'Draft';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatYearMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTH_NAMES[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

const planTitle = computed(() => {
  if (props.plan.title) return props.plan.title;
  const month = props.plan.target_month ? formatYearMonth(props.plan.target_month) : '';
  return month || 'Untitled Plan';
});
</script>

<template>
  <article class="plan-grid-card">
    <header class="plan-grid-card__header">
      <div class="min-w-0 flex-1">
        <h3 class="plan-grid-card__title">{{ planTitle }}</h3>
        <p v-if="clientName" class="plan-grid-card__client">{{ clientName }}</p>
      </div>
      <span class="plan-grid-card__state" :class="stateTone(plan.state)">
        {{ stateLabel(plan.state) }}
      </span>
    </header>

    <div class="plan-grid-card__stack">
      <!-- Empty: nudge into the plan editor -->
      <button
        v-if="!ordered.length"
        type="button"
        class="plan-grid-card__empty"
        @click="openPlan"
      >
        <Icon name="lucide:plus" class="w-5 h-5" />
        <span>Add posts inside</span>
      </button>

      <!-- Single post: render flat, no Swiper needed -->
      <div v-else-if="ordered.length === 1" class="plan-grid-card__single">
        <StudioPostCard :post="ordered[0]" @click="$emit('open-post', ordered[0])" />
      </div>

      <!-- Multi: Swiper effect-cards deck -->
      <Swiper
        v-else
        :modules="[EffectCards]"
        effect="cards"
        :grab-cursor="true"
        :cards-effect="{ perSlideOffset: 8, perSlideRotate: 2, slideShadows: false }"
        class="plan-grid-card__swiper"
      >
        <SwiperSlide v-for="post in ordered" :key="post.id" class="plan-grid-card__slide">
          <StudioPostCard :post="post" @click="$emit('open-post', post)" />
        </SwiperSlide>
      </Swiper>
    </div>

    <footer class="plan-grid-card__footer">
      <button type="button" class="plan-grid-card__cta" @click="openPlan">
        Open Plan
        <Icon name="lucide:arrow-right" class="w-3.5 h-3.5" />
      </button>
      <span class="plan-grid-card__count">
        {{ ordered.length }} {{ ordered.length === 1 ? 'post' : 'posts' }}
      </span>
    </footer>
  </article>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.plan-grid-card {
  @apply flex flex-col rounded-2xl border border-border bg-card overflow-hidden
    transition-shadow duration-200 hover:shadow-md hover:shadow-foreground/5;
}

.plan-grid-card__header {
  @apply flex items-start gap-2 px-4 py-3 border-b border-border;
}

.plan-grid-card__title {
  @apply text-sm font-semibold text-foreground line-clamp-1;
}

.plan-grid-card__client {
  @apply text-[11px] text-muted-foreground line-clamp-1 mt-0.5;
}

.plan-grid-card__state {
  @apply shrink-0 inline-flex items-center px-2 py-0.5 rounded-full
    text-[10px] font-semibold uppercase tracking-wide border;
}

.plan-grid-card__stack {
  /* Square-ish stack zone so the Swiper deck doesn't grow taller than its
     siblings — Swiper assigns wrapper height from the active slide. */
  @apply relative w-full px-6 py-5;
}

.plan-grid-card__empty {
  @apply flex flex-col items-center justify-center gap-2
    aspect-[4/5] max-w-[240px] mx-auto
    rounded-xl border border-dashed border-border/60 bg-muted/20
    text-xs text-muted-foreground
    hover:text-foreground hover:border-foreground/30 hover:bg-muted/40
    transition-colors;
}

.plan-grid-card__single {
  @apply max-w-[240px] mx-auto;
}

.plan-grid-card__swiper {
  /* Swiper itself manages slide sizing; we cap the deck width so the
     rotated peek-slides don't bleed outside the card. */
  max-width: 240px;
  margin-left: auto;
  margin-right: auto;
  overflow: visible;
}

.plan-grid-card__slide {
  /* effect-cards drives transforms/opacity; just give each slide a clean
     surface and clip overflow so rounded corners hold. */
  @apply rounded-xl overflow-hidden;
}

.plan-grid-card__footer {
  @apply flex items-center justify-between gap-2 px-4 py-2.5
    border-t border-border bg-muted/20;
}

.plan-grid-card__cta {
  @apply inline-flex items-center gap-1 text-xs font-medium text-foreground
    hover:text-primary transition-colors;
}

.plan-grid-card__count {
  @apply text-[11px] text-muted-foreground tabular-nums;
}
</style>

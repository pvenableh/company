<!--
  StudioPostCard — pure visual extract of the .studio-card tile.
  Consumed by the unattached-posts grid in StudioSurface and by the Swiper
  effect-cards deck inside PlanGridCard. No data fetching; the parent passes a
  SocialPost and listens for @click.
-->
<script setup lang="ts">
import { Icon } from '#components';
import type { SocialPost } from '~~/shared/social';

type ApprovalState = NonNullable<SocialPost['approval_state']>;

defineProps<{
  post: SocialPost;
  // When the card is a non-front member of a stack, suppress the click target
  // so only the front card is keyboard- and pointer-interactive.
  asBackgroundLayer?: boolean;
}>();

defineEmits<{ (e: 'click', post: SocialPost): void }>();

const { getStatusBorderedBadgeClasses } = useStatusStyle();
function stateTone(s: ApprovalState | undefined): string {
  return getStatusBorderedBadgeClasses(s);
}

function stateLabel(s: ApprovalState | undefined): string {
  switch (s) {
    case 'in_review': return 'In Review';
    case 'requested_changes': return 'Changes Requested';
    default: return (s || 'draft').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
</script>

<template>
  <component
    :is="asBackgroundLayer ? 'div' : 'button'"
    :type="asBackgroundLayer ? undefined : 'button'"
    :tabindex="asBackgroundLayer ? -1 : undefined"
    :aria-hidden="asBackgroundLayer || undefined"
    class="studio-card group"
    @click="!asBackgroundLayer && $emit('click', post)"
  >
    <div class="studio-card__media">
      <img
        v-if="post.design_image_url"
        :src="post.design_image_url"
        :alt="post.caption.slice(0, 80)"
        loading="lazy"
      />
      <img
        v-else-if="post.media_urls && post.media_urls.length"
        :src="post.media_urls[0]"
        :alt="post.caption.slice(0, 80)"
        loading="lazy"
      />
      <div v-else class="studio-card__placeholder">
        <Icon name="lucide:image" class="w-9 h-9 text-muted-foreground/30" />
      </div>
      <span class="studio-card__state" :class="stateTone(post.approval_state)">
        {{ stateLabel(post.approval_state) }}
      </span>
      <div v-if="post.figma_frame_url" class="studio-card__figma" title="Figma frame linked">
        <Icon name="lucide:figma" class="w-3 h-3" />
      </div>
    </div>
    <div class="studio-card__body">
      <p class="studio-card__caption">
        {{ post.caption || 'Untitled draft' }}
      </p>
    </div>
  </component>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.studio-card {
  @apply flex flex-col text-left bg-card border border-border/70 rounded-xl
    overflow-hidden transition-all duration-200
    hover:-translate-y-0.5 hover:shadow-lg hover:shadow-foreground/5
    hover:border-foreground/20 focus-visible:outline-none
    focus-visible:ring-2 focus-visible:ring-primary;
}

.studio-card__media {
  @apply relative aspect-[4/5] bg-muted/40 overflow-hidden;
}

.studio-card__media img {
  @apply w-full h-full object-cover transition-transform duration-500 ease-out;
}

.studio-card:hover .studio-card__media img {
  @apply scale-[1.04];
}

.studio-card__placeholder {
  @apply absolute inset-0 flex items-center justify-center;
  background-image:
    linear-gradient(135deg, hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.06), transparent 60%);
}

.studio-card__body {
  @apply px-3 py-2.5;
}

.studio-card__caption {
  @apply text-xs text-foreground line-clamp-2 leading-snug;
}

.studio-card__state {
  @apply absolute top-2 left-2 inline-flex items-center
    px-2 py-0.5 rounded-full
    text-[10px] font-semibold uppercase tracking-wide
    border backdrop-blur-sm;
}

.studio-card__figma {
  @apply absolute top-2 right-2 inline-flex items-center justify-center
    w-6 h-6 rounded-full bg-white/85 dark:bg-black/55
    text-foreground backdrop-blur-sm border border-white/40 dark:border-black/40
    shadow-sm;
}
</style>

<script setup lang="ts">
/**
 * InstagramGridPreview
 *
 * Profile-chrome + 3-col grid mockup that previews how a batch of planned
 * posts will look on an Instagram profile wall. Used in:
 *   - Plan editor (right rail / modal) so staff can see the month at a glance
 *   - /portal/plans/[token] so the client sees the same view in review
 *
 * Pure presentation. Accepts a list of posts and an optional account; sorts
 * scheduled_at DESC (newest-first, matching IG) and renders the design cover
 * image for each. Click-tile emits `select-post` for drill-in.
 */
import type { SocialAccountPublic } from '~~/shared/social'

type GridPost = {
  id: string
  design_image_url?: string | null
  media_urls?: string[] | null
  scheduled_at?: string | null
  post_type?: string | null
  caption?: string | null
}

const props = defineProps<{
  account?: SocialAccountPublic | null
  /** Optional explicit handle/name fallback when account isn't connected yet */
  handle?: string | null
  name?: string | null
  avatarUrl?: string | null
  posts: GridPost[]
  /** Show post-count / followers / following row. Defaults true. */
  showStats?: boolean
  /** Highlight which post is currently selected (border accent) */
  selectedPostId?: string | null
}>()

const emit = defineEmits<{ (e: 'select-post', postId: string): void }>()

const displayHandle = computed(() => {
  return (
    props.account?.account_handle ||
    props.handle ||
    props.account?.account_name ||
    props.name ||
    'your.brand'
  )
})

const displayName = computed(() => props.account?.account_name || props.name || '')
const displayAvatar = computed(() => props.account?.profile_picture_url || props.avatarUrl || null)

const sortedPosts = computed<GridPost[]>(() => {
  return [...(props.posts || [])].sort((a, b) => {
    const ta = a.scheduled_at ? Date.parse(a.scheduled_at) : 0
    const tb = b.scheduled_at ? Date.parse(b.scheduled_at) : 0
    return tb - ta
  })
})

function thumbFor(post: GridPost): string | null {
  return post.design_image_url || (post.media_urls && post.media_urls[0]) || null
}

function isReel(post: GridPost): boolean {
  return post.post_type === 'reel'
}
function isCarousel(post: GridPost): boolean {
  return post.post_type === 'carousel'
}
</script>

<template>
  <div class="ig-wall">
    <!-- Profile header -->
    <div class="ig-wall__header">
      <div class="ig-wall__avatar">
        <div class="ig-wall__avatar-ring">
          <div class="ig-wall__avatar-inner">
            <img v-if="displayAvatar" :src="displayAvatar" :alt="displayHandle" />
            <UIcon v-else name="i-lucide-user" class="w-6 h-6 text-gray-400" />
          </div>
        </div>
      </div>
      <div class="ig-wall__meta">
        <p class="ig-wall__handle">{{ displayHandle }}</p>
        <p v-if="displayName" class="ig-wall__name">{{ displayName }}</p>
        <div v-if="showStats !== false" class="ig-wall__stats">
          <span><strong>{{ sortedPosts.length }}</strong> {{ sortedPosts.length === 1 ? 'post' : 'posts' }}</span>
          <span>—</span>
          <span class="text-muted-foreground/70">Preview</span>
        </div>
      </div>
    </div>

    <!-- Tab strip (decorative) -->
    <div class="ig-wall__tabs">
      <div class="ig-wall__tab ig-wall__tab--active">
        <UIcon name="i-lucide-grid-3x3" class="w-3.5 h-3.5" />
      </div>
      <div class="ig-wall__tab">
        <UIcon name="i-lucide-play-square" class="w-3.5 h-3.5" />
      </div>
      <div class="ig-wall__tab">
        <UIcon name="i-lucide-user-square" class="w-3.5 h-3.5" />
      </div>
    </div>

    <!-- Grid -->
    <div v-if="sortedPosts.length" class="ig-wall__grid">
      <button
        v-for="post in sortedPosts"
        :key="post.id"
        type="button"
        class="ig-wall__tile"
        :class="{ 'ig-wall__tile--active': selectedPostId === post.id }"
        :title="post.caption || ''"
        @click="emit('select-post', post.id)"
      >
        <img v-if="thumbFor(post)" :src="thumbFor(post)!" :alt="post.caption?.slice(0, 60) || ''" loading="lazy" />
        <div v-else class="ig-wall__tile-empty">
          <UIcon name="i-lucide-image" class="w-6 h-6 text-gray-300" />
        </div>
        <span v-if="isReel(post)" class="ig-wall__tile-badge ig-wall__tile-badge--reel">
          <UIcon name="i-lucide-play" class="w-3 h-3" />
        </span>
        <span v-else-if="isCarousel(post)" class="ig-wall__tile-badge">
          <UIcon name="i-lucide-copy" class="w-3 h-3" />
        </span>
      </button>
    </div>

    <!-- Empty state -->
    <div v-else class="ig-wall__empty">
      <div class="ig-wall__empty-grid">
        <div v-for="i in 9" :key="i" class="ig-wall__empty-tile" />
      </div>
      <p class="text-xs text-muted-foreground mt-3">
        Add posts to see how the month fills out the wall.
      </p>
    </div>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.ig-wall {
  @apply rounded-2xl border border-border bg-white text-gray-900 overflow-hidden;
  /* Phone-like aspect ratio cue */
  max-width: 360px;
}

.ig-wall__header {
  @apply flex items-center gap-3 px-4 py-3 border-b border-gray-200;
}

.ig-wall__avatar {
  @apply shrink-0;
}

.ig-wall__avatar-ring {
  @apply w-14 h-14 rounded-full p-[2px];
  background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
}

.ig-wall__avatar-inner {
  @apply w-full h-full rounded-full bg-white p-[2px] flex items-center justify-center overflow-hidden;
}

.ig-wall__avatar-inner img {
  @apply w-full h-full object-cover rounded-full;
}

.ig-wall__meta {
  @apply flex-1 min-w-0;
}

.ig-wall__handle {
  @apply text-sm font-semibold text-gray-900 truncate;
}

.ig-wall__name {
  @apply text-xs text-gray-500 truncate;
}

.ig-wall__stats {
  @apply mt-1 flex items-center gap-1.5 text-[11px] text-gray-600;
}

.ig-wall__tabs {
  @apply grid grid-cols-3 border-b border-gray-200;
}

.ig-wall__tab {
  @apply flex items-center justify-center py-2 text-gray-400;
}

.ig-wall__tab--active {
  @apply text-gray-900 border-t-2 border-gray-900 -mt-px;
}

.ig-wall__grid {
  @apply grid grid-cols-3 gap-[2px] bg-white;
}

.ig-wall__tile {
  @apply relative aspect-square bg-gray-100 overflow-hidden
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
    transition-transform duration-150;
}

.ig-wall__tile:hover {
  filter: brightness(1.05);
}

.ig-wall__tile img {
  @apply w-full h-full object-cover;
}

.ig-wall__tile--active {
  @apply ring-2 ring-primary ring-offset-1;
}

.ig-wall__tile-empty {
  @apply absolute inset-0 flex items-center justify-center;
}

.ig-wall__tile-badge {
  @apply absolute top-1.5 right-1.5
    inline-flex items-center justify-center
    w-5 h-5 rounded-full bg-black/55 text-white
    backdrop-blur-sm;
}

.ig-wall__tile-badge--reel {
  @apply bg-black/70;
}

.ig-wall__empty {
  @apply px-4 py-5 bg-white;
}

.ig-wall__empty-grid {
  @apply grid grid-cols-3 gap-[2px];
}

.ig-wall__empty-tile {
  @apply aspect-square bg-gray-100;
}
</style>

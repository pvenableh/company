<script setup lang="ts">
/**
 * Plan review card — the shared body of both portal review surfaces.
 *
 *   /portal/plans/[token]  (anonymous emailed link)
 *   /portal/content        (logged-in portal user, listed per-plan)
 *
 * Renders the hero, strategy, posts list with per-post Approve / Request
 * Changes, IG wall preview, and the plan-level Approve CTA. Actions are
 * routed through the plan-level token endpoints in both surfaces — the
 * `approval_token` is on the plan in both cases. The logged-in surface
 * does NOT do per-post-token approval; it relies on the same plan-token
 * flow so we have one code path to maintain.
 *
 * On successful action, the component re-fetches its own plan via the
 * by-token endpoint (or emits a refetch request when in `embedded` mode).
 */
import type { ContentPlanRecord, SocialPost, SocialAccountPublic } from '~~/shared/social'

const props = defineProps<{
  plan: ContentPlanRecord
  posts: SocialPost[]
  /** Optional — supplies the username/avatar chrome for the IG wall preview. */
  igAccount?: SocialAccountPublic | null
  /**
   * When true, the host page owns data fetching and we emit `refresh` rather
   * than refetching ourselves. The standalone /portal/plans/[token] page sets
   * this to false (the default) so the card is self-contained.
   */
  embedded?: boolean
  /** Compact rendering for listing multiple plans on /portal/content. */
  collapsed?: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const toast = useToast()

const planBusy = ref(false)
const postBusy = ref<Record<string, boolean>>({})
const expanded = ref(!props.collapsed)
const selectedPostId = ref<string | null>(null)

// Which post has its "request changes" feedback box open, and the draft note.
const feedbackFor = ref<string | null>(null)
const feedbackText = ref('')

function openFeedback(postId: string) {
  feedbackFor.value = postId
  feedbackText.value = ''
}
function cancelFeedback() {
  feedbackFor.value = null
  feedbackText.value = ''
}

const token = computed(() => props.plan.approval_token || '')

const planTitle = computed(() => {
  if (props.plan.title) return props.plan.title
  const month = monthLabel(props.plan.target_month)
  return month || 'Content Plan'
})

const allApproved = computed(() => {
  if (!props.posts.length) return false
  return props.posts.every(
    (p) =>
      p.approval_state === 'approved' ||
      p.approval_state === 'scheduled' ||
      p.approval_state === 'published',
  )
})

const showActionBar = computed(
  () => props.plan.state === 'in_review' && !!token.value && !allApproved.value,
)

const showApprovedNotice = computed(() => props.plan.state === 'approved')

async function approvePlan() {
  if (!token.value) {
    toast.add({
      title: 'Cannot approve',
      description: 'Plan has not been sent for review yet.',
      icon: 'i-lucide-alert-circle',
      color: 'yellow',
    })
    return
  }
  planBusy.value = true
  try {
    await $fetch(`/api/social/plans/${props.plan.id}/portal-approve`, {
      method: 'POST',
      body: { token: token.value },
    })
    toast.add({
      title: 'Plan approved',
      description: 'Your scheduled posts are queued for publishing.',
      icon: 'i-lucide-check-circle',
      color: 'green',
    })
    emit('refresh')
  } catch (err: any) {
    toast.add({
      title: 'Could not approve',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  } finally {
    planBusy.value = false
  }
}

async function actOnPost(postId: string, action: 'approve' | 'request_changes', note?: string) {
  if (!token.value) return
  postBusy.value[postId] = true
  try {
    await $fetch(`/api/social/plans/${props.plan.id}/portal-post-action`, {
      method: 'POST',
      body: { token: token.value, postId, action, note: note?.trim() || undefined },
    })
    toast.add({
      title: action === 'approve' ? 'Post approved' : 'Feedback sent',
      icon: action === 'approve' ? 'i-lucide-check' : 'i-lucide-message-square',
      color: 'green',
    })
    if (action === 'request_changes') cancelFeedback()
    emit('refresh')
  } catch (err: any) {
    toast.add({
      title: 'Action failed',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  } finally {
    postBusy.value[postId] = false
  }
}

function onGridSelect(id: string) {
  selectedPostId.value = id
  nextTick(() => {
    const el = document.getElementById(`review-post-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

// ── Helpers ────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`
}

function formatPostDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function postTone(p: SocialPost): string {
  const s = p.approval_state || 'draft'
  switch (s) {
    case 'approved':
    case 'published':
      return 'bg-success/12 text-success border-success/30'
    case 'in_review':
      return 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30'
    case 'requested_changes':
    case 'rejected':
      return 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30'
    case 'scheduled':
      return 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30'
    default:
      return 'bg-muted/60 text-muted-foreground border-border'
  }
}

function postStateLabel(p: SocialPost): string {
  const s = p.approval_state || 'draft'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
</script>

<template>
  <article class="plan-review">
    <!-- Hero -->
    <header class="plan-review__hero">
      <div class="plan-review__band" />
      <div class="plan-review__hero-body">
        <p class="text-[10px] uppercase tracking-wide text-muted-foreground">
          Content Plan
        </p>
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="plan-review__title">{{ planTitle }}</h2>
          <button
            v-if="collapsed"
            type="button"
            class="plan-review__expand-btn"
            @click="expanded = !expanded"
          >
            <Icon :name="expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-4 h-4" />
            {{ expanded ? 'Hide' : 'Review' }}
          </button>
        </div>
        <p v-if="plan.objective" class="plan-review__objective">{{ plan.objective }}</p>
        <div v-if="plan.themes && plan.themes.length" class="plan-review__chips">
          <span v-for="t in plan.themes" :key="t" class="plan-review__chip">{{ t }}</span>
        </div>
      </div>
    </header>

    <template v-if="expanded">
      <!-- Plan-level action bar -->
      <section v-if="showActionBar" class="plan-review__action-bar">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-foreground">Approve the whole month?</p>
          <p class="text-xs text-muted-foreground">
            Approves every post in this plan. Posts with a scheduled time start publishing automatically.
          </p>
        </div>
        <UiActionButton
          icon="lucide:check-circle"
          variant="primary"
          :loading="planBusy"
          @click="approvePlan"
        >
          Approve Plan
        </UiActionButton>
      </section>

      <section v-else-if="showApprovedNotice" class="plan-review__approved">
        <Icon name="lucide:check-circle-2" class="w-6 h-6 text-success" />
        <div class="flex-1">
          <p class="text-sm font-semibold text-foreground">Plan approved</p>
          <p class="text-xs text-muted-foreground">
            Thanks for reviewing. Scheduled posts will go live at the times shown below.
          </p>
        </div>
      </section>

      <div class="plan-review__layout">
        <div class="plan-review__main">
          <section v-if="plan.strategy" class="plan-review__card">
            <header class="plan-review__card-header">
              <Icon name="lucide:compass" class="w-4 h-4 text-primary" />
              <h3>The strategy</h3>
            </header>
            <div class="plan-review__card-body">
              <p class="plan-review__strategy">{{ plan.strategy }}</p>
            </div>
          </section>

          <section class="plan-review__card">
            <header class="plan-review__card-header">
              <Icon name="lucide:images" class="w-4 h-4 text-primary" />
              <h3>The posts</h3>
              <span class="ml-auto text-[11px] text-muted-foreground">
                {{ posts.length }} {{ posts.length === 1 ? 'post' : 'posts' }}
              </span>
            </header>

            <div v-if="posts.length === 0" class="plan-review__card-body text-sm text-muted-foreground">
              No posts in this plan yet.
            </div>
            <div v-else class="plan-review__card-body space-y-4">
              <article
                v-for="p in posts"
                :id="`review-post-${p.id}`"
                :key="p.id"
                class="plan-review__post"
                :class="{ 'plan-review__post--active': selectedPostId === p.id }"
              >
                <div class="plan-review__post-media">
                  <img
                    v-if="p.design_image_url || (p.media_urls && p.media_urls[0])"
                    :src="p.design_image_url || p.media_urls[0]"
                    :alt="p.caption?.slice(0, 60) || ''"
                    loading="lazy"
                  />
                  <div v-else class="plan-review__post-media-empty">
                    <Icon name="lucide:image" class="w-9 h-9 text-muted-foreground/30" />
                  </div>
                </div>
                <div class="plan-review__post-body">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="capitalize text-[11px] text-muted-foreground">{{ p.post_type }}</span>
                    <span class="opacity-40 text-muted-foreground">·</span>
                    <span class="text-[11px] text-muted-foreground">{{ formatPostDate(p.scheduled_at) }}</span>
                    <span class="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border" :class="postTone(p)">
                      {{ postStateLabel(p) }}
                    </span>
                  </div>
                  <p class="plan-review__post-caption">{{ p.caption || '(empty)' }}</p>

                  <!-- Feedback the client already left on this post -->
                  <p
                    v-if="p.client_feedback && feedbackFor !== p.id"
                    class="plan-review__post-feedback"
                  >
                    <Icon name="lucide:message-square" class="w-3.5 h-3.5 shrink-0" />
                    <span>You asked: “{{ p.client_feedback }}”</span>
                  </p>

                  <template v-if="(p.approval_state === 'in_review' || p.approval_state === 'requested_changes') && token">
                    <!-- Inline "what to change" box -->
                    <div v-if="feedbackFor === p.id" class="plan-review__feedback">
                      <textarea
                        v-model="feedbackText"
                        rows="2"
                        maxlength="2000"
                        placeholder="What would you like changed? (optional)"
                        class="plan-review__feedback-note"
                      />
                      <div class="plan-review__post-actions">
                        <UiActionButton
                          icon="lucide:send"
                          variant="primary"
                          :loading="postBusy[p.id]"
                          @click="actOnPost(p.id, 'request_changes', feedbackText)"
                        >
                          Send Feedback
                        </UiActionButton>
                        <button type="button" class="plan-review__feedback-cancel" @click="cancelFeedback">
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div v-else class="plan-review__post-actions">
                      <UiActionButton
                        icon="lucide:check"
                        variant="primary"
                        :loading="postBusy[p.id]"
                        @click="actOnPost(p.id, 'approve')"
                      >
                        Approve
                      </UiActionButton>
                      <UiActionButton
                        icon="lucide:rotate-ccw"
                        :loading="postBusy[p.id]"
                        @click="openFeedback(p.id)"
                      >
                        Request Changes
                      </UiActionButton>
                    </div>
                  </template>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="plan-review__rail">
          <section class="plan-review__card plan-review__rail-sticky">
            <header class="plan-review__card-header">
              <Icon name="logos:instagram-icon" class="w-4 h-4" />
              <h3>How your wall will look</h3>
            </header>
            <div class="plan-review__card-body">
              <SocialInstagramGridPreview
                :account="igAccount ?? null"
                :posts="posts"
                :selected-post-id="selectedPostId"
                @select-post="onGridSelect"
              />
              <p class="text-[11px] text-muted-foreground/80 mt-3 leading-relaxed">
                Newest-first preview of the planned month. Tap a tile to scroll to that post.
              </p>
            </div>
          </section>
        </aside>
      </div>

      <section v-if="showActionBar" class="plan-review__action-bar plan-review__action-bar--bottom">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-foreground">All looking good?</p>
          <p class="text-xs text-muted-foreground">Approve the entire plan to move everything ahead.</p>
        </div>
        <UiActionButton
          icon="lucide:check-circle"
          variant="primary"
          :loading="planBusy"
          @click="approvePlan"
        >
          Approve Plan
        </UiActionButton>
      </section>
    </template>
  </article>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.plan-review {
  @apply space-y-5;
}

.plan-review__hero {
  @apply relative rounded-2xl border border-border bg-card overflow-hidden;
}

.plan-review__band {
  @apply h-16;
  background: linear-gradient(135deg, hsl(220 60% 56% / 0.85), hsl(280 60% 56% / 0.85));
}

.plan-review__hero-body {
  @apply px-6 pt-3 pb-5;
}

.plan-review__title {
  @apply text-2xl font-semibold text-foreground tracking-tight mt-0.5;
}

.plan-review__expand-btn {
  @apply inline-flex items-center gap-1 px-2.5 py-1 rounded-full
    text-xs font-medium text-muted-foreground hover:text-foreground
    bg-muted/60 hover:bg-muted border border-border/60 transition-colors;
}

.plan-review__objective {
  @apply text-sm text-muted-foreground mt-1 max-w-2xl;
}

.plan-review__chips {
  @apply mt-3 flex flex-wrap items-center gap-1.5;
}

.plan-review__chip {
  @apply inline-flex items-center px-2 py-0.5 rounded-full
    bg-muted text-foreground text-[11px] font-medium border border-border;
}

.plan-review__action-bar {
  @apply flex items-center gap-3 flex-wrap
    rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3;
}

.plan-review__action-bar--bottom {
  @apply mt-4;
}

.plan-review__approved {
  @apply flex items-center gap-3
    rounded-2xl border border-success/30 bg-success/5 px-4 py-3;
}

.plan-review__layout {
  @apply grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5;
}

.plan-review__main {
  @apply space-y-5 min-w-0;
}

.plan-review__rail {
  @apply min-w-0;
}

.plan-review__rail-sticky {
  @apply lg:sticky lg:top-4;
}

.plan-review__card {
  @apply rounded-2xl border border-border bg-card overflow-hidden;
}

.plan-review__card-header {
  @apply flex items-center gap-2 px-4 py-3 border-b border-border;
}

.plan-review__card-header h3 {
  @apply text-sm font-semibold text-foreground;
}

.plan-review__card-body {
  @apply px-4 py-4;
}

.plan-review__strategy {
  @apply text-sm text-foreground whitespace-pre-wrap leading-relaxed;
}

.plan-review__post {
  @apply flex gap-4 p-3 rounded-xl border border-transparent transition-colors;
}

.plan-review__post--active {
  @apply bg-primary/5 border-primary/30;
}

.plan-review__post-media {
  @apply w-32 h-32 rounded-lg bg-muted overflow-hidden shrink-0;
}

.plan-review__post-media img {
  @apply w-full h-full object-cover;
}

.plan-review__post-media-empty {
  @apply w-full h-full flex items-center justify-center;
}

.plan-review__post-body {
  @apply flex-1 min-w-0 space-y-2;
}

.plan-review__post-caption {
  @apply text-sm text-foreground whitespace-pre-wrap leading-relaxed line-clamp-5;
}

.plan-review__post-actions {
  @apply flex items-center gap-2 pt-1;
}

.plan-review__post-feedback {
  @apply flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300 italic pt-1;
}

.plan-review__feedback {
  @apply space-y-2 pt-1;
}

.plan-review__feedback-note {
  @apply w-full rounded-xl border border-border bg-background px-3 py-2 text-sm
    resize-none focus:outline-none focus:ring-2 focus:ring-primary/40;
}

.plan-review__feedback-cancel {
  @apply text-xs text-muted-foreground hover:text-foreground px-2;
}
</style>

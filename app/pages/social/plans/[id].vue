<script setup lang="ts">
/**
 * Plan Editor — /social/plans/[id]
 *
 * Camila's monthly content-plan workspace. One screen:
 *   - Header: title (auto-derived) + state pill + Send for Review CTA
 *   - Strategy card: objective + themes + rich-text strategy + cover image
 *   - Posts list: inline rows (caption + cover + scheduled_at + platforms),
 *                 each opens the existing per-post Studio detail by id
 *   - Right rail: InstagramGridPreview (sticky) showing the wall mock
 *
 * Loads /api/social/plans/:id (plan + posts), wires PATCH on every field,
 * and POST /api/social/plans/:id/send-for-review when the plan is ready.
 */
import type { ContentPlanRecord, ContentPlanState, SocialPost, SocialAccountPublic } from '~~/shared/social'

definePageMeta({
  layout: 'apps',
  middleware: ['auth'],
})

useHead({ title: 'Content Plan | Earnest' })

const route = useRoute()
const router = useRouter()
const toast = useToast()

const planId = computed(() => String(route.params.id))

// ── Fetch plan + posts ────────────────────────────────────────────
const plan = ref<ContentPlanRecord | null>(null)
const posts = ref<SocialPost[]>([])
const loading = ref(false)

async function fetchPlan() {
  loading.value = true
  try {
    const r = await $fetch<{ data: { plan: ContentPlanRecord; posts: SocialPost[] } }>(
      `/api/social/plans/${planId.value}`,
    )
    plan.value = r?.data?.plan ?? null
    posts.value = r?.data?.posts ?? []
  } catch (err: any) {
    console.error('Plan fetch failed', err)
    toast.add({
      title: 'Could not load plan',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  } finally {
    loading.value = false
  }
}

// ── Fetch IG accounts so the wall preview can borrow profile chrome ──
const { data: accountsData } = useLazyFetch('/api/social/accounts')
const allAccounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[])

const igAccount = computed<SocialAccountPublic | null>(() => {
  if (!plan.value) return null
  const clientId = plan.value.target_client
  // Prefer an IG account for the plan's target client; fall back to any IG.
  const igs = allAccounts.value.filter((a) => a.platform === 'instagram')
  if (!igs.length) return null
  const clientIg = clientId ? igs.find((a) => a.client === clientId) : null
  return clientIg || igs[0] || null
})

// ── Header derivation ─────────────────────────────────────────────
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

const projectsById = ref<Map<string, { id: string; title: string; client?: { id: string; name: string } | null }>>(new Map())
const projectItems = useDirectusItems('projects')

async function fetchProjects() {
  try {
    const rows = await projectItems.list({
      fields: ['id', 'title', 'client.id', 'client.name'],
      limit: 500,
    })
    const m = new Map()
    for (const p of rows) m.set(p.id, p)
    projectsById.value = m
  } catch {}
}

const projectTitle = computed(() => {
  if (!plan.value?.project) return null
  return projectsById.value.get(plan.value.project)?.title || null
})

const clientName = computed(() => {
  if (!plan.value) return null
  if (plan.value.target_client) {
    // Try to get name via cached project.client first, then accounts as fallback.
    const fromProject = plan.value.project
      ? projectsById.value.get(plan.value.project)?.client
      : null
    if (fromProject?.id === plan.value.target_client) return fromProject.name
    const ac = allAccounts.value.find((a) => a.client === plan.value!.target_client)
    return ac?.client_name || null
  }
  return null
})

const derivedTitle = computed(() => {
  if (plan.value?.title) return plan.value.title
  const month = monthLabel(plan.value?.target_month)
  const proj = projectTitle.value || 'Plan'
  if (month) return `${month} — ${proj}`
  return proj
})

// ── State badge tones ─────────────────────────────────────────────
function stateTone(s: ContentPlanState | undefined): string {
  switch (s) {
    case 'approved': return 'bg-success/12 text-success border-success/30'
    case 'in_review': return 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30'
    case 'archived': return 'bg-muted/60 text-muted-foreground border-border'
    default: return 'bg-muted/60 text-muted-foreground border-border'
  }
}

function stateLabel(s: ContentPlanState | undefined): string {
  if (!s) return 'Draft'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Inline editing ────────────────────────────────────────────────
// Optimistic PATCH on a single field. Keeps Camila in the flow — no save buttons.
const pending = ref(false)

async function patchPlan(patch: Partial<ContentPlanRecord>) {
  if (!plan.value) return
  pending.value = true
  try {
    const r = await $fetch<{ data: ContentPlanRecord }>(`/api/social/plans/${planId.value}`, {
      method: 'PATCH',
      body: patch,
    })
    if (r?.data) plan.value = r.data
  } catch (err: any) {
    console.error('Plan PATCH failed', err)
    toast.add({
      title: 'Could not save',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  } finally {
    pending.value = false
  }
}

// Debounced strategy editor — text changes shouldn't fire a PATCH per keystroke.
let strategyTimer: ReturnType<typeof setTimeout> | null = null
function onStrategyInput(value: string) {
  if (!plan.value) return
  plan.value.strategy = value
  if (strategyTimer) clearTimeout(strategyTimer)
  strategyTimer = setTimeout(() => patchPlan({ strategy: value }), 600)
}

// Themes: comma-separated chips. Edit by tag input.
const themeDraft = ref('')
function addTheme() {
  const v = themeDraft.value.trim()
  if (!v || !plan.value) return
  const next = [...(plan.value.themes || []), v]
  themeDraft.value = ''
  patchPlan({ themes: next })
}
function removeTheme(idx: number) {
  if (!plan.value?.themes) return
  const next = plan.value.themes.filter((_, i) => i !== idx)
  patchPlan({ themes: next })
}

// ── Add post (inline) ─────────────────────────────────────────────
const newPostCaption = ref('')
const newPostScheduledAt = ref('')
const newPostType = ref<'image' | 'video' | 'carousel' | 'reel' | 'story'>('image')
const addingPost = ref(false)

function defaultScheduledAt(): string {
  const now = new Date()
  now.setHours(10, 0, 0, 0)
  // Default to next available day in the plan's target_month (or today if not set)
  const month = plan.value?.target_month
  if (month) {
    const m = /^(\d{4})-(\d{2})/.exec(month)
    if (m) {
      const [year, mon] = [Number(m[1]), Number(m[2])]
      const dayCursor = posts.value.length + 1
      const day = Math.min(dayCursor, 28)
      const d = new Date(year, mon - 1, day, 10, 0, 0)
      return formatLocalDateTime(d)
    }
  }
  return formatLocalDateTime(now)
}

function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function addPost() {
  if (!plan.value) return
  if (!newPostCaption.value.trim()) {
    toast.add({ title: 'Caption required', icon: 'i-lucide-alert-circle', color: 'yellow' })
    return
  }
  addingPost.value = true
  try {
    const scheduledIso = newPostScheduledAt.value
      ? new Date(newPostScheduledAt.value).toISOString()
      : new Date(defaultScheduledAt()).toISOString()

    const r = await $fetch<{ data: SocialPost }>('/api/social/posts', {
      method: 'POST',
      body: {
        caption: newPostCaption.value.trim(),
        post_type: newPostType.value,
        platforms: [],
        media_urls: [],
        media_types: [],
        status: 'draft',
        approval_state: 'draft',
        scheduled_at: scheduledIso,
        project: plan.value.project,
        target_client: plan.value.target_client,
        target_month: plan.value.target_month,
      },
    })
    // Bind to plan via direct PATCH on the new row's content_plan FK.
    if (r?.data?.id) {
      await $fetch(`/api/social/posts/${r.data.id}`, {
        method: 'PATCH',
        body: { content_plan: plan.value.id },
      })
    }
    newPostCaption.value = ''
    newPostScheduledAt.value = ''
    newPostType.value = 'image'
    await fetchPlan()
    toast.add({ title: 'Post added', icon: 'i-lucide-check', color: 'green' })
  } catch (err: any) {
    console.error('Add post failed', err)
    toast.add({
      title: 'Could not add post',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  } finally {
    addingPost.value = false
  }
}

// ── Send for Review ───────────────────────────────────────────────
const sending = ref(false)
const reviewUrl = ref<string | null>(null)
const showReviewLink = ref(false)

async function sendForReview() {
  if (!plan.value) return
  sending.value = true
  try {
    const r = await $fetch<{ data: { plan: ContentPlanRecord; postsTransitioned: number; reviewUrl: string | null } }>(
      `/api/social/plans/${planId.value}/send-for-review`,
      { method: 'POST' },
    )
    if (r?.data?.plan) plan.value = r.data.plan
    reviewUrl.value = r?.data?.reviewUrl ?? null
    showReviewLink.value = true
    await fetchPlan()
    toast.add({
      title: 'Sent for review',
      description: `${r?.data?.postsTransitioned || 0} post${r?.data?.postsTransitioned === 1 ? '' : 's'} moved to in-review.`,
      icon: 'i-lucide-send',
      color: 'green',
    })
  } catch (err: any) {
    console.error('Send for review failed', err)
    toast.add({
      title: 'Could not send',
      description: err?.data?.message || err?.message || 'Unknown error',
      icon: 'i-lucide-alert-circle',
      color: 'red',
    })
  } finally {
    sending.value = false
  }
}

async function copyReviewUrl() {
  if (!reviewUrl.value) return
  try {
    await navigator.clipboard.writeText(reviewUrl.value)
    toast.add({ title: 'Review link copied', icon: 'i-lucide-clipboard-check', color: 'green' })
  } catch {
    toast.add({ title: 'Copy failed', icon: 'i-lucide-alert-circle', color: 'red' })
  }
}

// ── Post row helpers ──────────────────────────────────────────────
function postTone(p: SocialPost): string {
  const s = p.approval_state || 'draft'
  switch (s) {
    case 'approved': case 'published': return 'bg-success/12 text-success border-success/30'
    case 'in_review': return 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30'
    case 'requested_changes': case 'rejected': return 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30'
    case 'scheduled': return 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30'
    default: return 'bg-muted/60 text-muted-foreground border-border'
  }
}

function postStateLabel(p: SocialPost): string {
  const s = p.approval_state || 'draft'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatPostDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function openPostInStudio(id: string) {
  // Reuse the existing Studio detail modal by jumping back to /apps/marketing?floor=studio
  // with the post id selected. For now, just open the legacy /social/posts/[id]/edit
  // route since that's the canonical compose surface.
  router.push(`/social/posts/${id}/edit`)
}

// Selected post highlight in IG grid
const selectedPostId = ref<string | null>(null)
function onGridSelect(id: string) {
  selectedPostId.value = id
  // Scroll the matching row into view
  nextTick(() => {
    const el = document.getElementById(`plan-post-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

// First-visit intro modal — auto-opens via the modal's own dismissed-at check,
// the "i" badge in the header calls intro.value.open() to re-open it.
const intro = ref<{ open: () => void } | null>(null)

onMounted(() => {
  fetchPlan()
  fetchProjects()
})
</script>

<template>
  <div class="plan-shell">
    <!-- Loading -->
    <div v-if="loading && !plan" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="cg-text-child text-muted-foreground">Loading plan…</p>
    </div>

    <template v-else-if="plan">
      <!-- Header -->
      <section class="plan-hero">
        <div class="flex items-start gap-3 min-w-0">
          <button
            type="button"
            class="plan-hero__back"
            title="Back to Studio"
            @click="router.push('/apps/marketing?floor=studio')"
          >
            <Icon name="lucide:arrow-left" class="w-4 h-4" />
          </button>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="plan-hero__title">{{ derivedTitle }}</h1>
              <span class="plan-hero__state" :class="stateTone(plan.state)">
                {{ stateLabel(plan.state) }}
              </span>
            </div>
            <p class="plan-hero__sub">
              <span v-if="clientName">{{ clientName }}</span>
              <span v-if="clientName && plan.plan_type" class="px-1.5 opacity-40">·</span>
              <span class="capitalize">{{ plan.plan_type.replace(/_/g, ' ') }}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            class="plan-hero__info"
            title="How content plans work"
            @click="intro?.open()"
          >
            <Icon name="lucide:info" class="w-4 h-4" />
          </button>
          <UiActionButton
            v-if="plan.state === 'draft' || plan.state === 'in_review'"
            icon="lucide:send"
            variant="primary"
            :loading="sending"
            @click="sendForReview"
          >
            {{ plan.state === 'in_review' ? 'Resend Review' : 'Send for Review' }}
          </UiActionButton>
        </div>
      </section>

      <!-- Review-link card (appears after Send for Review) -->
      <section v-if="showReviewLink && reviewUrl" class="plan-review-link">
        <div class="flex items-center gap-2">
          <Icon name="lucide:link-2" class="w-4 h-4 text-success shrink-0" />
          <p class="text-xs text-success font-medium">Share this link with your client:</p>
        </div>
        <div class="plan-review-link__row">
          <code class="plan-review-link__url">{{ reviewUrl }}</code>
          <button type="button" class="plan-review-link__copy" @click="copyReviewUrl">
            <Icon name="lucide:clipboard" class="w-3.5 h-3.5" />
            Copy
          </button>
        </div>
      </section>

      <div class="plan-layout">
        <!-- ─── Main column ───────────────────────────────────────── -->
        <div class="plan-main">
          <!-- Strategy card -->
          <section class="plan-card">
            <header class="plan-card__header">
              <Icon name="lucide:compass" class="w-4 h-4 text-primary" />
              <h2>Strategy</h2>
              <span v-if="pending" class="ml-auto text-[10px] text-muted-foreground">Saving…</span>
            </header>

            <div class="plan-card__body space-y-4">
              <UFormGroup label="Objective" description="One-line goal for this plan.">
                <UInput
                  :model-value="plan.objective || ''"
                  placeholder="e.g. Drive RSVPs to the launch event."
                  @blur="(e: any) => patchPlan({ objective: e.target.value || null })"
                />
              </UFormGroup>

              <UFormGroup
                label="Themes"
                description="Themes / pillars (e.g. behind-the-scenes, product hero, testimonials)."
              >
                <div class="plan-themes">
                  <span v-for="(t, i) in plan.themes || []" :key="i" class="plan-theme">
                    {{ t }}
                    <button type="button" class="plan-theme__x" @click="removeTheme(i)" title="Remove">
                      <Icon name="lucide:x" class="w-3 h-3" />
                    </button>
                  </span>
                  <input
                    v-model="themeDraft"
                    type="text"
                    placeholder="Add a theme…"
                    class="plan-theme__input"
                    @keydown.enter.prevent="addTheme"
                  />
                </div>
              </UFormGroup>

              <UFormGroup label="Strategy" description="What you want the client to understand about the month.">
                <UTextarea
                  :model-value="plan.strategy || ''"
                  :rows="6"
                  placeholder="May leans into the new product launch — lead with hero shots in week 1, behind-the-scenes in week 2…"
                  @update:model-value="(v: string) => onStrategyInput(v)"
                />
              </UFormGroup>
            </div>
          </section>

          <!-- Posts list -->
          <section class="plan-card">
            <header class="plan-card__header">
              <Icon name="lucide:images" class="w-4 h-4 text-primary" />
              <h2>Posts</h2>
              <span class="ml-auto text-[11px] text-muted-foreground">
                {{ posts.length }} {{ posts.length === 1 ? 'post' : 'posts' }}
              </span>
            </header>

            <div class="plan-card__body">
              <ul v-if="posts.length" class="space-y-2">
                <li
                  v-for="p in posts"
                  :id="`plan-post-${p.id}`"
                  :key="p.id"
                  class="plan-post-row"
                  :class="{ 'plan-post-row--active': selectedPostId === p.id }"
                  @click="openPostInStudio(p.id)"
                >
                  <div class="plan-post-row__thumb">
                    <img
                      v-if="p.design_image_url || (p.media_urls && p.media_urls[0])"
                      :src="p.design_image_url || p.media_urls[0]"
                      :alt="p.caption.slice(0, 40)"
                      loading="lazy"
                    />
                    <Icon v-else name="lucide:image" class="w-5 h-5 text-muted-foreground/40" />
                  </div>
                  <div class="plan-post-row__body">
                    <p class="plan-post-row__caption">{{ p.caption || 'Untitled draft' }}</p>
                    <div class="plan-post-row__meta">
                      <span class="capitalize">{{ p.post_type }}</span>
                      <span class="opacity-40">·</span>
                      <span>{{ formatPostDate(p.scheduled_at) }}</span>
                      <span v-if="p.platforms?.length" class="opacity-40">·</span>
                      <span v-if="p.platforms?.length">
                        {{ p.platforms.map((pl) => pl.platform).join(', ') }}
                      </span>
                    </div>
                  </div>
                  <span class="plan-post-row__state" :class="postTone(p)">
                    {{ postStateLabel(p) }}
                  </span>
                </li>
              </ul>

              <div v-else class="plan-empty">
                <div class="plan-empty__mark">
                  <Icon name="lucide:layout-grid" class="w-7 h-7" />
                </div>
                <p class="plan-empty__title">Your wall is empty — let's fill it</p>
                <ol class="plan-empty__steps">
                  <li><span class="plan-empty__step-num">1</span>Write the strategy at the top of this page</li>
                  <li><span class="plan-empty__step-num">2</span>Drop in posts below with cover images</li>
                  <li><span class="plan-empty__step-num">3</span>Approve and schedule when the client signs off</li>
                </ol>
                <p class="plan-empty__hint">
                  ↓ Use the row below to add your first post.
                </p>
              </div>

              <!-- Inline add-post -->
              <div class="plan-add-post">
                <div class="plan-add-post__row">
                  <UInput
                    v-model="newPostCaption"
                    placeholder="Caption / post idea…"
                    class="flex-1"
                  />
                  <USelect
                    v-model="newPostType"
                    :options="[
                      { label: 'Image', value: 'image' },
                      { label: 'Video', value: 'video' },
                      { label: 'Carousel', value: 'carousel' },
                      { label: 'Reel', value: 'reel' },
                      { label: 'Story', value: 'story' },
                    ]"
                    option-attribute="label"
                    value-attribute="value"
                    class="w-32"
                  />
                  <UInput
                    v-model="newPostScheduledAt"
                    type="datetime-local"
                    class="w-52"
                  />
                  <UiActionButton
                    icon="lucide:plus"
                    variant="primary"
                    :loading="addingPost"
                    :disabled="!newPostCaption.trim()"
                    @click="addPost"
                  >
                    Add
                  </UiActionButton>
                </div>
                <p class="text-[11px] text-muted-foreground mt-1">
                  Each post lands as a draft. Click a row to add media, platforms, and finalize.
                </p>
              </div>
            </div>
          </section>
        </div>

        <!-- ─── Right rail: IG wall preview ───────────────────────── -->
        <aside class="plan-rail">
          <section class="plan-card plan-rail__sticky">
            <header class="plan-card__header">
              <Icon name="logos:instagram-icon" class="w-4 h-4" />
              <h2>Wall Preview</h2>
            </header>
            <div class="plan-card__body">
              <SocialInstagramGridPreview
                :account="igAccount"
                :posts="posts"
                :selected-post-id="selectedPostId"
                @select-post="onGridSelect"
              />
              <p class="text-[11px] text-muted-foreground/80 mt-3 leading-relaxed">
                Newest-first, like Instagram. Tap a tile to jump to that post.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </template>

    <!-- 404 -->
    <div v-else class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:file-question" class="w-8 h-8 text-muted-foreground" />
      <p class="text-sm text-muted-foreground">Plan not found.</p>
    </div>

    <!-- First-visit intro (auto-opens once; reopen via header "i" badge) -->
    <SocialStudioIntroModal ref="intro" />
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.plan-shell {
  @apply max-w-7xl mx-auto px-4 py-5 space-y-5;
}

.plan-hero {
  @apply flex items-center justify-between gap-3 flex-wrap
    rounded-2xl border border-border bg-card px-4 py-3;
}

.plan-hero__back {
  @apply inline-flex items-center justify-center
    w-8 h-8 rounded-full border border-border bg-muted/40
    text-muted-foreground hover:bg-muted hover:text-foreground
    transition-colors;
}

.plan-hero__info {
  @apply inline-flex items-center justify-center
    w-8 h-8 rounded-full border border-border bg-muted/40
    text-muted-foreground hover:bg-muted hover:text-foreground
    transition-colors;
}

.plan-hero__title {
  @apply text-lg font-semibold text-foreground tracking-tight;
}

.plan-hero__state {
  @apply inline-flex items-center px-2 py-0.5 rounded-full
    text-[10px] font-semibold uppercase tracking-wide border;
}

.plan-hero__sub {
  @apply text-xs text-muted-foreground mt-0.5;
}

.plan-review-link {
  @apply rounded-xl border border-success/30 bg-success/5
    px-4 py-3 space-y-2;
}

.plan-review-link__row {
  @apply flex items-center gap-2 flex-wrap;
}

.plan-review-link__url {
  @apply flex-1 min-w-0 text-xs text-foreground bg-background
    border border-border rounded px-2 py-1 truncate font-mono;
}

.plan-review-link__copy {
  @apply inline-flex items-center gap-1 text-xs font-medium
    text-success hover:underline;
}

.plan-layout {
  @apply grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5;
}

.plan-main {
  @apply space-y-5 min-w-0;
}

.plan-rail {
  @apply min-w-0;
}

.plan-rail__sticky {
  @apply lg:sticky lg:top-4;
}

.plan-card {
  @apply rounded-2xl border border-border bg-card overflow-hidden;
}

.plan-card__header {
  @apply flex items-center gap-2 px-4 py-3 border-b border-border;
}

.plan-card__header h2 {
  @apply text-sm font-semibold text-foreground;
}

.plan-card__body {
  @apply px-4 py-4;
}

.plan-themes {
  @apply flex flex-wrap items-center gap-1.5;
}

.plan-theme {
  @apply inline-flex items-center gap-1
    h-6 px-2 rounded-full
    text-[11px] font-medium
    bg-muted text-foreground border border-border;
}

.plan-theme__x {
  @apply inline-flex items-center justify-center
    text-muted-foreground hover:text-rose-500;
}

.plan-theme__input {
  @apply h-6 px-2 rounded-full text-[11px] bg-transparent
    border border-dashed border-border min-w-[120px]
    focus:outline-none focus:border-primary;
}

.plan-post-row {
  @apply flex items-start gap-3 px-2 py-2 rounded-lg
    border border-transparent
    hover:bg-muted/40 hover:border-border
    cursor-pointer transition-colors;
}

.plan-post-row--active {
  @apply bg-primary/5 border-primary/30;
}

.plan-post-row__thumb {
  @apply w-14 h-14 rounded-lg bg-muted overflow-hidden
    shrink-0 flex items-center justify-center;
}

.plan-post-row__thumb img {
  @apply w-full h-full object-cover;
}

.plan-post-row__body {
  @apply flex-1 min-w-0;
}

.plan-post-row__caption {
  @apply text-sm text-foreground line-clamp-2 leading-snug;
}

.plan-post-row__meta {
  @apply mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground;
}

.plan-post-row__state {
  @apply shrink-0 inline-flex items-center px-2 py-0.5 rounded-full
    text-[10px] font-semibold uppercase tracking-wide border;
}

.plan-add-post {
  @apply mt-4 pt-4 border-t border-border;
}

.plan-add-post__row {
  @apply flex items-center gap-2 flex-wrap;
}

.plan-empty {
  @apply flex flex-col items-center justify-center gap-3 py-8;
}

.plan-empty__mark {
  @apply w-12 h-12 rounded-2xl flex items-center justify-center
    text-muted-foreground/60 bg-muted/40 border border-border/60;
}

.plan-empty__title {
  @apply text-sm font-semibold text-foreground;
}

.plan-empty__steps {
  @apply text-sm text-muted-foreground/90 space-y-1.5 max-w-sm;
  list-style: none;
}

.plan-empty__steps li {
  @apply flex items-start gap-2.5 text-left;
}

.plan-empty__step-num {
  @apply flex shrink-0 items-center justify-center w-5 h-5 rounded-full
    bg-muted/70 text-[10px] font-semibold text-foreground/80 mt-0.5;
}

.plan-empty__hint {
  @apply text-[11px] text-muted-foreground/70 mt-1;
}
</style>

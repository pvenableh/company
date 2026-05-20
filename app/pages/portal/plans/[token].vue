<script setup lang="ts">
/**
 * Portal Plan Review — /portal/plans/[token]
 *
 * Public, anonymous-friendly page that lets the client review a whole content
 * plan under a single emailed link. Authenticates via the plan's
 * `approval_token` (not a user session). All UI lives in PortalPlanReviewCard
 * so the logged-in /portal/content surface renders an identical body.
 */
import type { ContentPlanRecord, SocialPost } from '~~/shared/social'

definePageMeta({ layout: 'blank' })

const route = useRoute()

const token = computed(() => String(route.params.token || ''))

const plan = ref<ContentPlanRecord | null>(null)
const posts = ref<SocialPost[]>([])
const loading = ref(true)
const errorMessage = ref<string | null>(null)

async function fetchPlan() {
  loading.value = true
  errorMessage.value = null
  try {
    const r = await $fetch<{ data: { plan: ContentPlanRecord; posts: SocialPost[] } }>(
      `/api/social/plans/by-token/${token.value}`,
    )
    plan.value = r?.data?.plan ?? null
    posts.value = r?.data?.posts ?? []
  } catch (err: any) {
    errorMessage.value = err?.data?.message || 'This review link is invalid or has expired.'
    plan.value = null
    posts.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchPlan)
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-6">
    <div v-if="loading" class="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Icon name="lucide:loader-2" class="w-10 h-10 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading your content plan…</p>
    </div>

    <div v-else-if="errorMessage" class="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-6 text-center">
      <Icon name="lucide:link-2-off" class="w-12 h-12 text-rose-500" />
      <h1 class="text-lg font-semibold text-foreground">Link unavailable</h1>
      <p class="text-sm text-muted-foreground max-w-md">{{ errorMessage }}</p>
      <p class="text-xs text-muted-foreground/70 max-w-md">
        Reach out to the team who shared this link with you to get a fresh one.
      </p>
    </div>

    <PortalPlanReviewCard
      v-else-if="plan"
      :plan="plan"
      :posts="posts"
      @refresh="fetchPlan"
    />
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";
</style>

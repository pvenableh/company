<script setup lang="ts">
/**
 * /portal/content — logged-in portal review surface.
 *
 * Lists every content plan visible to the active portal scope, rendered
 * via the shared PortalPlanReviewCard so the body matches the anonymous
 * /portal/plans/[token] surface exactly. Multiple plans render collapsed
 * by default — click Review to expand a plan inline.
 */
import type { ContentPlanRecord, SocialPost } from '~~/shared/social';

definePageMeta({
  layout: 'client-portal',
  middleware: ['auth'],
});
useHead({ title: 'Content Review | Client Portal' });

type StateFilter = 'in_review' | 'approved' | 'all';

const STATE_FILTERS: Array<{ key: StateFilter; label: string; icon: string }> = [
  { key: 'in_review', label: 'Needs Review', icon: 'lucide:eye' },
  { key: 'approved', label: 'Approved', icon: 'lucide:check-circle' },
  { key: 'all', label: 'All', icon: 'lucide:list' },
];

interface PlanBundle {
  plan: ContentPlanRecord;
  posts: SocialPost[];
}

const state = ref<StateFilter>('in_review');
const bundles = ref<PlanBundle[]>([]);
const loading = ref(false);

async function fetchPlans() {
  loading.value = true;
  try {
    const r = await $fetch<{ data: PlanBundle[] }>('/api/portal/plans', {
      query: { state: state.value },
    });
    bundles.value = r?.data ?? [];
  } catch (err) {
    console.error('Portal plans fetch failed:', err);
    bundles.value = [];
  } finally {
    loading.value = false;
  }
}

watch(state, fetchPlans);
onMounted(fetchPlans);
</script>

<template>
  <div class="portal-page">
    <AppHeader title="Content Review" />

    <LayoutPageContainer>
      <p class="text-sm text-muted-foreground mb-4 -mt-1">
        Review the month's content plan from your team. Approve everything in one click, or send specific posts back for revisions.
      </p>

      <AppFloorStrip v-model="state" :items="STATE_FILTERS" aria-label="Filter content" />

      <div v-if="loading && !bundles.length" class="flex flex-col items-center justify-center py-24 gap-3">
        <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
        <p class="text-sm text-muted-foreground">Loading content…</p>
      </div>

      <div v-else-if="!bundles.length" class="flex flex-col items-center justify-center py-24 gap-4">
        <Icon name="lucide:check-check" class="w-12 h-12 text-muted-foreground/40" />
        <div class="text-center">
          <p class="text-sm font-medium text-foreground">
            {{ state === 'in_review' ? 'Nothing waiting on you' : 'No plans to show' }}
          </p>
          <p class="text-xs text-muted-foreground/70 mt-1">
            {{ state === 'in_review'
              ? 'Your team will post here when a new month is ready for your approval.'
              : 'Try a different filter to see other content.' }}
          </p>
        </div>
      </div>

      <div v-else class="space-y-6">
        <PortalPlanReviewCard
          v-for="bundle in bundles"
          :key="bundle.plan.id"
          :plan="bundle.plan"
          :posts="bundle.posts"
          :collapsed="bundles.length > 1"
          @refresh="fetchPlans"
        />
      </div>
    </LayoutPageContainer>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.portal-page {
  @apply flex flex-col min-h-full;
}
</style>

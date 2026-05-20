<!--
  PlanDetailPanel — slide-over body for a content plan.

  Wraps the shared `<AppsMarketingPlanWorkspace>` in `compact` mode inside
  `AppSlideOverShell` so the panel renders the same workspace as
  `/social/plans/[id]` without a full-route navigation. Reads the panel
  registry's `id` prop as the planId.
-->
<script setup lang="ts">
import type { ContentPlanRecord } from '~~/shared/social';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const plan = ref<ContentPlanRecord | null>(null);

function onLoaded(p: ContentPlanRecord) {
  plan.value = p;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const title = computed(() => {
  if (!plan.value) return 'Plan';
  if (plan.value.title) return plan.value.title;
  const month = plan.value.target_month;
  if (month) {
    const m = /^(\d{4})-(\d{2})/.exec(month);
    if (m) return `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
  }
  return 'Plan';
});
</script>

<template>
  <AppSlideOverShell :title="title" @close="$emit('close')">
    <template #actions>
      <NuxtLink
        :to="`/social/plans/${id}`"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        title="Open the plan as a full page"
      >
        <Icon name="lucide:external-link" class="w-3 h-3" />
        Full Page
      </NuxtLink>
    </template>

    <AppsMarketingPlanWorkspace
      :plan-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>

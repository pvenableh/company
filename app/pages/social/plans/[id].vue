<script setup lang="ts">
/**
 * Plan Editor — /social/plans/[id]
 *
 * Thin page wrapper. All UI + state lives in
 * `<AppsMarketingPlanWorkspace>` so the same body renders inside the
 * `social-plan` slide-over panel for in-Studio review without a route
 * change. This route stays a stable deep-link target for review emails.
 */
definePageMeta({
  layout: 'apps',
  middleware: ['auth'],
})

useHead({ title: 'Content Plan | Earnest' })

const route = useRoute()
const planId = computed(() => String(route.params.id))
</script>

<template>
  <AppsMarketingPlanWorkspace :plan-id="planId" />
</template>

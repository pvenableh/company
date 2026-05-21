<!--
  /projects/[id]/events/[event] — thin deep-link wrapper.

  Body lives in `<AppsWorkEventWorkspace>` so the same surface renders
  inside the `project-event` slide-over panel as well. This page exists
  so email links and direct URLs still work; apps-shell users hit the
  slide-over via `useAppSlideOver('project-event').open(id)`.
-->
<script setup>
definePageMeta({ layout: false, middleware: ['auth'] });
useHead({ title: 'Project Event | Earnest' });

const { isAppsMode } = useAppsMode();
const layout = computed(() => (isAppsMode.value ? 'apps' : 'default'));

const route = useRoute();
const eventId = computed(() => String(route.params.event));
</script>

<template>
  <NuxtLayout :name="layout">
    <LayoutPageContainer>
      <AppsWorkEventWorkspace :event-id="eventId" />
    </LayoutPageContainer>
  </NuxtLayout>
</template>

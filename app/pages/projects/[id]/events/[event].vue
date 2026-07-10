<!--
  /projects/[id]/events/[event] — thin deep-link wrapper.

  Body lives in `<AppsWorkEventWorkspace>` so the same surface renders
  inside the `project-event` slide-over panel as well. This page exists
  so email links and direct URLs still work; apps-shell users hit the
  slide-over via `useAppSlideOver('project-event').open(id)`.
-->
<script setup>
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Project Event | Earnest' });

const route = useRoute();
const eventId = computed(() => String(route.params.event));
</script>

<template>
  <LayoutPageContainer>
    <AppsWorkEventWorkspace :event-id="eventId" />
  </LayoutPageContainer>
</template>

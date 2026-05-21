<!--
  /meetings/[id] — thin deep-link wrapper.

  Body lives in `<AppsWorkMeetingWorkspace>` so the same surface renders
  inside the `work-meeting` slide-over panel as well. This page exists so
  email links and direct URLs still work; apps-shell users hit the
  slide-over via `useAppSlideOver('work-meeting').open(id)`.
-->
<script setup>
definePageMeta({ layout: false, middleware: ['auth'] });
useHead({ title: 'Meeting recap | Earnest' });

const { isAppsMode } = useAppsMode();
const layout = computed(() => (isAppsMode.value ? 'apps' : 'default'));

const route = useRoute();
const meetingId = computed(() => String(route.params.id));
</script>

<template>
  <NuxtLayout :name="layout">
    <LayoutPageContainer>
      <AppsWorkMeetingWorkspace :meeting-id="meetingId" />
    </LayoutPageContainer>
  </NuxtLayout>
</template>

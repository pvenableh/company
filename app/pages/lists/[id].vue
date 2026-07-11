<!--
  /lists/[id] — thin deep-link wrapper.

  Body lives in `<AppsListsMailingListWorkspace>` so the same surface
  renders inside the `mailing-list` slide-over panel as well. Apps-shell
  users hit the slide-over via `useAppSlideOver('mailing-list').open(id)`.
-->
<script setup lang="ts">
// Layout is owned by the global `apps-layout.global.ts` middleware — no more
// `layout: false` + our own <NuxtLayout>, which remounted the apps shell on
// every navigation (the blank-screen bug). Nuxt keeps the layout persistent.
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Mailing List | Earnest' });

const route = useRoute();
const listId = computed(() => route.params.id as string);
</script>

<template>
  <LayoutPageContainer>
    <AppsListsMailingListWorkspace :list-id="listId" />
  </LayoutPageContainer>
</template>

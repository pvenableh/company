<!--
  /lists/[id] — thin deep-link wrapper.

  Body lives in `<AppsListsMailingListWorkspace>` so the same surface
  renders inside the `mailing-list` slide-over panel as well. Apps-shell
  users hit the slide-over via `useAppSlideOver('mailing-list').open(id)`.
-->
<script setup lang="ts">
definePageMeta({ layout: false, middleware: ['auth'] });
useHead({ title: 'Mailing List | Earnest' });

const route = useRoute();
const listId = computed(() => route.params.id as string);
</script>

<template>
  <NuxtLayout name="apps">
    <LayoutPageContainer>
      <AppsListsMailingListWorkspace :list-id="listId" />
    </LayoutPageContainer>
  </NuxtLayout>
</template>

<!--
  /proposals/[id] — thin deep-link wrapper.

  Body lives in `<AppsDocumentsProposalWorkspace>` so the same surface
  renders inside the `proposal` slide-over panel as well. This page
  exists so email links and direct URLs still work; apps-shell users
  hit the slide-over via `useAppSlideOver('proposal').open(id)`.
-->
<script setup lang="ts">
definePageMeta({ layout: false, middleware: ['auth'] });
useHead({ title: 'Proposal | Earnest' });

const { isAppsMode } = useAppsMode();
const layout = computed(() => (isAppsMode.value ? 'apps' : 'default'));

const route = useRoute();
const proposalId = computed(() => route.params.id as string);
</script>

<template>
  <NuxtLayout :name="layout">
    <LayoutPageContainer>
      <AppsDocumentsProposalWorkspace :proposal-id="proposalId" />
    </LayoutPageContainer>
  </NuxtLayout>
</template>

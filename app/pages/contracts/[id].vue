<!--
  /contracts/[id] — thin deep-link wrapper.

  Body lives in `<AppsDocumentsContractWorkspace>` so the same surface
  renders inside the `contract` slide-over panel as well. This page
  exists so email links and direct URLs still work; apps-shell users
  hit the slide-over via `useAppSlideOver('contract').open(id)`.
-->
<script setup lang="ts">
definePageMeta({ layout: false, middleware: ['auth'] });
useHead({ title: 'Contract | Earnest' });

const route = useRoute();
const contractId = computed(() => route.params.id as string);
</script>

<template>
  <NuxtLayout name="apps">
    <LayoutPageContainer>
      <AppsDocumentsContractWorkspace :contract-id="contractId" />
    </LayoutPageContainer>
  </NuxtLayout>
</template>

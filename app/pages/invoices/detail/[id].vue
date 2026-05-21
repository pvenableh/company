<!--
  /invoices/detail/[id] — thin deep-link wrapper.

  Body lives in `<AppsMoneyInvoiceWorkspace>` so the same surface renders
  inside the `invoice` slide-over panel as well. This page exists so
  email links and direct URLs still work; apps-shell users hit the
  slide-over via `useAppSlideOver('invoice').open(id)`.
-->
<script setup lang="ts">
definePageMeta({ layout: false, middleware: ['auth'] });
useHead({ title: 'Invoice Detail | Earnest' });

// Apps-mode users get the apps shell so this legacy route isn't orphaned
// from the AppRail. Classic mode keeps the original sidebar.
const { isAppsMode } = useAppsMode();
const layout = computed(() => (isAppsMode.value ? 'apps' : 'default'));

const route = useRoute();
const invoiceId = computed(() => route.params.id as string);
</script>

<template>
  <NuxtLayout :name="layout">
    <LayoutPageContainer>
      <AppsMoneyInvoiceWorkspace :invoice-id="invoiceId" />
    </LayoutPageContainer>
  </NuxtLayout>
</template>

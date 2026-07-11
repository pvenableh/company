<!--
  /invoices/detail/[id] — thin deep-link wrapper.

  Body lives in `<AppsMoneyInvoiceWorkspace>` so the same surface renders
  inside the `invoice` slide-over panel as well. This page exists so
  email links and direct URLs still work; apps-shell users hit the
  slide-over via `useAppSlideOver('invoice').open(id)`.
-->
<script setup lang="ts">
// Layout is owned by the global `apps-layout.global.ts` middleware — no more
// `layout: false` + our own <NuxtLayout>, which remounted the apps shell on
// every navigation (the blank-screen bug). Nuxt keeps the layout persistent.
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Invoice Detail | Earnest' });

const route = useRoute();
const invoiceId = computed(() => route.params.id as string);
</script>

<template>
  <LayoutPageContainer>
    <AppsMoneyInvoiceWorkspace :invoice-id="invoiceId" />
  </LayoutPageContainer>
</template>

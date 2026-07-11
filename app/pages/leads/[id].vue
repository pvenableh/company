<!--
  /leads/[id] — thin deep-link wrapper.

  Body lives in `<AppsClientsLeadWorkspace>` so the same surface renders
  inside the `lead` slide-over panel as well. This page exists so email
  links and direct URLs still work; apps-shell users hit the slide-over
  via `useAppSlideOver('lead').open(id)`.
-->
<script setup>
// Layout is owned by the global `apps-layout.global.ts` middleware — no more
// `layout: false` + our own <NuxtLayout>, which remounted the apps shell on
// every navigation (the blank-screen bug). Nuxt keeps the layout persistent.
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Lead | Earnest' });

const route = useRoute();
const leadId = computed(() => String(route.params.id));
</script>

<template>
  <LayoutPageContainer>
    <AppsClientsLeadWorkspace :lead-id="leadId" />
  </LayoutPageContainer>
</template>

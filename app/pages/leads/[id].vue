<!--
  /leads/[id] — thin deep-link wrapper.

  Body lives in `<AppsClientsLeadWorkspace>` so the same surface renders
  inside the `lead` slide-over panel as well. This page exists so email
  links and direct URLs still work; apps-shell users hit the slide-over
  via `useAppSlideOver('lead').open(id)`.
-->
<script setup>
definePageMeta({ layout: false, middleware: ['auth'] });
useHead({ title: 'Lead | Earnest' });

const { isAppsMode } = useAppsMode();
const layout = computed(() => (isAppsMode.value ? 'apps' : 'default'));

const route = useRoute();
const leadId = computed(() => String(route.params.id));
</script>

<template>
  <NuxtLayout :name="layout">
    <LayoutPageContainer>
      <AppsClientsLeadWorkspace :lead-id="leadId" />
    </LayoutPageContainer>
  </NuxtLayout>
</template>

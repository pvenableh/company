<script setup lang="ts">
// Authenticated org-creation wizard. The whole flow lives in <OnboardingFlow>;
// this page just gates it behind auth and mounts it in 'org' mode.
definePageMeta({ middleware: ['auth'], layout: false })
useHead({ title: 'New Organization | Earnest' })
</script>

<template>
  <OnboardingFlow mode="org" />
</template>

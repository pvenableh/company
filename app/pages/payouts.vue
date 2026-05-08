<script setup lang="ts">
// Legacy /payouts route — superseded by the per-org Billing tab once Stripe
// Connect Express shipped. The old page exposed Hue's platform-Stripe payouts
// to anyone with `invoices` access, which leaked Earnest's bank deposits.
// Redirect everyone to the org-scoped surface.
definePageMeta({
	middleware: ['auth'],
});

await navigateTo('/organization?tab=billing', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

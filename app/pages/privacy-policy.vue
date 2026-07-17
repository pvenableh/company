<script setup lang="ts">
/**
 * Privacy Policy — /privacy-policy
 *
 * The canonical copy lives on the marketing site (earnest.guru/privacy-policy).
 * This route stays alive so existing in-app links keep working (signup consent
 * in RegisterForm, sell-sheet footers) — it just redirects to the single source
 * of truth instead of carrying a second copy that drifts. See the note in
 * terms-of-service.vue for the drift that motivated consolidating.
 */
definePageMeta({ layout: 'default' });

await navigateTo('https://earnest.guru/privacy-policy', { external: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

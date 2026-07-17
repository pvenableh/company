<script setup lang="ts">
/**
 * Terms of Service — /terms-of-service
 *
 * The canonical copy lives on the marketing site (earnest.guru/terms-of-service),
 * which already declares itself canonical via <link rel="canonical">. This route
 * stays alive so existing in-app links keep working (signup consent in
 * RegisterForm, sell-sheet footers) — it just redirects to the single source of
 * truth instead of carrying a second copy.
 *
 * WHY: the two copies had already drifted. The legal body text was identical,
 * but the published contact address differed (this copy said hello@earnest.guru,
 * marketing says contact@huestudios.com) — two live versions naming different
 * notice addresses. One canonical copy removes that class of bug.
 */
definePageMeta({ layout: 'default' });

await navigateTo('https://earnest.guru/terms-of-service', { external: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

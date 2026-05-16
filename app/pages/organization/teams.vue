<script setup lang="ts">
// Teams now lives as the `teams` tab on /organization. This route exists
// only to preserve inbound links (Spotlight, footer, in-app NuxtLinks) —
// it redirects to the canonical destination so there's a single source
// of truth for team management UI.
definePageMeta({
	middleware: 'auth',
});

if (import.meta.server) {
	await navigateTo('/organization?tab=teams', { redirectCode: 301 });
} else {
	await navigateTo('/organization?tab=teams', { replace: true });
}
</script>

<template>
	<div />
</template>

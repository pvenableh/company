<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });

// Marketing Feed has been folded into the top of /marketing.
// Preserve any inbound deep links that referenced /marketing-feed.
if (import.meta.server) {
	await navigateTo('/marketing', { redirectCode: 301 });
} else {
	await navigateTo('/marketing', { replace: true });
}
</script>

<template>
	<div />
</template>

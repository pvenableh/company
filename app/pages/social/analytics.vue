<script setup lang="ts">
// Legacy /social/analytics — body now lives at
// app/components/Social/AnalyticsSurface.vue and is rendered inside the
// Marketing app's Studio floor (?floor=studio&view=analytics).
definePageMeta({
	middleware: ['auth'],
});

await navigateTo('/apps/marketing?floor=studio&view=analytics', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

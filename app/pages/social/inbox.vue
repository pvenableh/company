<script setup lang="ts">
// Legacy /social/inbox — body now lives at
// app/components/Social/InboxSurface.vue and is rendered inside the
// Marketing app's Studio floor (?floor=studio&view=inbox).
definePageMeta({
	middleware: ['auth'],
});

await navigateTo('/apps/marketing?floor=studio&view=inbox', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

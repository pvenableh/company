<script setup lang="ts">
// Legacy /social — folded into the Marketing app's Studio floor.
// The Social-as-launcher pattern was bouncing users out of the app shell
// on every drill-down. Studio is now the canonical home for every post.
definePageMeta({
	middleware: ['auth'],
});

await navigateTo('/apps/marketing?floor=studio', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

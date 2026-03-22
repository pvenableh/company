<script setup lang="ts">
definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'AI Chat | Earnest' });

// Redirect chat to channels (consolidated messaging)
await navigateTo('/channels', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

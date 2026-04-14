<script setup lang="ts">
definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Chat | Earnest' });

// Redirect chat to channels (consolidated messaging)
await navigateTo('/channels', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

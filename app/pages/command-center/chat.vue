<script setup lang="ts">
definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Chat | Earnest' });

// Redirect chat to the channels comms hub (consolidated messaging)
await navigateTo('/apps/channels', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

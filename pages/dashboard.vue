<script setup>
definePageMeta({
	middleware: ['auth'],
});

// Redirect dashboard to command center
await navigateTo('/command-center', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

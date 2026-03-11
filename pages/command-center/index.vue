<script setup>
definePageMeta({
	middleware: ['auth'],
});

// Redirect command-center to home page (command center is now at /)
await navigateTo('/', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

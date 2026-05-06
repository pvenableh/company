<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });

// People Intelligence is now the Insights tab on /contacts.
// Preserve any inbound deep links that referenced /people.
if (import.meta.server) {
	await navigateTo('/contacts?view=insights', { redirectCode: 301 });
} else {
	await navigateTo('/contacts?view=insights', { replace: true });
}
</script>

<template>
	<div />
</template>

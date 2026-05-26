<script setup lang="ts">
// Legacy /social/compose — the composer body now lives inside the
// Composition Canvas (P3.5). This page redirects to the canvas with a
// create-mode social composer pre-opened. Prefill query params (caption,
// account, cta_url, cta_label) are no longer honored — the canvas
// composer doesn't read them off the URL. File a follow-up if needed.
definePageMeta({
	middleware: ['auth'],
});

await navigateTo(
	{
		path: '/apps/marketing',
		query: { floor: 'studio', view: 'calendar', z: '3', id: 'compose:social' },
	},
	{ replace: true, redirectCode: 301 },
);
</script>

<template>
	<div />
</template>

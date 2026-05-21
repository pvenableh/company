<script setup lang="ts">
/**
 * /contacts/import is the legacy entry — the canonical home is now the
 * Marketing app's Audience floor, where the wizard opens as an
 * ImportContactsPanel slide-over. Redirect preserves the deep-link.
 */
definePageMeta({ middleware: ['auth'] });

await navigateTo({
	path: '/apps/marketing',
	query: { floor: 'audience', slide: 'import-contacts:new' },
	replace: true,
});
</script>

<template>
	<div />
</template>

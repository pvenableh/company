<script setup lang="ts">
/**
 * /carddesk is the legacy entry — the canonical home is the Clients app's
 * Card Desk tab. Redirect preserves any `?selected=<id>` deep-link param.
 */
definePageMeta({ middleware: ['auth'] });
const route = useRoute();
await navigateTo({
	path: '/apps/clients',
	query: { view: 'carddesk', ...(route.query.selected ? { selected: String(route.query.selected) } : {}) },
	replace: true,
});
</script>

<template>
	<div />
</template>

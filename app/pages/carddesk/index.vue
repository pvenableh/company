<script setup lang="ts">
/**
 * /carddesk is consolidated into /contacts?view=carddesk so the noun
 * (people you're networking with) has a single home alongside List + Insights.
 * Existing links + bookmarks still work — they redirect here, preserving any
 * `?selected=<id>` deep-link param.
 */
definePageMeta({ middleware: ['auth'] });
const route = useRoute();
await navigateTo({
	path: '/contacts',
	query: { view: 'carddesk', ...(route.query.selected ? { selected: String(route.query.selected) } : {}) },
	replace: true,
});
</script>

<template>
	<div />
</template>

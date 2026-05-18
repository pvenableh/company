<script setup lang="ts">
/**
 * /contacts is the legacy entry — the canonical home is now the Clients
 * app's "All Contacts" tab at /apps/clients?view=contacts. Insights and
 * Card Desk sub-views live alongside it under ?view=insights and
 * ?view=carddesk respectively.
 *
 * Forwarded params: a `?view=` qs gets handed straight through so external
 * links to /contacts?view=insights still land on the right tab.
 */
definePageMeta({ middleware: ['auth'] });

const route = useRoute();
const incomingView = typeof route.query.view === 'string' ? route.query.view : '';

// Mapping:
//   /contacts                  → /apps/clients?view=contacts
//   /contacts?view=insights    → /apps/clients?view=contacts&subview=insights
//   /contacts?view=carddesk    → /apps/clients?view=carddesk
//   /contacts?view=list        → /apps/clients?view=contacts
const forwardedQuery: Record<string, string> = {};
if (incomingView === 'carddesk') {
	forwardedQuery.view = 'carddesk';
} else {
	forwardedQuery.view = 'contacts';
	if (incomingView === 'insights') forwardedQuery.subview = 'insights';
}
if (route.query.selected) forwardedQuery.selected = String(route.query.selected);

await navigateTo({ path: '/apps/clients', query: forwardedQuery, replace: true });
</script>

<template>
	<div />
</template>

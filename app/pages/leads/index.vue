<script setup lang="ts">
/**
 * /leads is the legacy entry — the canonical home is the People app's
 * Leads tab at /apps/clients?view=leads, where it sits alongside the
 * other people-noun lenses (Clients, Contacts, Partners, Card Desk,
 * Intelligence). /leads/[id] and /leads/automations keep their own routes.
 */
definePageMeta({ middleware: ['auth'] });
await navigateTo({ path: '/apps/clients', query: { view: 'leads' }, replace: true });
</script>

<template>
	<div />
</template>

<!--
	/account/subscription — legacy route. Subscription & billing now lives in
	the Organization app's Billing floor (`/apps/organization?floor=billing`),
	which renders the same <AppsAccountSubscriptionSurface>. This route stays
	alive only to redirect old bookmarks and any in-flight Stripe return URLs
	(session_id is preserved so the surface can still show the success toast).
-->
<script setup lang="ts">
definePageMeta({ layout: 'apps', middleware: ['auth'] });

const route = useRoute();
await navigateTo(
	{ path: '/apps/organization', query: { ...route.query, floor: 'billing' } },
	{ redirectCode: 302, replace: true },
);
</script>

<template>
	<div />
</template>

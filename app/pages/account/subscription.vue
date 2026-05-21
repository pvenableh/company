<!--
	/account/subscription — thin deep-link wrapper around
	`<AppsAccountSubscriptionSurface>`. Keeps the route alive so Stripe
	Checkout success / cancel return URLs continue to land here. In-shell
	access happens via the `account-subscription` slide-over panel,
	opened from the Integrations floor's Plaid CTA.
-->
<script setup lang="ts">
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Subscription | Earnest' });
</script>

<template>
	<LayoutPageContainer size="narrow">
		<AppsAccountSubscriptionSurface />
	</LayoutPageContainer>
</template>

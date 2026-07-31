<script setup lang="ts">
// Public signup — the password-at-end draft flow. The whole journey (account →
// fun steps → set password → trial) lives in <OnboardingFlow> in 'draft' mode.
definePageMeta({
	layout: false,
	middleware: 'guest',
});
useHead({ title: 'Get started | Earnest' });

const route = useRoute();

// `?ref=<orgId>` marks a subscriber referral; thread the id through for
// attribution (the org's Stripe customer is stamped at completion).
const referredBy = computed(() => {
	const r = route.query.ref;
	return typeof r === 'string' && r ? r : null;
});
</script>

<template>
	<OnboardingFlow mode="draft" :referred-by="referredBy" />
</template>

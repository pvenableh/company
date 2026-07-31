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
// attribution (the org's Stripe customer is stamped at completion) and resolve
// the referrer's brand so the account step can show a branded invite banner.
const referredBy = computed(() => {
	const r = route.query.ref;
	return typeof r === 'string' && r ? r : null;
});

interface Referrer { id: string; name: string | null; logo: string | null; brand_color: string | null }
const referrer = ref<Referrer | null>(null);

onMounted(async () => {
	if (!referredBy.value) return;
	try {
		referrer.value = await $fetch<Referrer>('/api/org/referral-brand', {
			query: { ref: referredBy.value },
		});
	} catch {
		// Unknown/invalid ref — fall back to the plain signup silently.
		referrer.value = null;
	}
});
</script>

<template>
	<OnboardingFlow mode="draft" :referred-by="referredBy" :referrer="referrer" />
</template>

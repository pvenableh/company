<script setup lang="ts">
// /proposals is now a thin redirect to the Documents floor inside the
// Money app — see document-system overhaul step 5 (2026-05-18). The
// proposal list body lives in MoneyProposalsList; row clicks open a
// slide-over instead of navigating to /proposals/[id].
//
// Preserves two inbound query patterns:
//   - `?new=1&lead=X` from the lead detail page "Proposal" CTA
//   - bare `/proposals` from old links + sidebar items
//
// `?new=1` is dropped during the redirect — the Money floor doesn't yet
// surface a lead-prefilled create modal. The lead page now owns its own
// "New Proposal" affordance.
definePageMeta({
	middleware: 'auth',
});

useHead({ title: 'Proposals | Earnest' });

const target = {
	path: '/apps/money',
	query: { floor: 'documents', tab: 'proposals' },
} as const;

if (import.meta.server) {
	await navigateTo(target, { redirectCode: 301 });
} else {
	await navigateTo(target, { replace: true });
}
</script>

<template>
	<div />
</template>

<script setup lang="ts">
// /contracts is now a thin redirect to the Documents floor inside the
// Money app — see document-system overhaul step 5 (2026-05-18). The
// contract list body lives in MoneyContractsList; row clicks open a
// slide-over instead of navigating to /contracts/[id].
definePageMeta({
	middleware: 'auth',
});

useHead({ title: 'Contracts | Earnest' });

const target = {
	path: '/apps/money',
	query: { floor: 'documents', tab: 'contracts' },
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

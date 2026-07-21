<script setup lang="ts">
// Legacy alias — Service Offerings now live in the Documents Library slide-over
// on the modern org hub. Kept as a thin redirect so bookmarked URLs still
// resolve; points straight at the modern surface (no intermediate hop).
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Documents Library | Earnest' });
const target = { path: '/apps/organization', query: { floor: 'settings', slide: 'documents_library:offerings' } } as const;
if (import.meta.server) {
	await navigateTo(target, { redirectCode: 301 });
} else {
	await navigateTo(target, { replace: true });
}
</script>
<template>
	<div class="flex items-center justify-center py-16 t-text-muted text-sm">Redirecting to Documents Library…</div>
</template>

<script setup lang="ts">
// Roles & Permissions is a slide-over panel in the apps layout. This
// route exists only to preserve inbound links — it redirects into the
// apps layout with the `roles` slide-over already on the stack.
definePageMeta({
	middleware: 'auth',
});

useHead({ title: 'Roles | Earnest' });

const target = { path: '/apps/organization', query: { floor: 'settings', slide: 'roles:_' } } as const;

if (import.meta.server) {
	await navigateTo(target, { redirectCode: 301 });
} else {
	await navigateTo(target, { replace: true });
}
</script>

<template>
	<div />
</template>

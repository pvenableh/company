<script setup lang="ts">
// Teams is a slide-over panel in the apps layout. This route exists only
// to preserve inbound links (Spotlight, footer, in-app NuxtLinks, the
// legacy /organization/teams URL). It redirects into the apps layout
// with the `teams` slide-over already pushed onto the stack.
definePageMeta({
	middleware: 'auth',
});

const target = { path: '/apps/organization', query: { floor: 'settings', slide: 'teams:_' } } as const;

if (import.meta.server) {
	await navigateTo(target, { redirectCode: 301 });
} else {
	await navigateTo(target, { replace: true });
}
</script>

<template>
	<div />
</template>

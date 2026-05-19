<script setup lang="ts">
// Documents Library is a slide-over panel in the apps layout. This route
// exists only to preserve inbound links (AI library refs, marketing site
// CTAs, in-app NuxtLinks). It redirects into the apps layout with the
// `documents_library` slide-over already pushed onto the stack. The
// inbound `?tab=blocks|offerings` query becomes the slide-over's id
// segment so the deep link still lands on the right tab.
definePageMeta({
	middleware: 'auth',
});

useHead({ title: 'Documents Library | Earnest' });

const route = useRoute();
const tab = typeof route.query.tab === 'string' && (route.query.tab === 'offerings' || route.query.tab === 'blocks')
	? route.query.tab
	: 'blocks';

const target = {
	path: '/apps/organization',
	query: { floor: 'settings', slide: `documents_library:${tab}` },
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

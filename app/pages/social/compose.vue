<script setup lang="ts">
// Legacy /social/compose — body now lives in the slide-over panel at
// app/components/apps/panels/SocialComposePanel.vue (registered as
// `social-compose`). The page redirects into Studio with the slide-over
// pre-opened, carrying any prefill query params through to the panel
// (caption / account / cta_url / cta_label).
definePageMeta({
	middleware: ['auth'],
});

const route = useRoute();

const carriedQuery: Record<string, string> = {
	floor: 'studio',
	slide: 'social-compose:new',
};

for (const [key, value] of Object.entries(route.query)) {
	if (key === 'floor' || key === 'slide' || key === 'view') continue;
	if (typeof value === 'string') carriedQuery[key] = value;
}

await navigateTo(
	{ path: '/apps/marketing', query: carriedQuery },
	{ replace: true, redirectCode: 301 },
);
</script>

<template>
	<div />
</template>

<script setup lang="ts">
// The Documents Library surface lives as a slide-over panel on top of
// /apps/organization?floor=settings. This route is kept for bookmarks
// and legacy aliases (`/organization/document-blocks`,
// `/organization/service-templates`) — it redirects to the apps URL
// with the panel pre-opened.
//
// Tab query (`?tab=blocks` | `?tab=offerings`) is preserved as the
// panel's `id` slot (the slide-over stack uses the id segment to seed
// the body's initial tab).
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Documents Library | Earnest' });

const route = useRoute();
const router = useRouter();

onMounted(() => {
	const raw = route.query.tab;
	const tab = (typeof raw === 'string' && (raw === 'blocks' || raw === 'offerings')) ? raw : 'blocks';
	router.replace({
		path: '/apps/organization',
		query: { floor: 'settings', slide: `documents_library:${tab}` },
	});
});
</script>
<template>
	<div class="flex items-center justify-center py-16 t-text-muted text-sm">Redirecting to Documents Library…</div>
</template>

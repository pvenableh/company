<script setup lang="ts">
/**
 * Legacy contact-detail route. The canonical surface is now the apps-layout
 * Clients page with the Contact slide-over panel pushed onto the stack. We
 * forward straight there so direct links + CardDesk's "View" buttons land
 * in the new shell rather than the orphaned full-page view.
 */
definePageMeta({ middleware: ['auth'] });

const route = useRoute();
const contactId = String(route.params.id);

await navigateTo(
	{
		path: '/apps/clients',
		query: { view: 'contacts', slide: `contact:${contactId}` },
		replace: true,
	},
	{ replace: true },
);
</script>

<template>
	<div />
</template>

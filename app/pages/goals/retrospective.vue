<script setup lang="ts">
// /goals/retrospective now lives as the "Retrospective" view of the Goals hub
// inside the "Me" (Account) app. This route redirects there.
definePageMeta({ middleware: ['auth'] });
const route = useRoute();
await navigateTo({ path: '/account', query: { ...route.query, section: 'goals', view: 'retrospective' } });
</script>

<template>
	<div />
</template>

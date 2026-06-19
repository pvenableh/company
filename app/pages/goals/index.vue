<script setup lang="ts">
// /goals is now a thin redirect into the canonical Goals hub — a floor of the
// "Me" (Account) app. Deep-link query (scope / category / status / view) is
// preserved so existing shared links and RelatedGoalsCard "See all" links
// keep landing on the right filter. (Pattern mirrors /leads → People app.)
definePageMeta({ middleware: ['auth'] });
const route = useRoute();
await navigateTo({ path: '/account', query: { ...route.query, section: 'goals' } });
</script>

<template>
	<div />
</template>

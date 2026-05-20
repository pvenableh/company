<script setup lang="ts">
// Legacy /social/settings — body now lives at
// app/components/Social/SettingsSurface.vue and is rendered inside the
// Marketing app's Accounts floor (?floor=accounts&view=settings).
definePageMeta({
	middleware: ['auth'],
});

await navigateTo('/apps/marketing?floor=accounts&view=settings', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

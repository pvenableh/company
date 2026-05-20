<script setup lang="ts">
// Legacy /social/calendar — body now lives at
// app/components/Social/CalendarSurface.vue and is rendered inside the
// Marketing app's Studio floor (?floor=studio&view=calendar).
definePageMeta({
	middleware: ['auth'],
});

await navigateTo('/apps/marketing?floor=studio&view=calendar', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

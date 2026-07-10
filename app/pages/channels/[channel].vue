<script setup>
// Classic /channels/:channel is retired — redirect to the apps hub, preserving
// the channel (URL-encoded so names with special chars survive the path).
// See project_channels_apps_home.
definePageMeta({ middleware: ['auth'] });
const route = useRoute();
const target = route.params.channel
	? `/apps/channels/${encodeURIComponent(String(route.params.channel))}`
	: '/apps/channels';
await navigateTo(target, { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

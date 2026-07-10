<script setup>
// Classic /channels is retired — the comms hub lives at /apps/channels
// (project_channels_apps_home). This stub 301-funnels the old route + any
// lingering links/bookmarks to the new hub. Also removes the last classic
// layout:'default' channel page.
definePageMeta({ middleware: ['auth'] });
await navigateTo('/apps/channels', { replace: true, redirectCode: 301 });
</script>

<template>
	<div />
</template>

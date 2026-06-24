<script setup>
// The standalone meetings list is now nested into the Scheduler hub as a
// slide-out "History" panel (see app/components/Scheduler/HistoryPanel.vue).
// This route is kept as a redirect so existing links/bookmarks still resolve.
definePageMeta({
	middleware: ['auth'],
	redirect: '/scheduler?history=1',
});
</script>

<template>
	<div />
</template>

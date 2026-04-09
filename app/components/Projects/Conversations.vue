<template>
	<div class="w-full px-4 py-10 min-h-svh flex items-center justify-start flex-col">
		<div class="w-full">
			<h1 class="t-label border-b border-border">Conversations</h1>
			<SlackChannels :project="project" />
		</div>
	</div>
</template>
<script setup>
const props = defineProps({
	project: {
		type: Object,
		default: () => null,
	},
});
</script>

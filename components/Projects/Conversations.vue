<template>
	<div>
		<h1>Conversations</h1>
		<SlackChannels :project="project" />
	</div>
</template>
<script setup>
const props = defineProps({
	project: {
		type: String,
		default: null,
	},
});
</script>

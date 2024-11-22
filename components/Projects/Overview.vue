<template>
	<div>
		<h1>Overview</h1>
		<div class="grid grid-cols-3 gap-4">
			<h1>{{ project.title }}</h1>
		</div>
	</div>
</template>
<script setup>
defineProps({
	project: {
		type: Object,
		required: true,
	},
});
</script>

<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();

// const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

const project = await readItem('projects', params.id, {
	fields: ['*'],
});
</script>
<template>
	<div class="w-full flex flex-col md:flex-row items-start justify-start">
		{{ project }}
	</div>
</template>
<style></style>

<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();
// const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

const ticket = await readItem('tickets', params.id, {
	fields: ['*'],
});
</script>
<template>
	<div>{{ ticket }}</div>
</template>
<style></style>

<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();
// const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

const invoice = await readItem('invoices', params.id, {
	fields: ['*'],
});
</script>
<template>
	<div>{{ invoice }}</div>
</template>
<style></style>

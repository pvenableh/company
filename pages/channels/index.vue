<script setup>
const { readItems } = useDirectusItems();
const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

const channels = await readItems('channels', {
	fields: ['*'],
	filter: {
		status: {
			_in: ['published', 'draft'],
		},
	},
});
</script>
<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col relative px-4 pt-20">
		<h1>Channels</h1>
		<NuxtLink v-for="item in channels" :key="item.name" :to="'/channels/' + item.name" class="block my-6">
			{{ item.name }}
		</NuxtLink>
	</div>
</template>

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

const messages = await readItems('messages', {
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
		<h1 class="page__title">Channels</h1>
		<div class="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center z-10 page__inner">
			<div class="w-full flex flex-row flex-wrap items-center justify-center">
				<NuxtLink
					v-for="item in channels"
					:key="item.name"
					:to="'/channels/' + item.name"
					class="inline-block p-12 my-6 shadow-lg bg-gray-100 lowercase mx-3 mb-6"
				>
					#{{ item.name }}
				</NuxtLink>
			</div>
		</div>
	</div>
</template>

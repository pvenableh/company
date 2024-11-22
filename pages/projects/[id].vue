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
const items = [
	{
		slot: 'overview',
		label: 'Overview',
		icon: 'i-heroicons-information-circle',
	},
	{
		slot: 'tickets',
		label: 'Tickets',
		icon: 'i-heroicons-queue-list',
	},
	{
		slot: 'timeline',
		label: 'Timeline',
		icon: 'i-heroicons-eye-dropper',
	},
	{
		slot: 'documents',
		label: 'Documents',
		icon: 'i-heroicons-eye-dropper',
	},
];
</script>
<template>
	<UTabs
		:items="items"
		orientation="vertical"
		:ui="{
			wrapper: 'flex items-center gap-4 h-dvh ',
			list: {
				width: 'w-48 h-full flex items-center justify-center flex-col bg-gray-100 dark:bg-gray-800 text-left',
			},
		}"
	>
		<template #overview="{ item }">
			<ProjectsOverview :project="project" />
		</template>
		<template #tickets="{ item }">
			<TicketsBoard :projectId="project.id" />
		</template>
		<template #timeline="{ item }">
			<ProjectsTimeline :project="project" />
		</template>
		<template #documents="{ item }">
			<ProjectsDocuments :project="project" />
		</template>
	</UTabs>
</template>
<style></style>

<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();
// const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

const ticket = await readItem('tickets', params.id, {
	fields: [
		'id',
		'title',
		'description',
		'status',
		'priority',
		'date_created',
		'date_updated',
		'user_updated.first_name',
		'user_updated.last_name',
		'user_updated.id',
		'user_created.first_name',
		'user_created.last_name',
		'user_created.id',
		'due_date',
		'organization.id',
		'organization.name',
		'organization.logo',
		'project.id',
		'project.title',
		'project.url',
		'assigned_to.id',
		'assigned_to.directus_users_id.id',
		'assigned_to.directus_users_id.first_name',
		'assigned_to.directus_users_id.last_name',
		'assigned_to.directus_users_id.avatar',
		'assigned_to.directus_users_id.email',
		'comments',
		'tasks',
	],
});
const columns = [
	{ id: 'Pending', name: 'Pending', color: 'gray' },
	{ id: 'Scheduled', name: 'Scheduled', color: 'black' },
	{ id: 'In Progress', name: 'In Progress', color: 'blue' },
	{ id: 'Completed', name: 'Completed', color: 'green' },
];
</script>
<template>
	<div class="max-w-screen-xl mx-auto">
		<nuxt-link to="/tickets" class="uppercase text-[10px] text-gray-400">
			<UIcon name="i-heroicons-arrow-left" />
			Back to tickets
		</nuxt-link>
		<div class="w-full my-20">
			<TicketsDetails :element="ticket" :columns="columns" />
		</div>
	</div>
</template>
<style></style>

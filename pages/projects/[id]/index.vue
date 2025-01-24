<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();

const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

const project = await readItem('projects', params.id, {
	fields: [
		'id,status,service.name,service.color,title,description,contract_value,start_date,due_date,projected_date,completion_date,organization.id,organization.name,organization.logo,events.id,events.status,events.type,events.approval,events.priority,events.hours,events.title,events.description,events.date,events.link,events.prototype_link,events.amount,events.payment_amount,events.file,assigned_to.directus_users_id.id,assigned_to.directus_users_id.first_name,assigned_to.directus_users_id.last_name,assigned_to.directus_users_id.avatar,assigned_to.directus_users_id.email,assigned_to.directus_users_id.phone',
	],
});
const items = [
	{
		slot: 'overview',
		label: 'Overview',
		icon: 'i-heroicons-information-circle',
	},
	{
		slot: 'conversations',
		label: 'Conversations',
		icon: 'i-heroicons-chat-bubble-left-right',
	},
	{
		slot: 'tickets',
		label: 'Tickets',
		icon: 'i-heroicons-square-3-stack-3d',
	},
	// {
	// 	slot: 'timeline',
	// 	label: 'Timeline',
	// 	icon: 'i-heroicons-clock',
	// },
	{
		slot: 'documents',
		label: 'Documents',
		icon: 'i-heroicons-document-text',
	},
	{
		slot: 'billing',
		label: 'Billing',
		icon: 'i-heroicons-credit-card',
	},
];
</script>
<template>
	<div class="">
		<h1 class="page__title">Project</h1>
		<div class="max-w-screen-xl mx-auto">
			<nuxt-link to="/projects" class="uppercase text-[10px] text-gray-400 px-4 2xl:px-0">
				<UIcon name="i-heroicons-arrow-left" class="-mb-0.5" />
				Back to Projects
			</nuxt-link>
		</div>
		<div class="w-full my-4 px-4 2xl:px-0">
			<UTabs
				:items="items"
				:ui="{
					base: 'focus:outline-none',
					list: {
						background: 'bg-white dark:bg-gray-800',
						marker: {
							background: 'bg-gray-100 dark:bg-gray-900',
						},
						tab: {
							base: 'uppercase relative inline-flex items-center justify-center flex-shrink-0 w-full ui-focus-visible:outline-0 ui-focus-visible:ring-2 ui-focus-visible:ring-primary-500 dark:ui-focus-visible:ring-primary-400 ui-not-focus-visible:outline-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-75 transition-colors duration-200 ease-out',
							size: 'text-[8px] font-bold tracking-wider',
						},
					},
				}"
				class="mt-6"
			>
				<template #overview="{ item }">
					<ProjectsOverview :project="project" />
				</template>
				<template #conversations="{ item }">
					<ProjectsConversations :project="project" />
				</template>
				<template #tickets="{ item }">
					<TicketsBoard :projectId="project.id" />
				</template>
				<!-- <template #timeline="{ item }">
				<ProjectsTimeline :project="project" />
			</template> -->
				<template #documents="{ item }">
					<ProjectsDocuments :project="project" />
				</template>
				<template #billing="{ item }">
					<ProjectsBilling :project="project" />
				</template>
			</UTabs>
		</div>
	</div>
</template>
<style></style>

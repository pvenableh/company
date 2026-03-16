<script setup>
const { params } = useRoute();
const projectItems = useDirectusItems('projects');

const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

definePageMeta({
	middleware: ['auth'],
});

const project = await projectItems.get(params.id, {
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
	<div class="page__content">
		<div class="max-w-screen-xl mx-auto page_inner px-4 2xl:px-0">
			<div class="flex items-center gap-3 mb-4">
				<NuxtLink
					to="/projects"
					class="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				>
					<Icon name="lucide:arrow-left" class="w-5 h-5" />
				</NuxtLink>
				<div>
					<h1 class="text-xl font-semibold text-foreground">{{ project?.title || 'Project' }}</h1>
					<p class="text-sm text-muted-foreground">{{ project?.organization?.name || 'Project Details' }}</p>
				</div>
			</div>
		</div>
		<div class="w-full my-4 px-4 2xl:px-0">
			<UTabs
				:items="items"
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

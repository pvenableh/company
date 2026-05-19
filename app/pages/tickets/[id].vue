<script setup>
const { params } = useRoute();
const ticketItems = useDirectusItems('tickets');

definePageMeta({ layout: false, middleware: ['auth'] });
useHead({ title: 'Ticket Details | Earnest' });

// Apps-mode users get the apps shell so the detail page isn't orphaned.
// The board now opens a slide-over for quick look — this full page is the
// escape hatch (and what cold deep-links land on).
const { isAppsMode } = useAppsMode();
const layout = computed(() => (isAppsMode.value ? 'apps' : 'default'));

// Archive any unread notifications for this ticket as soon as the user
// lands here — click-through is implicit acknowledgement.
useMarkItemRead('tickets', () => params.id);

const ticket = await ticketItems.get(params.id, {
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
		'client.id',
		'client.name',
		'tasks',
		'team.*',
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
	<NuxtLayout :name="layout">
	<LayoutPageContainer>
		<NuxtLink
			to="/tickets"
			class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors mb-2"
		>
			<Icon name="lucide:chevron-left" class="w-3 h-3" />
			Tickets
		</NuxtLink>
		<div class="w-full my-4">
			<TicketsDetailsNew :element="ticket" :columns="columns" />
		</div>
	</LayoutPageContainer>
	</NuxtLayout>
</template>
<style></style>

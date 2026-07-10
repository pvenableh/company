<script setup>
const { params } = useRoute();
const ticketItems = useDirectusItems('tickets');

// Layout is chosen by the global `apps-layout.global.ts` middleware (apps shell
// vs classic sidebar). We no longer opt out with `layout: false` + our own
// <NuxtLayout>: that remounted the shell on every detail↔board navigation and
// blanked the board until refresh. Nuxt now owns the persistent layout.
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Ticket Details | Earnest' });

// Archive any unread notifications for this ticket as soon as the user
// lands here — click-through is implicit acknowledgement.
useMarkItemRead('tickets', () => params.id);

// Back target stays inside the apps shell — the board lives at
// /apps/work?floor=tickets.
const backTo = '/apps/work?floor=tickets';

const ticketFields = [
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
];

// Fetch via useAsyncData so a transient failure during client-side navigation
// (e.g. an in-flight token refresh) surfaces as a recoverable error state
// instead of rejecting setup() and blanking the whole app. One silent retry
// covers the auth-refresh race; a real failure renders the inline error.
const { data: ticket, error, refresh } = await useAsyncData(
	() => `ticket-${params.id}`,
	async () => {
		try {
			return await ticketItems.get(params.id, { fields: ticketFields });
		} catch (err) {
			// Retry once — covers the brief window where the session token is
			// being refreshed mid-navigation.
			return await ticketItems.get(params.id, { fields: ticketFields });
		}
	},
);
const columns = [
	{ id: 'Pending', name: 'Pending', color: 'gray' },
	{ id: 'Scheduled', name: 'Scheduled', color: 'black' },
	{ id: 'In Progress', name: 'In Progress', color: 'blue' },
	{ id: 'Completed', name: 'Completed', color: 'green' },
];
</script>
<template>
	<LayoutPageContainer>
		<NuxtLink
			:to="backTo"
			class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors mb-2"
		>
			<Icon name="lucide:chevron-left" class="w-3 h-3" />
			Tickets
		</NuxtLink>
		<div class="w-full my-4">
			<div
				v-if="error || !ticket"
				class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 py-16 text-center"
			>
				<Icon name="lucide:triangle-alert" class="w-6 h-6 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">Couldn't load this ticket.</p>
				<Button size="sm" variant="outline" @click="refresh">Retry</Button>
			</div>
			<TicketsDetailsNew v-else :element="ticket" :columns="columns" />
		</div>
	</LayoutPageContainer>
</template>
<style></style>

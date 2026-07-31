<!--
  TicketDetailPanel — slide-over host for a single ticket.

  The detail BODY is the shared `<AppsWorkTicketWorkspace>` (the same component
  the /tickets/[id] full page renders), run in `compact` mode so the panel and
  the page can't drift. This shell owns only the slide-over chrome: title,
  the "Open Ticket ↗" escape hatch to the full page, the create-mode composer,
  and fetching the ticket with the full field set the workspace's editable form
  needs.

  Cross-panel push (clicking the linked project/client/contact opens its panel
  on top) is handled inside the workspace's identity strip via `use-panel-stack`.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

// Create mode — host <TicketsCreate embedded>. `createContext` carries
// { projectId, organizationId }; on `ticketCreated` we notify surfaces + pop.
const isCreate = computed(() => props.mode === 'create');
const { createContext, emitCreated } = useCreatePanel<{ projectId?: string | null; organizationId?: string | null }, any>('ticket');
function onTicketCreated() {
	emitCreated(null);
}

const ticketItems = useDirectusItems('tickets');

const ticket = ref<any | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

// Full field set — matches the /tickets/[id] page so the shared TicketWorkspace
// (with its editable DetailsForm: assignees, team, created-by, etc.) has
// everything it needs. Entity/AI context is registered by the workspace itself.
const TICKET_FIELDS = [
	'id', 'title', 'description', 'status', 'priority',
	'csat_rating', 'csat_comment', 'csat_submitted_at',
	'date_created', 'date_updated', 'due_date',
	'user_updated.first_name', 'user_updated.last_name', 'user_updated.id',
	'user_created.first_name', 'user_created.last_name', 'user_created.id',
	'organization.id', 'organization.name', 'organization.logo',
	'project.id', 'project.title', 'project.url',
	'assigned_to.id',
	'assigned_to.directus_users_id.id',
	'assigned_to.directus_users_id.first_name',
	'assigned_to.directus_users_id.last_name',
	'assigned_to.directus_users_id.avatar',
	'assigned_to.directus_users_id.email',
	'client.id', 'client.name', 'tasks', 'team.*',
];

async function load(id: string) {
	if (!id || isCreate.value) return;
	loading.value = true;
	error.value = null;
	try {
		ticket.value = await ticketItems.get(id, { fields: TICKET_FIELDS });
	} catch (err: any) {
		error.value = err?.message || 'Failed to load ticket';
	} finally {
		loading.value = false;
	}
}

watch(() => props.id, load, { immediate: true });

// Keep the shell title in sync when the workspace autosaves an edit (e.g. the
// title changes) — the workspace self-manages its own copy, this just refreshes
// what the shell header shows.
function onWorkspaceUpdated(updated: any) {
	if (updated) ticket.value = updated;
}
</script>

<template>
	<AppSlideOverShell
		:title="isCreate ? 'New Ticket' : (ticket?.title || 'Ticket')"
		:subtitle="isCreate ? null : ticket?.organization?.name"
		@close="emit('close')"
	>
		<TicketsCreate
			v-if="isCreate"
			embedded
			:columns="TICKET_BOARD_COLUMNS"
			:default-project="createContext?.projectId || null"
			:default-organization="createContext?.organizationId || undefined"
			@ticketCreated="onTicketCreated"
		/>

		<template v-if="!isCreate && ticket" #actions>
			<NuxtLink
				:to="`/tickets/${ticket.id}`"
				class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
				:title="`Open full page for ${ticket.title || 'ticket'}`"
			>
				<Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
				Open Ticket
			</NuxtLink>
		</template>

		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
			<p class="text-xs text-muted-foreground">Loading ticket…</p>
		</div>

		<div v-else-if="error" class="text-sm text-destructive py-10 text-center">
			{{ error }}
		</div>

		<!-- Shared detail surface — same component the full page uses, in compact
		     (single-column, no duplicate title hero) mode. Delete pops the panel. -->
		<AppsWorkTicketWorkspace
			v-else-if="ticket"
			:element="ticket"
			compact
			@updated="onWorkspaceUpdated"
			@deleted="emit('close')"
		/>

		<div v-else-if="!isCreate" class="text-sm text-muted-foreground py-10 text-center">
			Could not load ticket.
		</div>
	</AppSlideOverShell>
</template>

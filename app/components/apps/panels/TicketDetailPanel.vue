<!--
  TicketDetailPanel — slide-over body for a single ticket.

  Full-detail surface for board card clicks: status pills, who's assigned,
  due date, description, the ticket's task checklist, comments thread, and
  chips for the linked project / client / team. The "Open Ticket ↗" action
  chip remains an escape hatch to the full /tickets/[id] page (activity log,
  delete, etc.), but day-to-day work happens here without leaving the board.

  Status changes use the same /api/items endpoint TicketsDetailsNew does,
  so realtime subscribers on the board pick it up.

  Cross-panel push: clicking the linked project/client/contact opens its
  panel on top via `useAppSlideOverStack().push()`.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const ticketItems = useDirectusItems('tickets');
const toast = useToast();
const { awardEvent } = useArcadeAwards();
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

const ticket = ref<any | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const updatingStatus = ref(false);

const STATUS_OPTIONS = ['Pending', 'Scheduled', 'In Progress', 'Completed'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];

const TICKET_FIELDS = [
	'id', 'title', 'description', 'status', 'priority',
	'date_created', 'date_updated', 'due_date',
	'csat_rating', 'csat_comment', 'csat_submitted_at',
	'organization.id', 'organization.name',
	'project.id', 'project.title',
	'client.id', 'client.name',
	'team.id', 'team.name',
	'assigned_to.id',
	'assigned_to.directus_users_id.id',
	'assigned_to.directus_users_id.first_name',
	'assigned_to.directus_users_id.last_name',
	'assigned_to.directus_users_id.avatar',
];

async function load(id: string) {
	if (!id) return;
	loading.value = true;
	error.value = null;
	try {
		ticket.value = await ticketItems.get(id, { fields: TICKET_FIELDS });
		// Register ticket context so Earnest is aware of what you're viewing in
		// the slide-over (the full page does this; the panel previously didn't).
		if (ticket.value) setEntity('ticket', String(ticket.value.id), ticket.value.title || 'Ticket');
	} catch (err: any) {
		error.value = err?.message || 'Failed to load ticket';
	} finally {
		loading.value = false;
	}
}

watch(() => props.id, load, { immediate: true });

const assignees = computed(() => {
	const list = ticket.value?.assigned_to;
	if (!Array.isArray(list)) return [];
	return list
		.map((row: any) => row?.directus_users_id)
		.filter((u: any) => u && u.id);
});

// CommentsSystem scopes @-mentions / visibility to the client — accept
// either an expanded object or a bare id.
const clientId = computed(() => {
	const c = ticket.value?.client;
	return typeof c === 'object' ? c?.id : c;
});

function fmtDate(d: string | null | undefined) {
	if (!d) return null;
	try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
	catch { return null; }
}

async function changeStatus(next: string) {
	if (!ticket.value?.id || updatingStatus.value || next === ticket.value.status) return;
	const prev = ticket.value.status;
	ticket.value = { ...ticket.value, status: next };
	updatingStatus.value = true;
	try {
		await ticketItems.update(ticket.value.id, { status: next });
		// Arcade reward — only when a ticket transitions into Completed.
		if (next === 'Completed' && prev !== 'Completed') {
			awardEvent('ticket_closed');
		}
	} catch (err: any) {
		ticket.value = { ...ticket.value, status: prev };
		toast.add({ title: 'Failed to update status', description: err?.message, color: 'red' });
	} finally {
		updatingStatus.value = false;
	}
}

// Inline quick-edits from the identity strip (due date). Optimistic, with
// rollback on failure — same pattern as changeStatus.
async function handleStripUpdate(fields: Record<string, any>) {
	if (!ticket.value?.id) return;
	const prev = { ...ticket.value };
	ticket.value = { ...ticket.value, ...fields };
	try {
		await ticketItems.update(ticket.value.id, fields);
	} catch (err: any) {
		ticket.value = prev;
		toast.add({ title: 'Failed to update ticket', description: err?.message, color: 'red' });
	}
}

// Drop the entity context when the slide-over closes — but only if it's
// still pointing at us (a panel pushed on top may have taken over).
onBeforeUnmount(() => {
	if (entityId.value === String(props.id)) resetEntityContext();
});
</script>

<template>
	<AppSlideOverShell
		:title="ticket?.title || 'Ticket'"
		:subtitle="ticket?.organization?.name"
		@close="emit('close')"
	>
		<template v-if="ticket" #actions>
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

		<div v-else-if="ticket" class="space-y-5">
			<!-- Shared identity strip — same component the full page uses, so the
			     two surfaces can't drift. Carries priority / linked project +
			     client + team / due date (inline-editable) / CSAT. Links open a
			     panel on top via the slide-over stack. -->
			<AppsWorkTicketIdentityStrip
				:ticket="ticket"
				use-panel-stack
				@update="handleStripUpdate"
			>
				<template v-if="ticket.csat_rating" #rating>
					<CsatBadge
						:rating="ticket.csat_rating"
						:comment="ticket.csat_comment"
						:submitted-at="ticket.csat_submitted_at"
					/>
				</template>
			</AppsWorkTicketIdentityStrip>

			<!-- Quick-change status -->
			<div class="flex items-center gap-1.5 flex-wrap">
				<button
					v-for="s in STATUS_OPTIONS"
					:key="s"
					type="button"
					:disabled="updatingStatus || s === ticket.status"
					class="text-[10px] uppercase tracking-wider px-2 h-6 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					:class="s === ticket.status
						? 'border-primary/40 bg-primary/10 text-primary font-semibold'
						: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground'"
					@click="changeStatus(s)"
				>
					{{ s }}
				</button>
			</div>

			<!-- Description -->
			<div v-if="ticket.description" class="pt-3 border-t border-border/30">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Description</p>
				<div class="text-sm whitespace-pre-wrap text-foreground/90" v-html="ticket.description" />
			</div>

			<!-- Tasks checklist — same component the full page uses; fetches
			     its own rows by ticket id, so no extra panel data needed. -->
			<div class="pt-3 border-t border-border/30">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
					<Icon name="lucide:check-circle" class="w-3 h-3" />
					Tasks
				</p>
				<TicketsTasks :ticket-id="ticket.id" />
			</div>

			<!-- Assignees — project/client/team links now live in the identity
			     strip above; this row keeps the who's-assigned detail. -->
			<div v-if="assignees.length" class="space-y-2 pt-3 border-t border-border/30">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned</p>
				<div class="flex flex-wrap gap-2">
					<span
						v-for="u in assignees"
						:key="u.id"
						class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-border text-muted-foreground"
					>
						<Icon name="lucide:user" class="w-3 h-3" />
						{{ [u.first_name, u.last_name].filter(Boolean).join(' ') || 'User' }}
					</span>
				</div>
			</div>

			<!-- Timestamps -->
			<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-3 border-t border-border/30">
				<div v-if="fmtDate(ticket.date_created)">
					<dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Created</dt>
					<dd>{{ fmtDate(ticket.date_created) }}</dd>
				</div>
				<div v-if="fmtDate(ticket.date_updated)">
					<dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Updated</dt>
					<dd>{{ fmtDate(ticket.date_updated) }}</dd>
				</div>
			</dl>

			<!-- Comments — same thread as the full page, scoped by ticket id. -->
			<div class="pt-4 border-t border-border/30">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
					<Icon name="lucide:message-square" class="w-3 h-3" />
					Comments
				</p>
				<CommentsSystem
					:item-id="ticket.id"
					collection="tickets"
					class="w-full"
					:client-id="clientId"
				/>
			</div>
		</div>

		<div v-else class="text-sm text-muted-foreground py-10 text-center">
			Could not load ticket.
		</div>
	</AppSlideOverShell>
</template>

<!--
  TicketDetailPanel — slide-over body for a single ticket.

  Quick-look surface for board card clicks: status pills, who's assigned,
  due date, description, and chips for the linked project / client /
  team. Editing the full ticket (tasks, activity, comments) stays at
  /tickets/[id] — the "Full Page ↗" action chip is the escape hatch.

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
const { push } = useAppSlideOverStack();
const { getStatusPillClass, getPriorityBadgeClass } = useStatusStyle();
const toast = useToast();

const ticket = ref<any | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const updatingStatus = ref(false);

const STATUS_OPTIONS = ['Pending', 'Scheduled', 'In Progress', 'Completed'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];

const TICKET_FIELDS = [
	'id', 'title', 'description', 'status', 'priority',
	'date_created', 'date_updated', 'due_date',
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
	} catch (err: any) {
		ticket.value = { ...ticket.value, status: prev };
		toast.add({ title: 'Failed to update status', description: err?.message, color: 'red' });
	} finally {
		updatingStatus.value = false;
	}
}
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
			<!-- Status + priority strip -->
			<div class="flex items-center gap-2 flex-wrap">
				<span
					class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
					:class="getStatusPillClass(ticket.status)"
				>
					<Icon v-if="updatingStatus" name="lucide:loader-2" class="w-3 h-3 animate-spin" />
					{{ ticket.status || 'No status' }}
				</span>
				<span
					v-if="ticket.priority"
					class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
					:class="getPriorityBadgeClass(ticket.priority)"
				>
					{{ ticket.priority }}
				</span>
				<span v-if="ticket.due_date" class="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground ml-1">
					<Icon name="lucide:calendar" class="w-3 h-3" />
					Due {{ fmtDate(ticket.due_date) }}
				</span>
			</div>

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

			<!-- Linkages -->
			<div
				v-if="assignees.length || ticket.project?.id || ticket.client?.id || ticket.team?.id"
				class="space-y-2 pt-3 border-t border-border/30"
			>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Linked</p>
				<div class="flex flex-wrap gap-2">
					<button
						v-if="ticket.project?.id"
						type="button"
						class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-border hover:bg-muted/60 transition-colors"
						@click="push('work-project', ticket.project.id)"
					>
						<Icon name="lucide:folder-kanban" class="w-3 h-3" />
						{{ ticket.project.title || 'Project' }}
					</button>
					<button
						v-if="ticket.client?.id"
						type="button"
						class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-border hover:bg-muted/60 transition-colors"
						@click="push('client', ticket.client.id)"
					>
						<Icon name="lucide:building-2" class="w-3 h-3" />
						{{ ticket.client.name || 'Client' }}
					</button>
					<span
						v-if="ticket.team?.id"
						class="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs border border-border text-muted-foreground"
					>
						<Icon name="lucide:users" class="w-3 h-3" />
						{{ ticket.team.name || 'Team' }}
					</span>
				</div>
				<div v-if="assignees.length" class="flex flex-wrap gap-2 pt-1">
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
		</div>

		<div v-else class="text-sm text-muted-foreground py-10 text-center">
			Could not load ticket.
		</div>
	</AppSlideOverShell>
</template>

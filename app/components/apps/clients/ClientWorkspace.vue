<!--
  ClientWorkspace — the shared inner body of the client surface. Mounted
  by BOTH `/apps/clients/[id].vue` (the full page) and
  `panels/ClientDetailPanel.vue` (the slide-over) so the two surfaces
  can't drift.

  Responsibilities:
    - Fetch the client + sibling collections (projects/invoices/channels/
      tickets/tasks) once.
    - Render the identity strip + tabs bar + active tab body.
    - Surface inline create affordances on each tab (+ New X, and
      + Attach Existing on Contacts) via existing FormModals — those use
      UModal which teleports to body, so they escape the slide-over's
      transformed container without breaking.

  What lives in the *parent* (page/panel), not here:
    - Outer chrome (AppHeader vs AppSlideOverShell)
    - Edit modal (page-only; panel has the "Open full page" CTA)
    - AI sidebar entity context (page-only)

  Counts:
    - Projects/invoices/messages/contacts: from the client deep relation
      + lazily-loaded sibling lists.
    - Tickets/tasks: lazy-loaded on tab activation, count is the loaded
      list length.
-->
<script setup lang="ts">
import type { Client } from '~~/shared/directus';
import { CONNECTION_ROLE_LABELS } from '~/composables/useContactConnections';
import type { ClientTabKey } from './ClientTabsBar.vue';
import VueDraggable from 'vuedraggable';

const props = defineProps<{
	clientId: string;
	/**
	 * Slim mode for the slide-over: skip the identity strip (the shell
	 * already shows the client name + close chrome). Page mode renders
	 * the full identity strip.
	 */
	compact?: boolean;
	/**
	 * Initial tab — page passes `?tab=` query, panel always defaults to
	 * activity. Two-way binding is not exposed because the panel doesn't
	 * own a URL it can write back to.
	 */
	initialTab?: ClientTabKey;
}>();

const emit = defineEmits<{
	(e: 'loaded', client: Client): void;
	(e: 'tab-change', tab: ClientTabKey): void;
}>();

const { getClient } = useClients();
const { getStatusBadgeClasses } = useStatusStyle();
const { push: pushPanel } = useAppSlideOverStack();

const projectItemsApi = useDirectusItems('projects');
const invoiceItemsApi = useDirectusItems('invoices');
const channelItemsApi = useDirectusItems('channels');
const ticketItemsApi = useDirectusItems('tickets');
const taskItemsApi = useDirectusItems('project_tasks');
const meetingItemsApi = useDirectusItems('video_meetings');

const client = ref<Client | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const relatedContacts = computed<any[]>(() => {
	const c = (client.value as any)?.contacts;
	return Array.isArray(c) ? c : [];
});
const directConnections = computed<any[]>(() => {
	const list = (client.value as any)?.partner_connections;
	return Array.isArray(list) ? list : [];
});

const relatedProjects = ref<any[]>([]);
const relatedInvoices = ref<any[]>([]);
const relatedChannels = ref<any[]>([]);
const relatedTickets = ref<any[]>([]);
const relatedTasks = ref<any[]>([]);
const relatedMeetings = ref<any[]>([]);
const ticketsLoading = ref(false);
const tasksLoading = ref(false);
const meetingsLoading = ref(false);

const ticketsView = useCookie<'board' | 'list'>('apps-client-tickets-view', { default: () => 'board' });
const tasksView = useCookie<'board' | 'list'>('apps-client-tasks-view', { default: () => 'board' });

const TICKET_STATUSES: Array<'Pending' | 'Scheduled' | 'In Progress' | 'Completed' | 'Archived'> = [
	'Pending', 'Scheduled', 'In Progress', 'Completed', 'Archived',
];
const TASK_STATUSES: Array<'new' | 'approved' | 'in_progress' | 'completed'> = [
	'new', 'approved', 'in_progress', 'completed',
];

const ticketsByStatus = computed(() => {
	const m: Record<string, any[]> = {};
	for (const s of TICKET_STATUSES) m[s] = [];
	for (const t of relatedTickets.value) {
		const k = (t.status as string) in m ? (t.status as string) : 'Pending';
		m[k].push(t);
	}
	return m;
});

const tasksByStatus = computed(() => {
	const m: Record<string, any[]> = {};
	for (const s of TASK_STATUSES) m[s] = [];
	for (const t of relatedTasks.value) {
		const k = (t.status as string) in m ? (t.status as string) : 'new';
		m[k].push(t);
	}
	return m;
});

function taskStatusLabel(s: string): string {
	return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const { inheritedContacts, inheritedConnections, load: loadInherited } = useClientInheritedContacts();

const activeTab = ref<ClientTabKey>(props.initialTab || 'activity');

watch(activeTab, (next) => {
	emit('tab-change', next);
	if (next === 'tickets' && !relatedTickets.value.length && !ticketsLoading.value) loadTickets();
	if (next === 'tasks' && !relatedTasks.value.length && !tasksLoading.value) loadTasks();
	if (next === 'meetings' && !relatedMeetings.value.length && !meetingsLoading.value) loadMeetings();
	if (next === 'content' && !relatedContent.value.length && !contentLoading.value) loadContent();
});

const relatedContent = ref<any[]>([]);
const contentLoading = ref(false);

async function loadContent() {
	contentLoading.value = true;
	try {
		const r = await $fetch<{ data: any[] }>('/api/social/posts', {
			query: { target_client: props.clientId, limit: 100 },
		});
		relatedContent.value = (r?.data ?? []).filter((p) => p.approval_state && p.approval_state !== 'draft');
	} catch {
		relatedContent.value = [];
	} finally {
		contentLoading.value = false;
	}
}

function contentStateTone(s: string | undefined): string {
	switch (s) {
		case 'approved':
		case 'published':
			return 'bg-success/12 text-success border-success/30';
		case 'in_review':
			return 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30';
		case 'requested_changes':
		case 'rejected':
			return 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30';
		default:
			return 'bg-muted/60 text-muted-foreground border-border';
	}
}

function contentStateLabel(s: string | undefined): string {
	switch (s) {
		case 'in_review': return 'In Review';
		case 'requested_changes': return 'Changes Requested';
		default: return (s || 'draft').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
	}
}

async function loadClient() {
	loading.value = true;
	error.value = null;
	try {
		const c = await getClient(props.clientId);
		client.value = c;
		if (c) emit('loaded', c);
		await loadRelated();
	} catch (e: any) {
		error.value = e?.message || 'Failed to load client';
	} finally {
		loading.value = false;
	}
}

async function loadTickets() {
	ticketsLoading.value = true;
	try {
		relatedTickets.value = await ticketItemsApi.list({
			filter: { client: { _eq: props.clientId } },
			fields: ['id', 'title', 'status', 'priority', 'due_date', 'date_created', 'project.id', 'project.title'],
			sort: ['-date_created'],
			limit: -1,
		}).catch(() => []) as any[];
	} finally {
		ticketsLoading.value = false;
	}
}

async function loadTasks() {
	tasksLoading.value = true;
	try {
		relatedTasks.value = await taskItemsApi.list({
			filter: { client_id: { _eq: props.clientId } },
			fields: ['id', 'title', 'status', 'priority', 'due_date', 'date_created', 'project_id.id', 'project_id.title'],
			sort: ['-date_created'],
			limit: -1,
		}).catch(() => []) as any[];
	} finally {
		tasksLoading.value = false;
	}
}

async function loadMeetings() {
	meetingsLoading.value = true;
	try {
		relatedMeetings.value = await meetingItemsApi.list({
			filter: { client: { _eq: props.clientId } },
			fields: [
				'id', 'title', 'status', 'scheduled_start', 'actual_start',
				'actual_duration_minutes', 'recording_url', 'transcript_text', 'summary_status',
				'host_user.id', 'host_user.first_name', 'host_user.last_name',
				'project.id', 'project.title',
			],
			sort: ['-scheduled_start'],
			limit: -1,
		}).catch(() => []) as any[];
	} finally {
		meetingsLoading.value = false;
	}
}

async function loadRelated() {
	const [projects, invoices, channels] = await Promise.all([
		projectItemsApi.list({
			filter: { client: { _eq: props.clientId } },
			fields: ['id', 'title', 'status', 'date_created'],
			sort: ['-date_created'],
			limit: -1,
		}).catch(() => []),
		invoiceItemsApi.list({
			filter: { client: { _eq: props.clientId } },
			fields: ['id', 'invoice_code', 'status', 'total_amount', 'invoice_date', 'due_date'],
			sort: ['-invoice_date'],
			limit: -1,
		}).catch(() => []),
		channelItemsApi.list({
			filter: { client: { _eq: props.clientId } },
			fields: [
				'id', 'name', 'date_created',
				'project.id', 'project.title',
				'ticket.id', 'ticket.title',
			],
			sort: ['name'],
			limit: -1,
		}).catch(() => []),
	]);
	relatedProjects.value = projects as any[];
	relatedInvoices.value = invoices as any[];
	relatedChannels.value = channels as any[];
	await loadInherited(props.clientId);
}

// Direct contacts on THIS client — draggable, persisted via `sort`.
// Falls back to first/last_name when sort is unset so empty-state ordering
// stays alphabetical.
const directContactsOrdered = ref<any[]>([]);

function reseedDirectContactsOrder() {
	const list = [...relatedContacts.value];
	list.sort((a, b) => {
		const sa = a?.sort, sb = b?.sort;
		if (sa != null && sb != null && sa !== sb) return sa - sb;
		if (sa != null && sb == null) return -1;
		if (sa == null && sb != null) return 1;
		const an = `${a?.first_name || ''} ${a?.last_name || ''}`.toLowerCase();
		const bn = `${b?.first_name || ''} ${b?.last_name || ''}`.toLowerCase();
		return an.localeCompare(bn);
	});
	directContactsOrdered.value = list;
}

watch(relatedContacts, reseedDirectContactsOrder, { immediate: true });

async function onContactDragEnd() {
	const updates: Array<{ id: string; sort: number }> = [];
	directContactsOrdered.value.forEach((c, idx) => {
		const next = (idx + 1) * 10;
		if (c?.sort !== next) {
			c.sort = next;
			if (c?.id) updates.push({ id: c.id, sort: next });
		}
	});
	if (!updates.length) return;
	try {
		await Promise.all(updates.map((u) => contactItemsApiTab.update(u.id, { sort: u.sort })));
	} catch (err) {
		console.error('[ClientWorkspace] persist contact order failed', err);
		// Reseed from server on failure so the UI doesn't show a phantom order.
		await loadClient();
	}
}

const contactItemsApiTab = useDirectusItems('contacts');

const totalContactCount = computed(() => relatedContacts.value.length + inheritedContacts.value.length);
const totalPartnerCount = computed(() => directConnections.value.length + inheritedConnections.value.length);

const tabCounts = computed(() => ({
	contacts: totalContactCount.value,
	projects: relatedProjects.value.length,
	tickets: relatedTickets.value.length,
	tasks: relatedTasks.value.length,
	meetings: relatedMeetings.value.length,
	content: relatedContent.value.length,
	invoices: relatedInvoices.value.length,
	partners: totalPartnerCount.value,
	messages: relatedChannels.value.length,
}));

function fmtCurrency(n: number | string | null | undefined): string {
	const num = Number(n);
	if (!Number.isFinite(num)) return '—';
	return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(d: string | null | undefined): string {
	if (!d) return '—';
	try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
}

// Cross-panel push for contact rows. Works on both surfaces: panel
// pushes a ContactPanel on top of itself; page pushes a ContactPanel
// over the page background.
const contactSlide = useAppSlideOver('contact');
function openContactSlideOver(contactId: string) {
	contactSlide.open(contactId);
}

// ── Activity feed ──────────────────────────────────────────────────────────
type ActivityFilter = 'all' | 'meetings' | 'money' | 'projects' | 'tickets';
interface ActivityRow {
	id: string;
	kind: string;
	ts: string;
	title: string;
	subtitle?: string | null;
	href?: string | null;
	icon: string;
}

const activityRows = ref<ActivityRow[]>([]);
const activityLoading = ref(false);
const activityNextOffset = ref<number | null>(0);
const activityFilter = ref<ActivityFilter>('all');
const activityFilterChips: Array<{ key: ActivityFilter; label: string }> = [
	{ key: 'all', label: 'All' },
	{ key: 'meetings', label: 'Meetings' },
	{ key: 'money', label: 'Money' },
	{ key: 'projects', label: 'Projects' },
	{ key: 'tickets', label: 'Tickets' },
];

async function fetchActivity(reset = false) {
	if (activityLoading.value) return;
	if (!reset && activityNextOffset.value === null) return;
	activityLoading.value = true;
	try {
		const offset = reset ? 0 : (activityNextOffset.value ?? 0);
		const res: any = await $fetch(`/api/apps/clients/${props.clientId}/activity`, {
			query: { offset, filter: activityFilter.value },
		});
		if (reset) activityRows.value = [];
		activityRows.value.push(...(res?.rows ?? []));
		activityNextOffset.value = res?.nextOffset ?? null;
	} catch (err) {
		console.error('[ClientWorkspace/activity] fetch failed', err);
	} finally {
		activityLoading.value = false;
	}
}

watch([activeTab, activityFilter], ([tab]) => {
	if (tab === 'activity') fetchActivity(true);
}, { immediate: true });

function activityWhen(iso: string): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const ms = Date.now() - d.getTime();
	const mins = Math.round(ms / 60000);
	if (mins < 60) return `${Math.max(1, mins)}m ago`;
	const hrs = Math.round(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.round(hrs / 24);
	if (days < 30) return `${days}d ago`;
	return d.toLocaleDateString();
}

// ── Inline create modals ───────────────────────────────────────────────────
// All of these are UModal-based and teleport to body, so they render
// outside the slide-over's transformed container without breaking.
const showCreateContactModal = ref(false);
const showAttachContactModal = ref(false);
const showCreateProjectModal = ref(false);
const showAttachProjectModal = ref(false);
const showCreateTicketModal = ref(false);
const showAttachTicketModal = ref(false);
const showAttachTaskModal = ref(false);
const showCreateInvoiceModal = ref(false);
const showAttachInvoiceModal = ref(false);
const showAttachChannelModal = ref(false);
const showCreateMeetingModal = ref(false);

// Quick task add: lightweight inline input instead of full FormModal
// (no FormModal exists for tasks, and a project-less task at client
// level is most easily expressed as a one-shot create).
const newTaskTitle = ref('');
const addingTask = ref(false);

async function quickAddTask() {
	const title = newTaskTitle.value.trim();
	if (!title || addingTask.value) return;
	addingTask.value = true;
	try {
		const created = await taskItemsApi.create({
			title,
			status: 'new',
			client_id: props.clientId,
		});
		if (created) relatedTasks.value = [created as any, ...relatedTasks.value];
		newTaskTitle.value = '';
	} catch (err) {
		console.error('[ClientWorkspace] task create failed', err);
	} finally {
		addingTask.value = false;
	}
}

function onContactAttached() {
	showAttachContactModal.value = false;
	loadClient();
}

function onContactCreated() {
	showCreateContactModal.value = false;
	loadClient();
}

function onProjectCreated() {
	showCreateProjectModal.value = false;
	loadRelated();
}

function onProjectAttached() {
	showAttachProjectModal.value = false;
	loadRelated();
}

function onTicketCreated() {
	showCreateTicketModal.value = false;
	loadTickets();
}

function onTicketAttached() {
	showAttachTicketModal.value = false;
	loadTickets();
}

function onTaskAttached() {
	showAttachTaskModal.value = false;
	loadTasks();
}

function onInvoiceCreated() {
	showCreateInvoiceModal.value = false;
	loadRelated();
}

function onInvoiceAttached() {
	showAttachInvoiceModal.value = false;
	loadRelated();
}

function onChannelAttached() {
	showAttachChannelModal.value = false;
	loadRelated();
}

function onMeetingCreated() {
	showCreateMeetingModal.value = false;
	loadMeetings();
}

async function changeTicketStatus(ticket: any, next: typeof TICKET_STATUSES[number]) {
	const prev = ticket.status;
	ticket.status = next;
	try { await ticketItemsApi.update(ticket.id, { status: next }); }
	catch { ticket.status = prev; }
}
async function changeTaskStatus(task: any, next: typeof TASK_STATUSES[number]) {
	const prev = task.status;
	task.status = next;
	try { await taskItemsApi.update(task.id, { status: next }); }
	catch { task.status = prev; }
}

defineExpose({
	client,
	loading,
	error,
	reload: loadClient,
	tabCounts,
	activeTab,
});

watch(() => props.clientId, () => {
	if (props.clientId) {
		loadClient();
	}
}, { immediate: true });
</script>

<template>
	<div class="client-workspace">
		<div v-if="loading && !client" class="flex flex-col items-center justify-center py-16 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-xs text-muted-foreground">Loading client…</p>
		</div>

		<div v-else-if="error && !client" class="flex flex-col items-center justify-center py-16 gap-3">
			<Icon name="lucide:alert-circle" class="w-8 h-8 text-destructive" />
			<p class="text-sm text-destructive">{{ error }}</p>
		</div>

		<template v-else-if="client">
			<AppsClientsClientIdentityStrip
				v-if="!compact"
				:client="client"
				size="sm"
				class="mb-5"
			>
				<template v-if="$slots.actions" #actions>
					<slot name="actions" />
				</template>
			</AppsClientsClientIdentityStrip>

			<AppsClientsClientTabsBar
				v-model="activeTab"
				:counts="tabCounts"
				class="mb-5"
			/>

			<div class="ios-card p-4 sm:p-6">
				<!-- Activity -->
				<div v-if="activeTab === 'activity'">
					<div class="flex items-center gap-1 rounded-full border border-border bg-card p-0.5 mb-4 w-fit">
						<button
							v-for="chip in activityFilterChips"
							:key="chip.key"
							type="button"
							class="inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-medium transition-colors"
							:class="activityFilter === chip.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'"
							@click="activityFilter = chip.key"
						>
							{{ chip.label }}
						</button>
					</div>

					<div v-if="activityLoading && !activityRows.length" class="text-sm text-muted-foreground text-center py-10">
						Loading activity…
					</div>
					<div v-else-if="!activityRows.length" class="text-sm text-muted-foreground text-center py-10">
						No activity for this filter yet.
					</div>
					<div v-else class="space-y-px">
						<component
							:is="row.href ? 'NuxtLink' : 'div'"
							v-for="row in activityRows"
							:key="row.id"
							:to="row.href || undefined"
							class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
						>
							<Icon :name="row.icon" class="w-4 h-4 text-muted-foreground shrink-0" />
							<div class="flex-1 min-w-0 flex items-center gap-2">
								<p class="text-sm font-medium truncate">{{ row.title }}</p>
								<span v-if="row.subtitle" class="text-[11px] text-muted-foreground truncate hidden sm:inline">
									· {{ row.subtitle }}
								</span>
							</div>
							<span class="text-[11px] text-muted-foreground shrink-0">{{ activityWhen(row.ts) }}</span>
							<Icon v-if="row.href" name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</component>
						<div v-if="activityNextOffset !== null" class="pt-3 text-center">
							<button
								type="button"
								:disabled="activityLoading"
								class="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60"
								@click="fetchActivity(false)"
							>
								<Icon v-if="activityLoading" name="lucide:loader-2" class="w-3 h-3 animate-spin" />
								Load more
							</button>
						</div>
					</div>
				</div>

				<!-- Contacts -->
				<div v-else-if="activeTab === 'contacts'">
					<div class="flex items-center justify-end gap-2 mb-3">
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
							@click="showAttachContactModal = true"
						>
							<Icon name="lucide:link" class="w-3 h-3" />
							Attach Existing
						</button>
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
							@click="showCreateContactModal = true"
						>
							<Icon name="lucide:plus" class="w-3 h-3" />
							New Contact
						</button>
					</div>

					<div v-if="!directContactsOrdered.length && !inheritedContacts.length" class="text-sm text-muted-foreground text-center py-10">
						No contacts linked to this client.
					</div>

					<!-- Direct contacts — draggable. Drag handle on the left;
					     rest of the row stays clickable for opening ContactPanel. -->
					<VueDraggable
						v-if="directContactsOrdered.length"
						v-model="directContactsOrdered"
						handle=".contact-row-drag-handle"
						item-key="id"
						class="space-y-px"
						ghost-class="contact-row__ghost"
						chosen-class="contact-row__chosen"
						drag-class="contact-row__drag"
						@end="onContactDragEnd"
					>
						<template #item="{ element: c }">
							<div
								class="flex items-stretch gap-1 h-12 hover:bg-muted/40 border-b border-border/30 transition-colors group"
							>
								<span
									class="contact-row-drag-handle flex items-center justify-center w-6 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
									title="Drag to reorder"
								>
									<Icon name="lucide:grip-vertical" class="w-3.5 h-3.5" />
								</span>
								<button
									type="button"
									class="flex flex-1 min-w-0 items-center gap-3 px-2 text-left"
									@click="openContactSlideOver(c.id)"
								>
									<span
										class="w-1.5 h-1.5 rounded-full shrink-0"
										:class="c.is_billing_contact ? 'bg-success' : 'bg-primary/60'"
									/>
									<div class="flex-1 min-w-0 flex items-center gap-2">
										<p class="text-sm font-medium truncate">{{ c.first_name }} {{ c.last_name }}</p>
										<span v-if="c.title" class="text-[11px] text-muted-foreground truncate hidden sm:inline">· {{ c.title }}</span>
									</div>
									<span v-if="c.email" class="hidden md:inline text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
										{{ c.email }}
									</span>
									<span v-if="c.is_billing_contact" class="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/15 text-success shrink-0">
										Billing
									</span>
									<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
								</button>
							</div>
						</template>
					</VueDraggable>

					<!-- Inherited contacts — view-only, can't reorder (they
					     belong to an ancestor client). Rendered below the
					     direct list with a subtle separator. -->
					<div v-if="inheritedContacts.length" class="space-y-px">
						<div
							v-if="directContactsOrdered.length"
							class="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 border-t border-border/30 mt-2"
						>
							Inherited
						</div>
						<button
							v-for="row in inheritedContacts"
							:key="`inherited-${row.contact.id}`"
							type="button"
							class="flex w-full items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group text-left"
							@click="openContactSlideOver(row.contact.id)"
						>
							<span
								class="w-1.5 h-1.5 rounded-full shrink-0"
								:class="row.contact.is_billing_contact ? 'bg-success' : 'bg-muted-foreground/40'"
							/>
							<div class="flex-1 min-w-0 flex items-center gap-2">
								<p class="text-sm font-medium truncate">{{ row.contact.first_name }} {{ row.contact.last_name }}</p>
								<span v-if="row.contact.title" class="text-[11px] text-muted-foreground truncate hidden sm:inline">· {{ row.contact.title }}</span>
							</div>
							<span v-if="row.contact.email" class="hidden md:inline text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
								{{ row.contact.email }}
							</span>
							<span v-if="row.contact.is_billing_contact" class="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/15 text-success shrink-0">
								Billing
							</span>
							<span class="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warning/15 text-warning shrink-0">
								<Icon name="lucide:corner-up-left" class="w-2.5 h-2.5" />
								via {{ row.inheritedFromName }}
							</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</button>
					</div>
				</div>

				<!-- Projects -->
				<div v-else-if="activeTab === 'projects'">
					<div class="flex items-center justify-end gap-2 mb-3">
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
							@click="showAttachProjectModal = true"
						>
							<Icon name="lucide:link" class="w-3 h-3" />
							Attach Existing
						</button>
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
							@click="showCreateProjectModal = true"
						>
							<Icon name="lucide:plus" class="w-3 h-3" />
							New Project
						</button>
					</div>
					<div v-if="!relatedProjects.length" class="text-sm text-muted-foreground text-center py-10">
						No projects linked to this client.
					</div>
					<div v-else class="space-y-px">
						<NuxtLink
							v-for="project in relatedProjects"
							:key="project.id"
							:to="`/projects/${project.id}`"
							class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
							:class="project.status === 'completed' || project.status === 'archived' ? 'opacity-60' : ''"
						>
							<span class="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
							<p class="flex-1 text-sm font-medium truncate">{{ project.title }}</p>
							<span
								v-if="project.status"
								class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
								:class="getStatusBadgeClasses(project.status)"
							>{{ project.status }}</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</NuxtLink>
					</div>
				</div>

				<!-- Tickets -->
				<div v-else-if="activeTab === 'tickets'">
					<div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
						<p class="text-xs text-muted-foreground">
							{{ ticketsView === 'board' ? 'Drag a ticket to update its status.' : 'All tickets opened for this client.' }}
						</p>
						<div class="flex items-center gap-2">
							<div class="inline-flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-full text-[12px] font-medium">
								<button
									type="button"
									class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
									:class="ticketsView === 'board' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
									@click="ticketsView = 'board'"
								>
									<Icon name="lucide:columns-3" class="w-3.5 h-3.5" />
									Board
								</button>
								<button
									type="button"
									class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
									:class="ticketsView === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
									@click="ticketsView = 'list'"
								>
									<Icon name="lucide:list" class="w-3.5 h-3.5" />
									List
								</button>
							</div>
							<button
								type="button"
								class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
								@click="showAttachTicketModal = true"
							>
								<Icon name="lucide:link" class="w-3 h-3" />
								Attach Existing
							</button>
							<button
								type="button"
								class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
								@click="showCreateTicketModal = true"
							>
								<Icon name="lucide:plus" class="w-3 h-3" />
								New Ticket
							</button>
						</div>
					</div>

					<div v-if="ticketsLoading && !relatedTickets.length" class="text-sm text-muted-foreground text-center py-10">
						Loading tickets…
					</div>
					<div v-else-if="!relatedTickets.length" class="text-sm text-muted-foreground text-center py-10">
						No tickets opened for this client yet.
					</div>

					<div v-else-if="ticketsView === 'board'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
						<div v-for="status in TICKET_STATUSES" :key="status" class="rounded-lg border border-border/40 bg-muted/20 overflow-hidden flex flex-col">
							<div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30 bg-background/50">
								<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ status }}</span>
								<span class="text-[10px] text-muted-foreground">{{ ticketsByStatus[status].length }}</span>
							</div>
							<div class="flex-1 p-2 space-y-2 min-h-[160px]">
								<NuxtLink
									v-for="t in ticketsByStatus[status]"
									:key="t.id"
									:to="`/tickets/${t.id}`"
									class="block rounded-lg border border-border/40 bg-card p-2.5 hover:bg-muted/40 transition-colors"
								>
									<p class="text-xs font-medium truncate">{{ t.title || 'Ticket' }}</p>
									<div class="flex items-center justify-between mt-1">
										<span v-if="t.priority" class="text-[10px] text-muted-foreground capitalize">{{ t.priority }}</span>
										<span v-if="t.due_date" class="text-[10px] text-muted-foreground">{{ fmtDate(t.due_date) }}</span>
									</div>
								</NuxtLink>
							</div>
						</div>
					</div>

					<div v-else class="space-y-px">
						<NuxtLink
							v-for="t in relatedTickets"
							:key="t.id"
							:to="`/tickets/${t.id}`"
							class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
						>
							<Icon name="lucide:ticket" class="w-4 h-4 text-muted-foreground shrink-0" />
							<p class="flex-1 text-sm font-medium truncate">{{ t.title || 'Ticket' }}</p>
							<span v-if="t.priority" class="hidden md:inline text-[10px] text-muted-foreground capitalize">{{ t.priority }}</span>
							<span
								v-if="t.status"
								class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
								:class="getStatusBadgeClasses(t.status)"
							>{{ t.status }}</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</NuxtLink>
					</div>
				</div>

				<!-- Tasks -->
				<div v-else-if="activeTab === 'tasks'">
					<div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
						<p class="text-xs text-muted-foreground">
							{{ tasksView === 'board' ? 'Drag a task to update its status.' : 'All tasks tied to this client.' }}
						</p>
						<div class="flex items-center gap-2">
							<div class="inline-flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-full text-[12px] font-medium">
								<button
									type="button"
									class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
									:class="tasksView === 'board' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
									@click="tasksView = 'board'"
								>
									<Icon name="lucide:columns-3" class="w-3.5 h-3.5" />
									Board
								</button>
								<button
									type="button"
									class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
									:class="tasksView === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
									@click="tasksView = 'list'"
								>
									<Icon name="lucide:list" class="w-3.5 h-3.5" />
									List
								</button>
							</div>
							<button
								type="button"
								class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
								@click="showAttachTaskModal = true"
							>
								<Icon name="lucide:link" class="w-3 h-3" />
								Attach Existing
							</button>
						</div>
					</div>

					<!-- Quick add -->
					<div class="flex gap-2 mb-4">
						<input
							v-model="newTaskTitle"
							type="text"
							placeholder="Add a task for this client…"
							class="flex-1 h-8 rounded-full border border-border bg-background px-3 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
							@keydown.enter="quickAddTask"
						/>
						<button
							type="button"
							class="h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
							:disabled="!newTaskTitle.trim() || addingTask"
							@click="quickAddTask"
						>
							<Icon v-if="addingTask" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
							<template v-else>Add</template>
						</button>
					</div>

					<div v-if="tasksLoading && !relatedTasks.length" class="text-sm text-muted-foreground text-center py-10">
						Loading tasks…
					</div>
					<div v-else-if="!relatedTasks.length" class="text-sm text-muted-foreground text-center py-10">
						No tasks tied to this client yet.
					</div>

					<div v-else-if="tasksView === 'board'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
						<div v-for="status in TASK_STATUSES" :key="status" class="rounded-lg border border-border/40 bg-muted/20 overflow-hidden flex flex-col">
							<div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30 bg-background/50">
								<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ taskStatusLabel(status) }}</span>
								<span class="text-[10px] text-muted-foreground">{{ tasksByStatus[status].length }}</span>
							</div>
							<div class="flex-1 p-2 space-y-2 min-h-[160px]">
								<NuxtLink
									v-for="t in tasksByStatus[status]"
									:key="t.id"
									:to="`/tasks?id=${t.id}`"
									class="block rounded-lg border border-border/40 bg-card p-2.5 hover:bg-muted/40 transition-colors"
								>
									<p class="text-xs font-medium truncate">{{ t.title || 'Task' }}</p>
									<div class="flex items-center justify-between mt-1">
										<span v-if="t.priority" class="text-[10px] text-muted-foreground capitalize">{{ t.priority }}</span>
										<span v-if="t.due_date" class="text-[10px] text-muted-foreground">{{ fmtDate(t.due_date) }}</span>
									</div>
								</NuxtLink>
							</div>
						</div>
					</div>

					<div v-else class="space-y-px">
						<NuxtLink
							v-for="t in relatedTasks"
							:key="t.id"
							:to="`/tasks?id=${t.id}`"
							class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
						>
							<Icon name="lucide:check-square" class="w-4 h-4 text-muted-foreground shrink-0" />
							<p class="flex-1 text-sm font-medium truncate">{{ t.title || 'Task' }}</p>
							<span v-if="t.priority" class="hidden md:inline text-[10px] text-muted-foreground capitalize">{{ t.priority }}</span>
							<span
								v-if="t.status"
								class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
								:class="getStatusBadgeClasses(t.status)"
							>{{ taskStatusLabel(t.status) }}</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</NuxtLink>
					</div>
				</div>

				<!-- Meetings — list of video meetings linked to this client.
				     New Meeting opens UnifiedEventModal with the client pinned
				     (clientId prop). The server route already accepts and
				     writes `video_meetings.client`. -->
				<div v-else-if="activeTab === 'meetings'">
					<div class="flex items-center justify-end mb-3">
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
							@click="showCreateMeetingModal = true"
						>
							<Icon name="lucide:plus" class="w-3 h-3" />
							New Meeting
						</button>
					</div>
					<div v-if="meetingsLoading && !relatedMeetings.length" class="text-sm text-muted-foreground text-center py-10">
						Loading meetings…
					</div>
					<div v-else-if="!relatedMeetings.length" class="text-sm text-muted-foreground text-center py-10">
						No meetings tied to this client yet.
					</div>
					<div v-else class="space-y-px">
						<NuxtLink
							v-for="m in relatedMeetings"
							:key="m.id"
							:to="`/meetings/${m.id}`"
							class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
						>
							<Icon name="lucide:video" class="w-4 h-4 text-muted-foreground shrink-0" />
							<div class="flex-1 min-w-0 flex items-center gap-2">
								<p class="text-sm font-medium truncate">{{ m.title || 'Untitled meeting' }}</p>
								<span v-if="m.project?.title" class="hidden md:inline text-[11px] text-muted-foreground truncate max-w-[160px]">
									· {{ m.project.title }}
								</span>
							</div>
							<span class="text-[11px] text-muted-foreground shrink-0">
								{{ m.actual_start || m.scheduled_start ? new Date(m.actual_start || m.scheduled_start).toLocaleDateString() : '—' }}
							</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</NuxtLink>
					</div>
				</div>

				<!-- Content -->
				<div v-else-if="activeTab === 'content'">
					<div class="flex items-center justify-end mb-3">
						<NuxtLink
							to="/apps/marketing?floor=studio"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
						>
							<Icon name="lucide:external-link" class="w-3 h-3" />
							Open in Studio
						</NuxtLink>
					</div>
					<div v-if="contentLoading && !relatedContent.length" class="text-sm text-muted-foreground text-center py-10">
						Loading content…
					</div>
					<div v-else-if="!relatedContent.length" class="text-sm text-muted-foreground text-center py-10">
						No content in review or approved for this client yet.
					</div>
					<div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<div
							v-for="post in relatedContent"
							:key="post.id"
							class="flex gap-3 p-3 border border-border rounded-lg hover:bg-muted/40 transition-colors"
						>
							<div class="w-16 h-16 rounded bg-muted/40 overflow-hidden shrink-0">
								<img
									v-if="post.design_image_url"
									:src="post.design_image_url"
									:alt="(post.caption || '').slice(0, 60)"
									class="w-full h-full object-cover"
									loading="lazy"
								/>
								<img
									v-else-if="post.media_urls?.[0]"
									:src="post.media_urls[0]"
									:alt="(post.caption || '').slice(0, 60)"
									class="w-full h-full object-cover"
									loading="lazy"
								/>
								<div v-else class="w-full h-full flex items-center justify-center">
									<Icon name="lucide:image" class="w-5 h-5 text-muted-foreground/40" />
								</div>
							</div>
							<div class="flex-1 min-w-0">
								<span
									class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border"
									:class="contentStateTone(post.approval_state)"
								>
									{{ contentStateLabel(post.approval_state) }}
								</span>
								<p class="text-xs text-foreground line-clamp-2 mt-1.5">
									{{ post.caption || 'Untitled draft' }}
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Invoices -->
				<div v-else-if="activeTab === 'invoices'">
					<div class="flex items-center justify-end gap-2 mb-3">
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
							@click="showAttachInvoiceModal = true"
						>
							<Icon name="lucide:link" class="w-3 h-3" />
							Attach Existing
						</button>
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
							@click="showCreateInvoiceModal = true"
						>
							<Icon name="lucide:plus" class="w-3 h-3" />
							New Invoice
						</button>
					</div>
					<div v-if="!relatedInvoices.length" class="text-sm text-muted-foreground text-center py-10">
						No invoices yet for this client.
					</div>
					<div v-else class="space-y-px">
						<NuxtLink
							v-for="inv in relatedInvoices"
							:key="inv.id"
							:to="`/invoices/${inv.id}`"
							class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
						>
							<span class="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
							<div class="flex-1 min-w-0 flex items-center gap-2">
								<p class="text-sm font-medium truncate font-mono">{{ inv.invoice_code || inv.id }}</p>
								<span class="text-[11px] text-muted-foreground hidden sm:inline">· {{ fmtDate(inv.invoice_date) }}</span>
							</div>
							<span class="text-xs font-medium shrink-0">{{ fmtCurrency(inv.total_amount) }}</span>
							<span
								v-if="inv.status"
								class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
								:class="getStatusBadgeClasses(inv.status)"
							>{{ inv.status }}</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</NuxtLink>
					</div>
				</div>

				<!-- Partners -->
				<div v-else-if="activeTab === 'partners'">
					<div v-if="!totalPartnerCount" class="text-sm text-muted-foreground text-center py-10">
						No partners or connectors linked to this client.
					</div>
					<div v-else class="space-y-px">
						<NuxtLink
							v-for="conn in directConnections"
							:key="`direct-${conn.id}`"
							:to="`/contacts/${conn.contact?.id || ''}`"
							class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
						>
							<span class="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
							<div class="flex-1 min-w-0 flex items-center gap-2">
								<p class="text-sm font-medium truncate">{{ conn.contact?.first_name }} {{ conn.contact?.last_name }}</p>
								<span class="text-[11px] text-muted-foreground truncate">
									· {{ CONNECTION_ROLE_LABELS[conn.role as keyof typeof CONNECTION_ROLE_LABELS] || conn.role }}
								</span>
							</div>
							<span
								v-if="conn.introduced_by"
								class="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
								:class="conn.introduced_by === 'partner' ? 'bg-violet-500/15 text-violet-500' : 'bg-info/15 text-info'"
							>
								{{ conn.introduced_by === 'partner' ? 'intro → us' : 'intro ← us' }}
							</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</NuxtLink>
						<NuxtLink
							v-for="({ connection: conn, inheritedFromName }) in inheritedConnections"
							:key="`inherited-${conn.id}`"
							:to="`/contacts/${conn.contact?.id || ''}`"
							class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group opacity-75"
						>
							<span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
							<div class="flex-1 min-w-0 flex items-center gap-2">
								<p class="text-sm font-medium truncate">{{ conn.contact?.first_name }} {{ conn.contact?.last_name }}</p>
								<span class="text-[11px] text-muted-foreground truncate">
									· {{ CONNECTION_ROLE_LABELS[conn.role as keyof typeof CONNECTION_ROLE_LABELS] || conn.role }}
								</span>
							</div>
							<span class="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warning/15 text-warning shrink-0">
								<Icon name="lucide:corner-up-left" class="w-2.5 h-2.5" />
								via {{ inheritedFromName }}
							</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</NuxtLink>
					</div>
				</div>

				<!-- Messages -->
				<div v-else-if="activeTab === 'messages'">
					<div class="flex items-center justify-end mb-3">
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
							@click="showAttachChannelModal = true"
						>
							<Icon name="lucide:link" class="w-3 h-3" />
							Attach Existing
						</button>
					</div>
					<div v-if="!relatedChannels.length" class="text-sm text-muted-foreground text-center py-10">
						No channels tagged to this client.
					</div>
					<div v-else class="space-y-px">
						<NuxtLink
							v-for="channel in relatedChannels"
							:key="channel.id"
							:to="`/channels/${channel.name}`"
							class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
						>
							<span class="text-muted-foreground/40 text-sm shrink-0">#</span>
							<p class="flex-1 text-sm font-medium truncate">{{ channel.name }}</p>
							<span
								v-if="channel.project?.title"
								class="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[160px]"
							>
								<Icon name="lucide:folder" class="w-3 h-3 shrink-0" />
								{{ channel.project.title }}
							</span>
							<span
								v-else-if="channel.ticket?.title"
								class="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[160px]"
							>
								<Icon name="lucide:ticket" class="w-3 h-3 shrink-0" />
								{{ channel.ticket.title }}
							</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</NuxtLink>
					</div>
				</div>
			</div>
		</template>

		<!-- Create / attach modals. UModal teleports to body so they
		     render outside the slide-over's transformed container. -->
		<ClientsAddExistingContactModal
			v-if="client"
			v-model="showAttachContactModal"
			:client-id="clientId"
			@attached="onContactAttached"
		/>
		<ContactsFormModal
			v-if="client"
			v-model="showCreateContactModal"
			:client-id="clientId"
			@created="onContactCreated"
		/>
		<ProjectsFormModal
			v-if="client"
			v-model="showCreateProjectModal"
			:defaults="{ client: clientId }"
			@created="onProjectCreated"
		/>
		<TicketsFormModal
			v-if="client"
			v-model="showCreateTicketModal"
			:client-id="clientId"
			@created="onTicketCreated"
		/>
		<InvoicesFormModal
			v-if="client"
			v-model="showCreateInvoiceModal"
			:defaults="{ client: clientId }"
			@created="onInvoiceCreated"
		/>

		<!-- Attach Existing modals — one per entity. All hit the same
		     generic component; each just describes its collection + how
		     to render rows + how to scope by org. -->
		<AppsClientsAttachExistingModal
			v-if="client"
			v-model="showAttachProjectModal"
			:client-id="clientId"
			collection="projects"
			entity-singular="Project"
			entity-plural="projects"
			fk-field="client"
			row-icon="lucide:folder-kanban"
			:fields="['id', 'title', 'status', 'date_created', 'client.id', 'client.name']"
			:get-label="(r) => r.title"
			:get-subtitle="(r) => r.status"
			:get-current-client-name="(r) => r.client && r.client.name"
			:get-search-haystack="(r) => `${r.title || ''} ${r.status || ''}`"
			@attached="onProjectAttached"
		/>
		<AppsClientsAttachExistingModal
			v-if="client"
			v-model="showAttachTicketModal"
			:client-id="clientId"
			collection="tickets"
			entity-singular="Ticket"
			entity-plural="tickets"
			fk-field="client"
			row-icon="lucide:ticket"
			:fields="['id', 'title', 'status', 'priority', 'due_date', 'client.id', 'client.name']"
			:get-label="(r) => r.title"
			:get-subtitle="(r) => [r.status, r.priority].filter(Boolean).join(' · ')"
			:get-current-client-name="(r) => r.client && r.client.name"
			:get-search-haystack="(r) => `${r.title || ''} ${r.status || ''}`"
			@attached="onTicketAttached"
		/>
		<AppsClientsAttachExistingModal
			v-if="client"
			v-model="showAttachTaskModal"
			:client-id="clientId"
			collection="project_tasks"
			entity-singular="Task"
			entity-plural="tasks"
			fk-field="client_id"
			row-icon="lucide:check-square"
			:fields="['id', 'title', 'status', 'priority', 'due_date', 'client_id.id', 'client_id.name']"
			:build-org-filter="(orgId) => ({ organization_id: { _eq: orgId } })"
			:get-label="(r) => r.title"
			:get-subtitle="(r) => [r.status, r.priority].filter(Boolean).join(' · ')"
			:get-current-client-name="(r) => r.client_id && r.client_id.name"
			:get-search-haystack="(r) => `${r.title || ''} ${r.status || ''}`"
			@attached="onTaskAttached"
		/>
		<AppsClientsAttachExistingModal
			v-if="client"
			v-model="showAttachInvoiceModal"
			:client-id="clientId"
			collection="invoices"
			entity-singular="Invoice"
			entity-plural="invoices"
			fk-field="client"
			row-icon="lucide:file-text"
			:fields="['id', 'invoice_code', 'status', 'total_amount', 'invoice_date', 'client.id', 'client.name']"
			:build-org-filter="(orgId) => ({ client: { organization: { _eq: orgId } } })"
			:get-label="(r) => r.invoice_code || `Invoice ${String(r.id).slice(0, 8)}`"
			:get-subtitle="(r) => [r.status, r.total_amount != null && fmtCurrency(r.total_amount)].filter(Boolean).join(' · ')"
			:get-current-client-name="(r) => r.client && r.client.name"
			:get-search-haystack="(r) => `${r.invoice_code || ''} ${r.status || ''}`"
			@attached="onInvoiceAttached"
		/>
		<AppsClientsAttachExistingModal
			v-if="client"
			v-model="showAttachChannelModal"
			:client-id="clientId"
			collection="channels"
			entity-singular="Channel"
			entity-plural="channels"
			fk-field="client"
			row-icon="lucide:message-square"
			:fields="['id', 'name', 'date_created', 'project.title', 'ticket.title', 'client.id', 'client.name']"
			:get-label="(r) => '#' + (r.name || '')"
			:get-subtitle="(r) => (r.project && r.project.title) || (r.ticket && r.ticket.title) || null"
			:get-current-client-name="(r) => r.client && r.client.name"
			:get-search-haystack="(r) => r.name || ''"
			@attached="onChannelAttached"
		/>

		<ClientOnly>
			<SchedulerUnifiedEventModal
				v-if="client"
				v-model="showCreateMeetingModal"
				:default-video="true"
				:client-id="clientId"
				:client-data="{ id: clientId, name: (client as any).name }"
				@created="onMeetingCreated"
				@saved="onMeetingCreated"
			/>
		</ClientOnly>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.client-workspace {
	display: flex;
	flex-direction: column;
}

.contact-row__ghost {
	@apply opacity-30;
}
.contact-row__chosen {
	@apply bg-muted/30;
}
.contact-row__drag {
	@apply shadow-lg;
}
</style>

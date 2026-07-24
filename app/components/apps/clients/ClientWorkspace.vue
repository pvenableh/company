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
import { notifyEntityChange } from '~/composables/useEntityStore';
import type { ClientTabKey } from './ClientTabsBar.vue';
import VueDraggable from 'vuedraggable';

// One inline Earnest opener — the docked panel surfaces the entity-scoped
// "things Earnest can do here" prompts (what the old Create menu offered).
const { openEarnestPanel } = useEarnestPanel();
// Boardroom — convene a focused meeting scoped to just this client (mirrors the
// project surface; the card's own Convene is hidden in favour of this one).
const { open: openBoardroom } = useBoardroom();
function conveneMeeting() {
	openBoardroom({
		mode: 'entity',
		entityType: 'clients',
		entityId: props.clientId,
		label: (client.value as any)?.name || 'this client',
	});
}

const props = defineProps<{
	clientId: string;
	/**
	 * Slim mode for the slide-over: the shell already shows the client name +
	 * close chrome, so the identity strip tightens to a slim rating row
	 * (the Earnest rating is a universal element shown on every surface).
	 * Page mode renders the full identity strip.
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
const { isOrgAdminOrAbove } = useOrgRole();
const { getStatusBadgeClasses } = useStatusStyle();
const { push: pushPanel } = useAppSlideOverStack();

const clientItemsApi = useDirectusItems('clients');
const projectItemsApi = useDirectusItems('projects');
const invoiceItemsApi = useDirectusItems('invoices');
const channelItemsApi = useDirectusItems('channels');
const ticketItemsApi = useDirectusItems('tickets');
const taskItemsApi = useDirectusItems('tasks');
const meetingItemsApi = useDirectusItems('video_meetings');
const projectsContactsApi = useDirectusItems('projects_contacts');
const toast = useToast();

const client = ref<Client | null>(null);

// ── Overview tab (inline-editable) ──────────────────────────────────────────
// The client's "who they are" fields, edited in place via <AppsInlineDetailsEditor>
// so a user can update them without leaving the slide-over. Website lives here
// (moved out of the identity strip).
const industryItemsApi = useDirectusItems('industries');
const industries = ref<Array<{ id: string; name: string }>>([]);
async function loadIndustries() {
	if (industries.value.length) return;
	try {
		industries.value = await industryItemsApi.list({ fields: ['id', 'name'], filter: { status: { _eq: 'published' } }, sort: ['name'], limit: -1 });
	} catch { industries.value = []; }
}

const overviewValues = computed<Record<string, any>>(() => {
	const c = client.value as any;
	if (!c) return {};
	return {
		website: c.website ?? '',
		industry: (typeof c.industry === 'object' ? c.industry?.id : c.industry) ?? '',
		location: c.location ?? '',
		brand_direction: c.brand_direction ?? '',
		goals: c.goals ?? '',
		target_audience: c.target_audience ?? '',
		notes: c.notes ?? '',
	};
});
const overviewFields = computed(() => [
	{ key: 'website', label: 'Website', type: 'url' as const, placeholder: 'https://' },
	{ key: 'industry', label: 'Industry', type: 'select' as const, placeholder: 'Select industry…', options: industries.value.map((i) => ({ value: i.id, label: i.name })) },
	{ key: 'location', label: 'Location', type: 'text' as const, placeholder: 'City, region, or Remote/Global' },
	{ key: 'brand_direction', label: 'Brand Direction', type: 'textarea' as const, placeholder: 'Positioning, voice, visual direction…', suggest: true },
	{ key: 'goals', label: 'Goals', type: 'textarea' as const, placeholder: 'Business goals and objectives…', suggest: true },
	{ key: 'target_audience', label: 'Target Audience', type: 'textarea' as const, placeholder: 'Who are we speaking to?', suggest: true },
	{ key: 'notes', label: 'Notes', type: 'richtext' as const, placeholder: 'Internal notes about this client…' },
]);
function onOverviewUpdated(patch: Record<string, any>) {
	if (client.value) Object.assign(client.value, patch);
}
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
const selectedChannelId = ref<string | null>(null);
const selectedChannel = computed(() => relatedChannels.value.find((c) => c.id === selectedChannelId.value) || null);
const relatedTickets = ref<any[]>([]);
const relatedTasks = ref<any[]>([]);
const relatedMeetings = ref<any[]>([]);
const projectsLoading = ref(false);
const invoicesLoading = ref(false);
const channelsLoading = ref(false);
const ticketsLoading = ref(false);
const tasksLoading = ref(false);
const meetingsLoading = ref(false);

// Counts-only on mount so the tab badges are accurate without paying for
// full row fetches the user may never look at. Each `loadX()` swaps the
// count for the real row list once its tab is activated.
const projectCount = ref(0);
const invoiceCount = ref(0);
const channelCount = ref(0);
const projectsLoaded = ref(false);
const invoicesLoaded = ref(false);
const channelsLoaded = ref(false);

// ── Money pipeline (value → paid → to-hunt) ─────────────────────────────────
// The client altitude of the same reporting the project surface shows. Unlike
// the project version it catches EVERY invoice on the client (many orgs bill at
// the client level, not per-project), so this is where the numbers actually
// populate. Contract value = sum of the client's non-archived projects.
interface HuntRow { id: string; code: string; who: string; outstanding: number; dueDate: string | null }
const clientContractValue = ref<number | null>(null);
const billedTotal = ref<number | null>(null);
const paidTotal = ref<number | null>(null);
const currentOutstanding = ref<number | null>(null);
const overdueTotal = ref<number | null>(null);
const huntRows = ref<HuntRow[]>([]);
// Dated payment ledger for this client → the period-scoped "Collected" card.
const clientPayments = ref<{ amount: number; date: string | null }[]>([]);
// Pursuit disclosure — lazy-mounts the merged timeline + proposal board.
const showPursuit = ref(false);

const ticketsView = useCookie<'board' | 'list'>('apps-client-tickets-view', { default: () => 'board' });
const tasksView = useCookie<'board' | 'list'>('apps-client-tasks-view', { default: () => 'board' });

// Documents tab — proposals + contracts scoped to this client. Counts
// pulled from the shared list components via `@count`.
const documentsProposalCount = ref(0);
const documentsContractCount = ref(0);
const documentsRefreshTick = ref(0); // bumped on new-create to refresh both lists

// ── Files & Docs (merged, read-only file roll-up) ───────────────────────────
// The client has no file store of its own; its "Files & Docs" tab aggregates
// the files of ALL its projects (via /api/clients/[id]/files) alongside the
// authored proposals/contracts. Files are read-only here — managed on their
// project. Classification mirrors the project surface (native file tags).
const config = useRuntimeConfig();
const clientFiles = ref<any[]>([]);
const clientFilesLoading = ref(false);
const clientFilesLoaded = ref(false);
type LibraryFilter = 'all' | 'contracts' | 'proposals' | 'documents' | 'assets';
const libraryFilter = ref<LibraryFilter>('all');
const libraryFolder = ref<string | null>(null);

async function loadClientFiles() {
	clientFilesLoading.value = true;
	try {
		clientFiles.value = (await $fetch(`/api/clients/${props.clientId}/files`).catch(() => [])) as any[];
		clientFilesLoaded.value = true;
	} finally {
		clientFilesLoading.value = false;
	}
}

function fileKind(row: any): 'contract' | 'proposal' | 'document' | 'asset' {
	const doc = row?.directus_files_id || {};
	const tags = (Array.isArray(doc.tags) ? doc.tags : []).map((t: any) => String(t).toLowerCase());
	if (tags.includes('contract')) return 'contract';
	if (tags.includes('proposal')) return 'proposal';
	if (tags.includes('asset')) return 'asset';
	if (tags.includes('document') || tags.includes('brief') || tags.includes('doc')) return 'document';
	if (String(doc.type || '').startsWith('image/')) return 'asset';
	return 'document';
}
const KIND_BADGE: Record<string, { label: string; class: string }> = {
	contract: { label: 'Contract', class: 'bg-primary/15 text-primary' },
	proposal: { label: 'Proposal', class: 'bg-info/15 text-info' },
	document: { label: 'Document', class: 'bg-muted/50 text-foreground/70' },
	asset:    { label: 'Asset', class: 'bg-success/15 text-success' },
};
const filteredLibraryFiles = computed(() => clientFiles.value.filter((row) => {
	if (libraryFolder.value && (row.directus_files_id?.folder?.id || null) !== libraryFolder.value) return false;
	if (libraryFilter.value === 'all') return true;
	const k = fileKind(row);
	if (libraryFilter.value === 'assets') return k === 'asset';
	if (libraryFilter.value === 'documents') return k === 'document';
	if (libraryFilter.value === 'contracts') return k === 'contract';
	if (libraryFilter.value === 'proposals') return k === 'proposal';
	return true;
}));
const libraryFolders = computed(() => {
	const map = new Map<string, string>();
	for (const row of clientFiles.value) {
		const fl = row.directus_files_id?.folder;
		if (fl?.id) map.set(fl.id, fl.name || 'Folder');
	}
	return [...map.entries()].map(([id, name]) => ({ id, name }));
});
const showContractsSection = computed(() => libraryFilter.value === 'all' || libraryFilter.value === 'contracts');
const showProposalsSection = computed(() => libraryFilter.value === 'all' || libraryFilter.value === 'proposals');
const libraryFilterChips: Array<{ key: LibraryFilter; label: string; icon: string }> = [
	{ key: 'all', label: 'All', icon: 'lucide:layers' },
	{ key: 'contracts', label: 'Contracts', icon: 'lucide:file-signature' },
	{ key: 'proposals', label: 'Proposals', icon: 'lucide:file-text' },
	{ key: 'documents', label: 'Documents', icon: 'lucide:file' },
	{ key: 'assets', label: 'Assets', icon: 'lucide:image' },
];
function openProjectPanel(id: string) {
	if (id) pushPanel('work-project', String(id));
}
function getFileIcon(type: string | null | undefined): string {
	if (!type) return 'lucide:file';
	if (type.startsWith('image/')) return 'lucide:image';
	if (type.includes('pdf')) return 'lucide:file-text';
	if (type.includes('spreadsheet') || type.includes('excel')) return 'lucide:table';
	if (type.includes('presentation') || type.includes('powerpoint')) return 'lucide:presentation';
	return 'lucide:file';
}
function formatFileSize(bytes: number | null | undefined): string {
	if (!bytes) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1048576).toFixed(1)} MB`;
}

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

// Skeleton sizing — match the row count to the badge so the tab body
// occupies its final height immediately and rows don't pop in. Capped
// so a 200-project client doesn't render a huge ghost list.
function skeletonRows(n: number, fallback = 4, max = 8): number[] {
	const k = Math.min(Math.max(n || fallback, 1), max);
	return Array.from({ length: k }, (_, i) => i);
}

const { inheritedContacts, inheritedConnections, load: loadInherited } = useClientInheritedContacts();

// Legacy `?tab=documents` deep-links fold into the merged Files & Docs surface.
function normalizeTab(t: ClientTabKey | undefined | null): ClientTabKey {
	if (t === 'documents' as any) return 'library';
	return (t || 'overview') as ClientTabKey;
}
const activeTab = ref<ClientTabKey>(normalizeTab(props.initialTab));

// Tab-activation loader. Shared by the active-tab watcher AND the
// hover-prefetch handler from <ClientTabsBar>, so a hover and a click
// converge on the same fetch (the `loading` flags prevent doubles, and
// the useDirectusItems request-dedup layer eliminates same-key races).
function loadForTab(tab: ClientTabKey) {
	switch (tab) {
		case 'overview': loadIndustries(); break;
		case 'projects': if (!projectsLoaded.value && !projectsLoading.value) loadProjects(); break;
		case 'invoices': if (!invoicesLoaded.value && !invoicesLoading.value) loadInvoices(); break;
		case 'messages': if (!channelsLoaded.value && !channelsLoading.value) loadChannels(); break;
		case 'tickets':  if (!relatedTickets.value.length && !ticketsLoading.value) loadTickets(); break;
		case 'tasks':    if (!relatedTasks.value.length && !tasksLoading.value) loadTasks(); break;
		case 'meetings': if (!relatedMeetings.value.length && !meetingsLoading.value) loadMeetings(); break;
		case 'content':  if (!relatedContent.value.length && !contentLoading.value) loadContent(); break;
		// Files & Docs — proposals/contracts self-load via the Money lists;
		// warm the aggregated file roll-up here.
		case 'library':  if (!clientFilesLoaded.value && !clientFilesLoading.value) loadClientFiles(); break;
	}
}

watch(activeTab, (next) => {
	emit('tab-change', next);
	loadForTab(next);
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

// Pin-to-top toggle — bumps the client to the front of the home widget + lists.
const { togglePin: togglePinClient } = usePinnable('clients');
async function onTogglePin() {
	if (client.value) await togglePinClient(client.value as any);
}

async function loadClient(force = false) {
	loading.value = true;
	error.value = null;
	try {
		// After a child mutation (e.g. attaching a contact) the embedded
		// `clients` record is still cached (30s TTL); mutating `contacts`
		// only invalidates the contacts cache. Force-bust so the reload
		// reflects the just-linked contact instead of the stale client.
		if (force) clientItemsApi.invalidateCache();
		// Reset the money pipeline so a client switch can't flash stale figures.
		billedTotal.value = null; paidTotal.value = null; clientContractValue.value = null;
		currentOutstanding.value = null; overdueTotal.value = null; huntRows.value = [];
		const c = await getClient(props.clientId);
		client.value = c;
		if (c) emit('loaded', c);
		loadBillingSummary();  // fire-and-forget; the Overview reveals it when ready
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
			filter: {
				_or: [
					{ client_id: { _eq: props.clientId } },
					{ project_id: { client: { _eq: props.clientId } } },
				],
			},
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
	// Counts on mount keep tab badges accurate without paying for full row
	// fetches the user may never look at. Each tab's real list is fetched
	// on activation (see watch(activeTab) above).
	const filter = { client: { _eq: props.clientId } };
	const [projects, invoices, channels] = await Promise.all([
		projectItemsApi.count(filter).catch(() => 0),
		invoiceItemsApi.count(filter).catch(() => 0),
		channelItemsApi.count(filter).catch(() => 0),
	]);
	projectCount.value = projects;
	invoiceCount.value = invoices;
	channelCount.value = channels;
	await loadInherited(props.clientId);
}

async function loadProjects() {
	projectsLoading.value = true;
	try {
		relatedProjects.value = await projectItemsApi.list({
			filter: { client: { _eq: props.clientId } },
			fields: ['id', 'title', 'status', 'date_created'],
			sort: ['-date_created'],
			limit: -1,
		}).catch(() => []) as any[];
		projectCount.value = relatedProjects.value.length;
		projectsLoaded.value = true;
	} finally {
		projectsLoading.value = false;
	}
}

async function loadInvoices() {
	invoicesLoading.value = true;
	try {
		relatedInvoices.value = await invoiceItemsApi.list({
			filter: { client: { _eq: props.clientId } },
			fields: ['id', 'invoice_code', 'status', 'total_amount', 'invoice_date', 'due_date'],
			sort: ['-invoice_date'],
			limit: -1,
		}).catch(() => []) as any[];
		invoiceCount.value = relatedInvoices.value.length;
		invoicesLoaded.value = true;
	} finally {
		invoicesLoading.value = false;
	}
}

// Client money pipeline — mirrors the project surface's loadBillingSummary but
// scoped to the client (all its invoices) with contract value summed from its
// non-archived projects. Paid is derived from summed payments (partials count
// correctly); livemode===false test rows excluded; per-invoice paid clamped so
// segments sum to invoiced. Independent of the projects/invoices tabs.
async function loadBillingSummary() {
	try {
		const paymentItemsApi = useDirectusItems('payments_received');
		const [invoices, projects, payments] = await Promise.all([
			invoiceItemsApi.list({
				fields: [
					'id', 'invoice_code', 'status', 'total_amount', 'due_date',
					'payments.amount', 'payments.status', 'payments.livemode',
				],
				filter: { client: { _eq: props.clientId } },
				limit: -1,
			}).catch(() => []) as Promise<any[]>,
			projectItemsApi.list({
				fields: ['contract_value', 'status'],
				filter: { client: { _eq: props.clientId }, status: { _neq: 'Archived' } },
				limit: -1,
			}).catch(() => []) as Promise<any[]>,
			// Dated ledger → the period-scoped "Collected" card. Scoped to this
			// client's invoices; test-mode rows excluded; refunds (negatives) net out.
			paymentItemsApi.list({
				fields: ['amount', 'date_received', 'date_created'],
				filter: {
					_and: [
						{ invoice_id: { client: { _eq: props.clientId } } },
						{ _or: [{ livemode: { _null: true } }, { livemode: { _eq: true } }] },
					],
				},
				limit: -1,
			}).catch(() => []) as Promise<any[]>,
		]);

		const today = new Date(); today.setHours(0, 0, 0, 0);
		let billed = 0, paid = 0, current = 0, overdue = 0;
		const hunt: HuntRow[] = [];

		for (const inv of invoices) {
			if (inv?.status === 'archived') continue;
			const total = Number(inv?.total_amount) || 0;
			billed += total;
			const invPaidRaw = (inv?.payments || []).reduce((s: number, p: any) => {
				if (p?.status !== 'paid' || p?.livemode === false) return s;
				return s + (Number(p?.amount) || 0);
			}, 0);
			const invPaid = Math.min(Math.max(invPaidRaw, 0), total);
			const invOut = total - invPaid;
			paid += invPaid;
			if (invOut <= 0.005) continue;

			const due = inv?.due_date ? new Date(inv.due_date) : null;
			if (due) due.setHours(0, 0, 0, 0);
			const isOverdue = !!due && due.getTime() < today.getTime();
			if (isOverdue) overdue += invOut; else current += invOut;
			hunt.push({
				id: String(inv.id),
				code: '',
				who: inv?.invoice_code || 'Invoice',
				outstanding: invOut,
				dueDate: inv?.due_date || null,
			});
		}

		clientContractValue.value = projects.reduce((s, p) => s + (Number(p?.contract_value) || 0), 0);
		billedTotal.value = billed;
		paidTotal.value = paid;
		currentOutstanding.value = current;
		overdueTotal.value = overdue;
		huntRows.value = hunt;
		clientPayments.value = (payments || []).map((p: any) => ({
			amount: Number(p?.amount) || 0,
			date: p?.date_received || p?.date_created || null,
		}));
	} catch {
		clientContractValue.value = null;
		billedTotal.value = 0; paidTotal.value = 0;
		currentOutstanding.value = 0; overdueTotal.value = 0;
		huntRows.value = [];
	}
}

// Hunt-list row → jump to the invoices tab (loads lazily via loadForTab).
function openInvoiceFromHunt(_id: string) {
	activeTab.value = 'invoices';
}

async function loadChannels() {
	channelsLoading.value = true;
	try {
		relatedChannels.value = await channelItemsApi.list({
			filter: { client: { _eq: props.clientId } },
			fields: [
				'id', 'name', 'date_created', 'organization',
				'project.id', 'project.title',
				'ticket.id', 'ticket.title',
			],
			sort: ['name'],
			limit: -1,
		}).catch(() => []) as any[];
		channelCount.value = relatedChannels.value.length;
		channelsLoaded.value = true;
		// Auto-select a channel so the thread shows inline without an extra click.
		if (!selectedChannelId.value && relatedChannels.value.length) {
			selectedChannelId.value = relatedChannels.value[0].id;
		}
	} finally {
		channelsLoading.value = false;
	}
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
	// Projects/invoices/messages: cached counts on mount; replaced by the
	// loaded row count once the tab is activated.
	projects: projectsLoaded.value ? relatedProjects.value.length : projectCount.value,
	library: clientFiles.value.length + documentsProposalCount.value + documentsContractCount.value,
	tickets: relatedTickets.value.length,
	tasks: relatedTasks.value.length,
	meetings: relatedMeetings.value.length,
	content: relatedContent.value.length,
	invoices: invoicesLoaded.value ? relatedInvoices.value.length : invoiceCount.value,
	partners: totalPartnerCount.value,
	messages: channelsLoaded.value ? relatedChannels.value.length : channelCount.value,
}));

// Overview "at a glance" — lead the client landing with health (rating +
// workload) instead of an empty edit form. projectCount/invoiceCount are
// primed on mount, so these read accurately on first paint.
const clientGlance = computed(() => ({
	metrics: [
		{ label: 'Projects', value: tabCounts.value.projects ?? 0 },
		{ label: 'Invoices', value: tabCounts.value.invoices ?? 0 },
	] as Array<{ label: string; value: string | number; tone?: 'default' | 'good' | 'warn' | 'danger' }>,
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

// ── Activity river ─────────────────────────────────────────────────────────
// Map ActivityRow → RiverItem. Hue per `kind` so money/projects/tickets/
// meetings each read as their own current. The temperature curve above the
// leaves exposes engagement rhythm — slow weeks visibly sag, active bursts
// arc up. Only renders on the 'all' filter (other filters narrow the picture
// and the river would feel artificially quiet).
function activityHue(kind: string): number {
	if (kind.startsWith('invoice')) return 150;       // money: teal-green
	if (kind.startsWith('ticket')) return 25;          // tickets: amber
	if (kind.startsWith('project')) return 210;        // projects: blue
	if (kind.startsWith('meeting')) return 270;        // meetings: violet
	if (kind.startsWith('task')) return 145;           // tasks: success green
	return 220;
}
function activitySat(kind: string): number {
	if (kind === 'invoice_paid' || kind === 'task_completed') return 70;
	if (kind === 'ticket_opened') return 78;
	return 60;
}
const activityRiverItems = computed(() => {
	return activityRows.value
		.filter((r) => !!r.ts)
		.map((r) => ({
			id: r.id,
			when: r.ts,
			label: r.title,
			sublabel: r.subtitle || undefined,
			hue: activityHue(r.kind),
			sat: activitySat(r.kind),
			icon: r.icon,
			_raw: r,
		}));
});
// Activity rows come back from the server with legacy hrefs (/tickets/:id,
// /projects/:id, …). Keep users inside the apps layout: route to the /apps
// page where one exists, otherwise open the matching slide-over.
function openActivityHref(href?: string | null) {
	if (!href) return;
	let m: RegExpMatchArray | null;
	if ((m = href.match(/^\/projects\/([^/?#]+)/))) return navigateTo(`/apps/work/projects/${m[1]}`);
	if ((m = href.match(/^\/tickets\/([^/?#]+)/))) return pushPanel('ticket', m[1]);
	if ((m = href.match(/^\/meetings\/([^/?#]+)/))) return pushPanel('work-meeting', m[1]);
	if ((m = href.match(/^\/invoices\/([^/?#]+)/))) return pushPanel('invoice', m[1]);
	if ((m = href.match(/^\/tasks\?id=([^&]+)/))) return pushPanel('task', decodeURIComponent(m[1]));
	if ((m = href.match(/^\/contacts\/([^/?#]+)/))) return openContactSlideOver(m[1]);
	return navigateTo(href);
}
function onActivityLeafSelect(item: { _raw: ActivityRow }) {
	openActivityHref(item._raw.href);
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
const showCreateProposalModal = ref(false);
const showCreateContractModal = ref(false);
const showAttachProposalModal = ref(false);
const showAttachContractModal = ref(false);

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
		const orgId = (client.value as any)?.organization;
		const created = await taskItemsApi.create({
			title,
			status: 'new',
			client_id: props.clientId,
			organization_id: orgId,
			category: 'quick',
			schedule: 'unscheduled',
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
	loadClient(true);
}

function onContactCreated() {
	showCreateContactModal.value = false;
	loadClient(true);
}

function onProjectCreated() {
	showCreateProjectModal.value = false;
	// Refresh the projects list if it's already loaded, otherwise just the
	// count for the badge.
	if (projectsLoaded.value) loadProjects();
	else projectItemsApi.count({ client: { _eq: props.clientId } }).then((n) => { projectCount.value = n; }).catch(() => {});
}

function onProjectAttached() {
	showAttachProjectModal.value = false;
	if (projectsLoaded.value) loadProjects();
	else projectItemsApi.count({ client: { _eq: props.clientId } }).then((n) => { projectCount.value = n; }).catch(() => {});
}

// Drag-magnet drop: a client-contact chip released onto a project row.
// Creates the projects_contacts junction row, surfaces toast on conflict
// (duplicate) vs error, and notifies sibling views via the entity bus.
async function onContactDroppedOnProject(projectId: string, payload: unknown) {
	const contact = payload as { id?: string; first_name?: string; last_name?: string } | null;
	if (!contact?.id || !projectId) return;
	const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Contact';
	try {
		// Check for an existing junction row first so the second drop
		// surfaces a friendly toast instead of a 400 from Directus.
		const existing = await projectsContactsApi.list({
			filter: { _and: [{ project: { _eq: projectId } }, { contact: { _eq: contact.id } }] },
			fields: ['id'],
			limit: 1,
		}).catch(() => []) as any[];
		if (existing.length) {
			toast.add({ title: `${name} is already attached`, color: 'amber' });
			return;
		}
		const created = await projectsContactsApi.create({
			project: projectId,
			contact: contact.id,
		});
		toast.add({ title: `Attached ${name}`, color: 'green' });
		const newId = (created as any)?.id ?? `${projectId}:${contact.id}`;
		notifyEntityChange('projects_contacts', { id: String(newId), op: 'create' });
	} catch (err: any) {
		console.error('[ClientWorkspace] drag-attach contact failed', err);
		toast.add({ title: `Couldn't attach ${name}`, description: err?.message, color: 'red' });
	}
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
	if (invoicesLoaded.value) loadInvoices();
	else invoiceItemsApi.count({ client: { _eq: props.clientId } }).then((n) => { invoiceCount.value = n; }).catch(() => {});
}

function onInvoiceAttached() {
	showAttachInvoiceModal.value = false;
	if (invoicesLoaded.value) loadInvoices();
	else invoiceItemsApi.count({ client: { _eq: props.clientId } }).then((n) => { invoiceCount.value = n; }).catch(() => {});
}

function onChannelAttached() {
	showAttachChannelModal.value = false;
	if (channelsLoaded.value) loadChannels();
	else channelItemsApi.count({ client: { _eq: props.clientId } }).then((n) => { channelCount.value = n; }).catch(() => {});
}

function onMeetingCreated() {
	showCreateMeetingModal.value = false;
	loadMeetings();
}

function onProposalCreated() {
	showCreateProposalModal.value = false;
	documentsRefreshTick.value++;
}

function onContractCreated() {
	showCreateContractModal.value = false;
	documentsRefreshTick.value++;
}
// Attaching an existing proposal/contract sets its `client` FK (handled by
// AppsClientsAttachExistingModal). Refresh the lists so it appears.
function onProposalAttached() {
	showAttachProposalModal.value = false;
	documentsRefreshTick.value++;
}
function onContractAttached() {
	showAttachContractModal.value = false;
	documentsRefreshTick.value++;
}

// Refs to refresh lists on inline create (the tick is consumed via watch
// inside MoneyProposalsList/MoneyContractsList — they re-fetch on scope
// changes, but inline creates don't change scope. Use exposed refresh.)
const documentsProposalsRef = ref<any>(null);
const documentsContractsRef = ref<any>(null);
watch(documentsRefreshTick, () => {
	documentsProposalsRef.value?.refresh?.();
	documentsContractsRef.value?.refresh?.();
});

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
			<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
			<p class="text-xs text-muted-foreground">Loading client…</p>
		</div>

		<div v-else-if="error && !client" class="flex flex-col items-center justify-center py-16 gap-3">
			<Icon name="lucide:alert-circle" class="w-8 h-8 text-destructive" />
			<p class="text-sm text-destructive">{{ error }}</p>
		</div>

		<template v-else-if="client">
			<AppsClientsClientIdentityStrip
				:client="client"
				:compact="compact"
				size="sm"
				class="mb-5"
			>
				<template #actions>
					<PinButton :pinned="(client as any)?.pinned" always @toggle="onTogglePin" />
					<button
						type="button"
						class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-foreground text-background text-xs font-medium ios-press shrink-0"
						title="Convene the Boardroom — Earnest gathers your board on this client"
						aria-label="Convene the Boardroom on this client"
						@click="conveneMeeting"
					>
						<DirectorChairIcon class="w-4 h-4 shrink-0" />
						<!-- Icon-only inside the narrow slide-over (compact); labelled on
						     the full page. Native title tooltip covers the icon-only case. -->
						<span v-if="!compact" class="hidden sm:inline">Convene</span>
					</button>
					<!-- Slide-over only: the full page already has an "Ask Earnest" in
					     its AppHeader. One opener per surface. Icon-only + tooltip so it
					     doesn't crowd the narrow panel header. -->
					<UiActionButton v-if="compact" icon="earnest" variant="primary" hide-label="always" title="Ask Earnest" @click="openEarnestPanel()">
						Ask Earnest
					</UiActionButton>
					<slot name="actions" />
				</template>
			</AppsClientsClientIdentityStrip>

			<AppsClientsClientTabsBar
				v-model="activeTab"
				:counts="tabCounts"
				class="mb-5"
				@prefetch="loadForTab"
			/>

			<div class="ios-card p-4 sm:p-6">
				<!-- Overview — inline-editable "who they are": website, industry,
				     location, brand direction, goals, target audience, notes.
				     Autosaves each field; no need to leave the slide-over. -->
				<div v-if="activeTab === 'overview'" class="space-y-6">
					<!-- Rating / Projects / Invoices stats intentionally omitted here —
					     the identity strip above already shows the rating breakdown
					     and the tab counts carry Projects/Invoices. -->

					<!-- Money: value → paid → to-hunt across ALL the client's invoices
					     (this is where the numbers populate — most orgs bill at the
					     client level). Shows once billing has loaded and there's either
					     a contract value or something invoiced. -->
					<template v-if="paidTotal != null && ((clientContractValue || 0) > 0 || (billedTotal || 0) > 0)">
						<!-- Collected · [period] — the flow figure the lifetime pipeline
						     can't answer ("how much has this client paid us YTD?"). -->
						<MoneyCollectedCard
							:payments="clientPayments"
							title="Collected from this client"
							class="mb-4"
						/>
						<!-- Two-up only when there's something to hunt AND room for it
						     (full page). Nothing to hunt → hide the Hunt card and let the
						     pipeline span full width. Narrow slide-over (compact) stacks. -->
						<div
							class="grid gap-4"
							:class="!compact && huntRows.length ? 'lg:grid-cols-2' : 'grid-cols-1'"
						>
							<MoneyPipeline
								:contract-value="clientContractValue"
								:paid="paidTotal || 0"
								:current-outstanding="currentOutstanding || 0"
								:overdue="overdueTotal || 0"
							/>
							<MoneyHuntList v-if="huntRows.length" :rows="huntRows" @open="openInvoiceFromHunt" />
						</div>
					</template>

					<!-- Pursuit money — what is still out there (proposals), beside the owed money. -->
					<AppsPursuitMoney :client-id="clientId" />

					<!-- Pursuit — the whole courtship (touchpoints + proposals merged)
					     and the client's proposal pipeline. Lazy-mounted disclosure so
					     it never fetches unless opened. -->
					<div class="rounded-2xl border border-border/50 bg-muted/10">
						<button
							type="button"
							class="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-foreground/80 hover:text-foreground"
							@click="showPursuit = !showPursuit"
						>
							<span class="inline-flex items-center gap-2">
								<Icon name="lucide:target" class="w-4 h-4 text-muted-foreground" />
								Pursuit history &amp; proposals
							</span>
							<Icon name="lucide:chevron-down" class="w-4 h-4 text-muted-foreground transition-transform" :class="{ 'rotate-180': showPursuit }" />
						</button>
						<div v-if="showPursuit" class="px-4 pb-4 pt-1 border-t border-border/40 space-y-6">
							<div>
								<h4 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Pursuit timeline</h4>
								<AppsPursuitTimeline :client-id="clientId" />
							</div>
							<div>
								<h4 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Proposal pipeline</h4>
								<MoneyProposalPipeline :client-id="clientId" />
							</div>
						</div>
					</div>

					<!-- Earnest, focused on THIS client: scoped prompts. The Convene
					     button is hidden here — the identity strip above owns it. -->
					<AppsEntityEarnestCard
						entity-type="client"
						:entity-id="String(client.id)"
						:label="client.name || 'this client'"
						hide-convene
					/>
					<!-- Live pulse: timeline of the client's work (projects/tickets/
					     tasks) alongside the touchpoints log — mirrors the project
					     overview's two-column pulse. Stacks in the narrow slide-over. -->
					<div class="grid gap-6" :class="compact ? 'grid-cols-1' : 'lg:grid-cols-2'">
						<div class="min-w-0 max-h-[26rem] overflow-y-auto pr-1 -mr-1">
							<AppsClientsClientTimelineFeed :client-id="clientId" />
						</div>
						<div class="min-w-0">
							<div class="flex items-center gap-2 mb-4">
								<Icon name="lucide:radio" class="w-5 h-5 text-primary" />
								<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Touchpoints</h3>
							</div>
							<AppsTouchpoints
								:client-id="clientId"
								:organization-id="(client as any)?.organization || null"
							/>
						</div>
					</div>

					<!-- Client details — inline editor, demoted to a disclosure (mirrors
					     the project overview) so the landing leads with work, not a form.
					     The full edit form is one tap away here, and the header "Edit"
					     button still opens the modal. -->
					<details class="group rounded-2xl border border-border/50 bg-muted/10">
						<summary class="flex items-center justify-between gap-2 cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground/80 hover:text-foreground">
							<span class="inline-flex items-center gap-2">
								<Icon name="lucide:sliders-horizontal" class="w-4 h-4 text-muted-foreground" />
								Client details
							</span>
							<Icon name="lucide:chevron-down" class="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
						</summary>
						<div class="px-4 pb-4 pt-1 border-t border-border/40">
							<AppsInlineDetailsEditor
								collection="clients"
								:item-id="String(client.id)"
								:model-value="overviewValues"
								:fields="overviewFields"
								@updated="onOverviewUpdated"
							/>
						</div>
					</details>
				</div>

				<!-- Activity -->
				<div v-else-if="activeTab === 'activity'">
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
					<template v-else>
						<!-- Activity river — only on 'all' filter. Shows recent
						     rhythm at a glance; the list below stays for deep
						     scroll-back and load-more. -->
						<div v-if="activityFilter === 'all'" class="mb-4">
							<div class="flex items-center justify-between mb-3">
								<h4 class="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
									Activity river
								</h4>
								<div class="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground">
									<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(150 70% 50%)" />money</span>
									<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(210 60% 55%)" />projects</span>
									<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(270 60% 60%)" />meetings</span>
									<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" style="background: hsl(25 78% 55%)" />tickets</span>
								</div>
							</div>
							<RiverChart
								:items="activityRiverItems"
								:days-back="14"
								:days-forward="2"
								:hour-height="14"
								:hide-hours="true"
								:accent-hue="210"
								empty-title="Quiet stretch."
								empty-subtitle="Nothing in the last two weeks."
								@select="onActivityLeafSelect"
							/>
						</div>
						<div class="space-y-px">
						<component
							:is="row.href ? 'button' : 'div'"
							v-for="row in activityRows"
							:key="row.id"
							:type="row.href ? 'button' : undefined"
							class="w-full text-left flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
							@click="row.href && openActivityHref(row.href)"
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
					</template>
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

					<!-- Drag-to-attach rail — drag a contact chip onto any
					     project row to create a projects_contacts junction.
					     Uses the useDragMagnet primitive (P2.5 slice 2). -->
					<div
						v-if="directContactsOrdered.length && relatedProjects.length"
						class="contact-drag-rail mb-3"
					>
						<div class="flex items-center gap-2 mb-1.5 px-1">
							<Icon name="lucide:hand" class="w-3 h-3 text-muted-foreground/70" />
							<span class="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
								Drag onto a project to attach
							</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							<AppsAppMagnetDragChip
								v-for="c in directContactsOrdered"
								:key="c.id"
								type="contact"
								:payload="c"
							>
								<span class="contact-chip">
									<span class="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
									<span class="text-[11px] font-medium truncate max-w-[140px]">
										{{ c.first_name }} {{ c.last_name }}
									</span>
								</span>
							</AppsAppMagnetDragChip>
						</div>
					</div>
					<div v-if="projectsLoading && !relatedProjects.length" class="space-y-px" aria-busy="true" aria-label="Loading projects">
						<div
							v-for="i in skeletonRows(projectCount)"
							:key="`proj-skel-${i}`"
							class="flex items-center gap-3 h-12 px-3 border-b border-border/30 last:border-b-0"
						>
							<span class="w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
							<ESkeleton class="h-3.5 flex-1 max-w-[40%]" />
							<ESkeleton class="h-4 w-16 rounded-full" />
						</div>
					</div>
					<div v-else-if="!relatedProjects.length" class="text-sm text-muted-foreground text-center py-10">
						No projects linked to this client.
					</div>
					<div v-else class="space-y-px">
						<AppsAppMagnetDropZone
							v-for="project in relatedProjects"
							:key="project.id"
							accepts="contact"
							@drop="(p) => onContactDroppedOnProject(project.id, p)"
						>
							<NuxtLink
								:to="`/apps/work/projects/${project.id}`"
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
						</AppsAppMagnetDropZone>
					</div>
				</div>

				<!-- Documents (proposals + contracts) — two stacked sections.
				     Lists scope themselves to this client via the shared
				     MoneyProposalsList / MoneyContractsList components.
				     Empty state per section keeps both visible even with
				     zero rows so the create chips are always reachable. -->
				<div v-else-if="activeTab === 'library'" class="space-y-6">
					<!-- Files & Docs — the client's authored proposals/contracts +
					     a read-only roll-up of files from ALL its projects. Filter
					     chips switch the population; folder chips narrow the files.
					     Files are managed on their project (the ↳ chip opens it). -->
					<div class="flex flex-wrap items-center gap-1.5">
						<button
							v-for="chip in libraryFilterChips"
							:key="chip.key"
							type="button"
							class="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium border transition-colors"
							:class="libraryFilter === chip.key
								? 'bg-primary text-primary-foreground border-primary'
								: 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'"
							@click="libraryFilter = chip.key"
						>
							<Icon :name="chip.icon" class="w-3 h-3" />
							{{ chip.label }}
						</button>
					</div>

					<div v-if="libraryFolders.length" class="flex flex-wrap items-center gap-1.5">
						<span class="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5">Folder</span>
						<button
							type="button"
							class="inline-flex items-center h-6 px-2.5 rounded-full text-[10px] font-medium border transition-colors"
							:class="!libraryFolder ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:bg-muted/60'"
							@click="libraryFolder = null"
						>All</button>
						<button
							v-for="fl in libraryFolders"
							:key="fl.id"
							type="button"
							class="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[10px] font-medium border transition-colors"
							:class="libraryFolder === fl.id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:bg-muted/60'"
							@click="libraryFolder = fl.id"
						>
							<Icon name="lucide:folder" class="w-2.5 h-2.5" />
							{{ fl.name }}
						</button>
					</div>

					<section v-if="showProposalsSection">
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-2">
								<Icon name="lucide:file-text" class="w-4 h-4 text-muted-foreground" />
								<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Proposals
								</h4>
								<span class="text-[10px] text-muted-foreground/70">{{ documentsProposalCount }}</span>
							</div>
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
									@click="showAttachProposalModal = true"
								>
									<Icon name="lucide:link" class="w-3 h-3" />
									Attach Existing
								</button>
								<button
									type="button"
									class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
									@click="showCreateProposalModal = true"
								>
									<Icon name="lucide:plus" class="w-3 h-3" />
									New Proposal
								</button>
							</div>
						</div>
						<MoneyProposalsList
							ref="documentsProposalsRef"
							:client-id="clientId"
							@count="documentsProposalCount = $event"
						/>
					</section>

					<section v-if="showContractsSection">
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-2">
								<Icon name="lucide:file-signature" class="w-4 h-4 text-muted-foreground" />
								<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Contracts
								</h4>
								<span class="text-[10px] text-muted-foreground/70">{{ documentsContractCount }}</span>
							</div>
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
									@click="showAttachContractModal = true"
								>
									<Icon name="lucide:link" class="w-3 h-3" />
									Attach Existing
								</button>
								<button
									type="button"
									class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
									@click="showCreateContractModal = true"
								>
									<Icon name="lucide:plus" class="w-3 h-3" />
									New Contract
								</button>
							</div>
						</div>
						<MoneyContractsList
							ref="documentsContractsRef"
							:client-id="clientId"
							@count="documentsContractCount = $event"
						/>
					</section>

					<!-- Files — read-only roll-up from the client's projects. Each
					     row shows which project it lives on; open/download only. -->
					<section>
						<div class="flex items-center gap-2 mb-3">
							<Icon name="lucide:folder" class="w-4 h-4 text-muted-foreground" />
							<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Files</h4>
							<span class="text-[10px] text-muted-foreground/70">{{ filteredLibraryFiles.length }}</span>
							<span class="text-[10px] text-muted-foreground/50">· from projects</span>
						</div>
						<div v-if="clientFilesLoading && !clientFiles.length" class="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-busy="true" aria-label="Loading files">
							<div v-for="i in skeletonRows(clientFiles.length, 4, 6)" :key="`cf-skel-${i}`" class="ios-card p-3 flex items-center gap-3">
								<ESkeleton class="w-4 h-4 shrink-0" />
								<div class="flex-1 space-y-1.5">
									<ESkeleton class="h-3.5 w-3/4" />
									<ESkeleton class="h-2.5 w-20" />
								</div>
							</div>
						</div>
						<div v-else-if="!clientFiles.length" class="text-sm text-muted-foreground text-center py-10">
							No files across this client's projects yet.
						</div>
						<div v-else-if="!filteredLibraryFiles.length" class="text-sm text-muted-foreground text-center py-10">
							No files in this view.
						</div>
						<div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
							<div
								v-for="row in filteredLibraryFiles"
								:key="row.id"
								class="ios-card p-3 flex items-center gap-2.5 hover:bg-muted/30 transition-colors"
							>
								<Icon :name="getFileIcon(row.directus_files_id?.type)" class="w-4 h-4 text-muted-foreground flex-shrink-0" />
								<a
									:href="`${config.public.directusUrl}/assets/${row.directus_files_id?.id}`"
									target="_blank"
									rel="noopener"
									class="flex-1 min-w-0"
								>
									<p class="text-sm font-medium text-foreground truncate">{{ row.directus_files_id?.title || row.directus_files_id?.filename_download }}</p>
									<div class="flex items-center gap-2 mt-0.5 flex-wrap">
										<span class="text-[10px] text-muted-foreground">{{ formatFileSize(row.directus_files_id?.filesize) }}</span>
										<span v-if="row.directus_files_id?.uploaded_on" class="text-[10px] text-muted-foreground">{{ fmtDate(row.directus_files_id.uploaded_on) }}</span>
										<span v-if="row.directus_files_id?.folder?.name" class="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
											<Icon name="lucide:folder" class="w-2.5 h-2.5" />{{ row.directus_files_id.folder.name }}
										</span>
									</div>
								</a>
								<span
									v-if="KIND_BADGE[fileKind(row)]"
									class="shrink-0 inline-flex items-center px-1.5 h-5 rounded-full text-[9px] font-semibold uppercase tracking-wide"
									:class="KIND_BADGE[fileKind(row)].class"
								>{{ KIND_BADGE[fileKind(row)].label }}</span>
								<button
									v-if="row.projects_id?.id"
									type="button"
									class="shrink-0 inline-flex items-center gap-0.5 max-w-[9rem] h-5 px-1.5 rounded-full text-[10px] font-medium bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
									:title="`Open ${row.projects_id.title || 'project'}`"
									@click="openProjectPanel(row.projects_id.id)"
								>
									<Icon name="lucide:corner-down-right" class="w-2.5 h-2.5 shrink-0" />
									<span class="truncate">{{ row.projects_id.title || 'Project' }}</span>
								</button>
								<a
									:href="`${config.public.directusUrl}/assets/${row.directus_files_id?.id}`"
									target="_blank"
									rel="noopener"
									class="shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
									title="Download"
								>
									<Icon name="lucide:download" class="w-3.5 h-3.5" />
								</a>
							</div>
						</div>
					</section>
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
								<button type="button" @click="pushPanel('ticket', t.id)"
									v-for="t in ticketsByStatus[status]"
									:key="t.id"
									class="w-full text-left block rounded-lg border border-border/40 bg-card p-2.5 hover:bg-muted/40 transition-colors"
								>
									<p class="text-xs font-medium truncate">{{ t.title || 'Ticket' }}</p>
									<div class="flex items-center justify-between mt-1">
										<span v-if="t.priority" class="text-[10px] text-muted-foreground capitalize">{{ t.priority }}</span>
										<span v-if="t.due_date" class="text-[10px] text-muted-foreground">{{ fmtDate(t.due_date) }}</span>
									</div>
								</button>
							</div>
						</div>
					</div>

					<div v-else class="space-y-px">
						<button type="button" @click="pushPanel('ticket', t.id)"
							v-for="t in relatedTickets"
							:key="t.id"
							class="w-full text-left flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
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
						</button>
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
							class="flex-1 h-8 rounded-full glass-field px-3 text-xs placeholder:text-muted-foreground/60 focus:outline-none"
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
								<button type="button" @click="pushPanel('task', t.id)"
									v-for="t in tasksByStatus[status]"
									:key="t.id"
									class="w-full text-left block rounded-lg border border-border/40 bg-card p-2.5 hover:bg-muted/40 transition-colors"
								>
									<p class="text-xs font-medium truncate">{{ t.title || 'Task' }}</p>
									<div class="flex items-center justify-between mt-1">
										<span v-if="t.priority" class="text-[10px] text-muted-foreground capitalize">{{ t.priority }}</span>
										<span v-if="t.due_date" class="text-[10px] text-muted-foreground">{{ fmtDate(t.due_date) }}</span>
									</div>
								</button>
							</div>
						</div>
					</div>

					<div v-else class="space-y-px">
						<button type="button" @click="pushPanel('task', t.id)"
							v-for="t in relatedTasks"
							:key="t.id"
							class="w-full text-left flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
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
						</button>
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
						<button type="button" @click="pushPanel('work-meeting', m.id)"
							v-for="m in relatedMeetings"
							:key="m.id"
							class="w-full text-left flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
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
						</button>
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
					<div v-if="invoicesLoading && !relatedInvoices.length" class="space-y-px" aria-busy="true" aria-label="Loading invoices">
						<div
							v-for="i in skeletonRows(invoiceCount)"
							:key="`inv-skel-${i}`"
							class="flex items-center gap-3 h-12 px-3 border-b border-border/30 last:border-b-0"
						>
							<span class="w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
							<ESkeleton class="h-3.5 w-24" />
							<ESkeleton class="h-3.5 flex-1 max-w-[20%]" />
							<ESkeleton class="h-4 w-16" />
							<ESkeleton class="h-4 w-14 rounded-full" />
						</div>
					</div>
					<div v-else-if="!relatedInvoices.length" class="text-sm text-muted-foreground text-center py-10">
						No invoices yet for this client.
					</div>
					<div v-else class="space-y-px">
						<button type="button" @click="pushPanel('invoice', inv.id)"
							v-for="inv in relatedInvoices"
							:key="inv.id"
							class="w-full text-left flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
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
						</button>
					</div>
				</div>

				<!-- Partners -->
				<div v-else-if="activeTab === 'partners'">
					<div v-if="!totalPartnerCount" class="text-sm text-muted-foreground text-center py-10">
						No partners or connectors linked to this client.
					</div>
					<div v-else class="space-y-px">
						<button type="button" @click="openContactSlideOver(conn.contact?.id || '')"
							v-for="conn in directConnections"
							:key="`direct-${conn.id}`"
							class="w-full text-left flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
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
						</button>
						<button type="button" @click="openContactSlideOver(conn.contact?.id || '')"
							v-for="({ connection: conn, inheritedFromName }) in inheritedConnections"
							:key="`inherited-${conn.id}`"
							class="w-full text-left flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group opacity-75"
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
						</button>
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
					<div v-if="channelsLoading && !relatedChannels.length" class="space-y-px" aria-busy="true" aria-label="Loading channels">
						<div
							v-for="i in skeletonRows(channelCount)"
							:key="`ch-skel-${i}`"
							class="flex items-center gap-3 h-12 px-3 border-b border-border/30 last:border-b-0"
						>
							<span class="text-muted-foreground/40 text-sm shrink-0">#</span>
							<ESkeleton class="h-3.5 flex-1 max-w-[35%]" />
							<ESkeleton class="h-3.5 w-32 hidden md:block" />
						</div>
					</div>
					<div v-else-if="!relatedChannels.length" class="text-sm text-muted-foreground text-center py-10">
						No channels tagged to this client.
					</div>
					<div v-else class="space-y-3">
						<!-- Channel picker: switch threads without leaving the client. Only
						     shown when the client has more than one channel. -->
						<div v-if="relatedChannels.length > 1" class="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
							<button
								v-for="channel in relatedChannels"
								:key="channel.id"
								type="button"
								class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-medium border shrink-0 transition-colors"
								:class="channel.id === selectedChannelId
									? 'bg-primary/10 border-primary/40 text-foreground'
									: 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'"
								@click="selectedChannelId = channel.id"
							>
								<span class="text-muted-foreground/50">#</span>{{ channel.name }}
							</button>
						</div>

						<!-- Inline live thread for the selected channel. -->
						<div v-if="selectedChannel" class="rounded-2xl border border-border/50 bg-card/40 px-3 py-2">
							<div class="flex items-center justify-between mb-1.5 px-1">
								<div class="flex items-center gap-1.5 min-w-0">
									<span class="text-muted-foreground/40 text-sm shrink-0">#</span>
									<p class="text-sm font-semibold truncate">{{ selectedChannel.name }}</p>
									<span
										v-if="selectedChannel.project?.title"
										class="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[160px]"
									>
										<Icon name="lucide:folder" class="w-3 h-3 shrink-0" />
										{{ selectedChannel.project.title }}
									</span>
								</div>
								<NuxtLink
									:to="`/channels/${selectedChannel.name}`"
									class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground shrink-0 transition-colors"
								>
									Open full view
									<Icon name="lucide:external-link" class="w-3 h-3" />
								</NuxtLink>
							</div>
							<ChannelsChannelThread
								:key="selectedChannel.id"
								:channel-id="selectedChannel.id"
								:channel-name="selectedChannel.name"
								:organization-id="selectedChannel.organization || (client as any)?.organization || null"
								:can-moderate="isOrgAdminOrAbove"
							/>
						</div>
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
			collection="tasks"
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

		<!-- Attach existing proposal / contract — sets the doc's `client` FK
		     (proposals.client + contracts.client both exist). Surfaces unlinked
		     docs and those on another client. -->
		<AppsClientsAttachExistingModal
			v-if="client"
			v-model="showAttachProposalModal"
			:client-id="clientId"
			collection="proposals"
			entity-singular="Proposal"
			entity-plural="proposals"
			fk-field="client"
			row-icon="lucide:file-text"
			:fields="['id', 'title', 'proposal_status', 'total_value', 'date_created', 'client.id', 'client.name']"
			:get-label="(r) => r.title || 'Untitled proposal'"
			:get-subtitle="(r) => [r.proposal_status, r.total_value != null && ('$' + Number(r.total_value).toLocaleString())].filter(Boolean).join(' · ')"
			:get-current-client-name="(r) => r.client && r.client.name"
			:get-search-haystack="(r) => `${r.title || ''} ${r.proposal_status || ''}`"
			@attached="onProposalAttached"
		/>
		<AppsClientsAttachExistingModal
			v-if="client"
			v-model="showAttachContractModal"
			:client-id="clientId"
			collection="contracts"
			entity-singular="Contract"
			entity-plural="contracts"
			fk-field="client"
			row-icon="lucide:file-signature"
			:fields="['id', 'title', 'contract_status', 'total_value', 'date_created', 'client.id', 'client.name']"
			:get-label="(r) => r.title || 'Untitled contract'"
			:get-subtitle="(r) => [r.contract_status, r.total_value != null && ('$' + Number(r.total_value).toLocaleString())].filter(Boolean).join(' · ')"
			:get-current-client-name="(r) => r.client && r.client.name"
			:get-search-haystack="(r) => `${r.title || ''} ${r.contract_status || ''}`"
			@attached="onContractAttached"
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

		<!-- Documents create modals open unscoped (the forms pick lead/
		     contact, which imply the client via the unioned list filter). To
		     put a specific existing doc under this client, use "Attach Existing"
		     above — it sets the direct `client` FK (proposals.client +
		     contracts.client both exist now). -->
		<ProposalsFormModal
			v-if="client"
			v-model="showCreateProposalModal"
			@created="onProposalCreated"
		/>
		<ContractsFormModal
			v-if="client"
			v-model="showCreateContractModal"
			@created="onContractCreated"
		/>
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

/* Drag-to-attach contact rail (Projects tab) — chips that travel into
   project rows via useDragMagnet. The visible chip stays small + pill-
   shaped; the cloned ghost inherits this shape during flight. */
.contact-drag-rail {
	@apply rounded-lg border border-dashed border-border/60 bg-muted/20 p-2;
}
.contact-chip {
	@apply inline-flex items-center gap-1.5 rounded-full bg-background border border-border px-2 py-1;
}
</style>

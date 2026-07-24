<!--
  ProjectWorkspace — shared inner body of the project surface. Mounted by
  BOTH `/apps/work/projects/[id].vue` (the full page) and
  `panels/ProjectDetailPanel.vue` (the slide-over) so the two surfaces
  can't drift. Mirrors `ClientWorkspace`.

  Responsibilities:
    - Fetch the project + sibling collections (tasks/tickets/channels/
      meetings/invoices/files) once.
    - Render the identity strip + tabs bar + active tab body.
    - Surface inline create affordances on each tab via existing
      FormModals + a project-scoped AttachExistingModal. Modals teleport
      to body so they escape the slide-over's transformed container.

  What lives in the *parent* (page/panel), not here:
    - Outer chrome (AppHeader vs AppSlideOverShell)
    - Edit modal (page-only; panel has the "Open full page" CTA)
    - AI sidebar entity context (page-only)

  The Apps workspace is self-contained: the Files tab uploads directly
  (via /api/directus/files/upload) so Apps users never need the legacy
  /projects/[id] page. The legacy page stays for non-Apps users only; the
  two layouts are kept separate (no cross-layout "Full Editor" hop). The
  legacy page still owns the heavier Gantt / time-block editors.
-->
<script setup lang="ts">
import VueDraggable from 'vuedraggable';
import { toast } from 'vue-sonner';
import { Button } from '~/components/ui/button';
import type { ProjectTabKey } from './ProjectTabsBar.vue';

const props = defineProps<{
	projectId: string;
	/**
	 * Slim mode for the slide-over: skip the identity strip (the shell
	 * already shows the project title + close chrome). Page mode renders
	 * the full identity strip.
	 */
	compact?: boolean;
	/**
	 * Initial tab — page passes `?tab=` query, panel always defaults to
	 * activity.
	 */
	initialTab?: ProjectTabKey;
}>();

const emit = defineEmits<{
	(e: 'loaded', project: any): void;
	(e: 'tab-change', tab: ProjectTabKey): void;
}>();

// One inline Earnest opener — the docked panel surfaces the entity-scoped
// "things Earnest can do here" prompts (what the old Create menu offered).
const { openEarnestPanel } = useEarnestPanel();
// Director's Office — convene a focused meeting scoped to just this project.
const { open: openBoardroom } = useBoardroom();
function conveneMeeting() {
	openBoardroom({
		mode: 'entity',
		entityType: 'projects',
		entityId: props.projectId,
		label: (project.value as any)?.title || 'this project',
	});
}

const config = useRuntimeConfig();
const { selectedOrg } = useOrganization();
const { awardEvent } = useArcadeAwards();

const projectItemsApi = useDirectusItems('projects');
const taskItemsApi = useDirectusItems('tasks');
const ticketItemsApi = useDirectusItems('tickets');
const channelItemsApi = useDirectusItems('channels');
const meetingItemsApi = useDirectusItems('video_meetings');
const invoiceItemsApi = useDirectusItems('invoices');
const eventItemsApi = useDirectusItems('project_events');
const proposalItemsApi = useDirectusItems('proposals');
const contractItemsApi = useDirectusItems('contracts');
const projectsContactsApi = useDirectusItems('projects_contacts');
const contactItemsApi = useDirectusItems('contacts');

const project = ref<any | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// Legacy deep-links (?tab=files / ?tab=documents) now resolve to the merged
// Files & Docs surface so old bookmarks don't land on a blank tab.
function normalizeTab(t: ProjectTabKey | undefined | null): ProjectTabKey {
	if (t === 'files' as any || t === 'documents' as any) return 'library';
	return (t || 'overview') as ProjectTabKey;
}
const activeTab = ref<ProjectTabKey>(normalizeTab(props.initialTab));

// Overview "live pulse" sub-tabs. Timeline (events + tickets + tasks, in time
// order) leads as the default read; Activity (audit feed) is one tap away.
const overviewPulseTabs = [
	{ slot: 'timeline', label: 'Timeline', icon: 'i-heroicons-chart-bar' },
	{ slot: 'activity', label: 'Activity', icon: 'i-heroicons-clock' },
];

// ── Overview tab (inline-editable) ──────────────────────────────────────────
// Core project fields, editable in place via <AppsInlineDetailsEditor> so a
// user can update the project without leaving the slide-over.
const projectOverviewValues = computed<Record<string, any>>(() => {
	const p = project.value as any;
	if (!p) return {};
	return {
		title: p.title ?? '',
		description: p.description ?? '',
		status: p.status ?? '',
		start_date: p.start_date ? String(p.start_date).slice(0, 10) : '',
		due_date: p.due_date ? String(p.due_date).slice(0, 10) : '',
		contract_value: p.contract_value ?? '',
	};
});
const PROJECT_OVERVIEW_FIELDS = [
	{ key: 'title', label: 'Title', type: 'text' as const, placeholder: 'Project title' },
	{ key: 'description', label: 'Description', type: 'textarea' as const, placeholder: 'What is this project?', suggest: true },
	{ key: 'status', label: 'Status', type: 'select' as const, options: [
		{ value: 'Pending', label: 'Pending' },
		{ value: 'Scheduled', label: 'Scheduled' },
		{ value: 'In Progress', label: 'In Progress' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'Archived', label: 'Archived' },
	] },
	{ key: 'start_date', label: 'Start Date', type: 'date' as const },
	{ key: 'due_date', label: 'Due Date', type: 'date' as const },
	{ key: 'contract_value', label: 'Contract Value', type: 'number' as const, prefix: '$', placeholder: '0' },
];
const projectClientId = computed(() => {
	const c = (project.value as any)?.client;
	return c ? (typeof c === 'object' ? c.id : c) : null;
});
function onProjectOverviewUpdated(patch: Record<string, any>) {
	if (project.value) Object.assign(project.value, patch);
	emit('loaded', project.value);
}

// Tab data — lazy-loaded on activation. The Tasks and Tickets boards
// fetch their own rows internally; we mirror their counts here just to
// keep the tab badges accurate. Activity uses the existing timeline
// component (no extra fetch here).
const taskCount = ref<number>(0);
const ticketCount = ref<number>(0);
const channels = ref<any[]>([]);
const channelsLoading = ref(false);
const meetings = ref<any[]>([]);
const meetingsLoading = ref(false);
const invoices = ref<any[]>([]);
const invoicesLoading = ref(false);
// Invoiced-to-date across this project's invoices. Fetched eagerly (one field)
// so the Overview can show "left to bill" against the contract value without
// opening the Invoices tab. null = not yet loaded.
const billedTotal = ref<number | null>(null);
const files = ref<any[]>([]);
const filesLoading = ref(false);

// Contacts tab — backed by the `projects_contacts` junction (created by
// scripts/setup-projects-contacts-junction.ts). Each row holds a sort key on
// the junction itself so the same contact can be pinned to multiple projects
// with different orderings.
const projectContactRows = ref<any[]>([]);  // raw junction rows w/ contact nested
const directProjectContactsOrdered = ref<any[]>([]); // project-ONLY extras (drag-reorder)
// The project's client roster (contacts where contact.client === project.client).
// Inherited onto the project by default — you manage these on the client.
const clientContacts = ref<any[]>([]);
const contactsLoading = ref(false);
const contactsLoaded = ref(false);
const projectContactCount = ref(0);

// Documents tab — proposals + contracts scoped to this project via the
// FK added by scripts/setup-doc-project-fk.ts. Counts come from the
// shared MoneyProposalsList / MoneyContractsList `@count` emits; until
// the migration runs (or any row is linked) both stay at 0.
const documentsProposalCount = ref(0);
const documentsContractCount = ref(0);
const documentsRefreshTick = ref(0);
const documentsProposalsRef = ref<any>(null);
const documentsContractsRef = ref<any>(null);
watch(documentsRefreshTick, () => {
	documentsProposalsRef.value?.refresh?.();
	documentsContractsRef.value?.refresh?.();
});

// ── Files & Docs (merged library surface) ───────────────────────────────────
// One tab unifies uploaded files with authored proposals/contracts. Files are
// classified by their native `tags` (see fileKind) so the same folder + tag
// system already in Directus drives the filter chips — no new schema.
const filesApi = useDirectusFiles();
const LIBRARY_TAGS = ['contract', 'proposal', 'document', 'asset', 'brief'];
type LibraryFilter = 'all' | 'contracts' | 'proposals' | 'documents' | 'assets';
const libraryFilter = ref<LibraryFilter>('all');
const libraryFolder = ref<string | null>(null);

// Classify a file row (junction → directus_files_id) into one bucket: an
// explicit known tag wins, else images are assets and everything else is a
// generic document.
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

const filteredLibraryFiles = computed(() => {
	return files.value.filter((row) => {
		if (libraryFolder.value && (row.directus_files_id?.folder?.id || null) !== libraryFolder.value) return false;
		if (libraryFilter.value === 'all') return true;
		const k = fileKind(row);
		if (libraryFilter.value === 'assets') return k === 'asset';
		if (libraryFilter.value === 'documents') return k === 'document';
		if (libraryFilter.value === 'contracts') return k === 'contract';
		if (libraryFilter.value === 'proposals') return k === 'proposal';
		return true;
	});
});

// Folders present among this project's files — drives the folder filter row.
const libraryFolders = computed(() => {
	const map = new Map<string, string>();
	for (const row of files.value) {
		const fl = row.directus_files_id?.folder;
		if (fl?.id) map.set(fl.id, fl.name || 'Folder');
	}
	return [...map.entries()].map(([id, name]) => ({ id, name }));
});

// Whether the authored proposal/contract lists show under the current filter.
const showContractsSection = computed(() => libraryFilter.value === 'all' || libraryFilter.value === 'contracts');
const showProposalsSection = computed(() => libraryFilter.value === 'all' || libraryFilter.value === 'proposals');

const libraryFilterChips: Array<{ key: LibraryFilter; label: string; icon: string }> = [
	{ key: 'all', label: 'All', icon: 'lucide:layers' },
	{ key: 'contracts', label: 'Contracts', icon: 'lucide:file-signature' },
	{ key: 'proposals', label: 'Proposals', icon: 'lucide:file-text' },
	{ key: 'documents', label: 'Documents', icon: 'lucide:file' },
	{ key: 'assets', label: 'Assets', icon: 'lucide:image' },
];

// Re-tag a file into a single library bucket (clears other known tags first).
async function setFileKind(row: any, tag: string | null) {
	const doc = row?.directus_files_id;
	if (!doc?.id) return;
	const current = Array.isArray(doc.tags) ? doc.tags.slice() : [];
	const next = current.filter((t: any) => !LIBRARY_TAGS.includes(String(t).toLowerCase()));
	if (tag) next.push(tag);
	try {
		await filesApi.update(doc.id, { tags: next });
		doc.tags = next;  // optimistic — keeps the badge in sync without a refetch
	} catch (e: any) {
		toast.error(e?.data?.message || e?.message || 'Failed to update tag');
	}
}

// Attach an already-uploaded file (search-driven so we never dump the whole
// asset library). Reuses the admin-token attach-file proxy.
const showAttachFileModal = ref(false);
const attachSearch = ref('');
const attachResults = ref<any[]>([]);
const attachSearching = ref(false);
const attachedFileIds = computed(() => new Set(files.value.map((r) => r.directus_files_id?.id).filter(Boolean)));
let attachSearchTimer: ReturnType<typeof setTimeout> | null = null;
function onAttachSearchInput() {
	if (attachSearchTimer) clearTimeout(attachSearchTimer);
	attachSearchTimer = setTimeout(searchOrgFiles, 250);
}
async function searchOrgFiles() {
	const q = attachSearch.value.trim();
	if (q.length < 2) { attachResults.value = []; return; }
	attachSearching.value = true;
	try {
		const res: any = await filesApi.list({
			search: q,
			fields: ['id', 'title', 'filename_download', 'type', 'filesize', 'uploaded_on'],
			sort: ['-uploaded_on'],
			limit: 25,
		});
		const rows = Array.isArray(res) ? res : (res?.data ?? []);
		attachResults.value = rows.filter((f: any) => !attachedFileIds.value.has(f.id));
	} catch {
		attachResults.value = [];
	} finally {
		attachSearching.value = false;
	}
}
async function attachExistingFile(f: any) {
	try {
		await $fetch('/api/projects/attach-file', { method: 'POST', body: { projectId: props.projectId, fileId: f.id } });
		toast.success('File attached');
		showAttachFileModal.value = false;
		attachSearch.value = '';
		attachResults.value = [];
		await loadFiles();
	} catch (e: any) {
		toast.error(e?.data?.message || e?.message || 'Failed to attach file');
	}
}

// Toggle between Board / List for tasks + tickets. Stored per-surface in
// a cookie so the panel and page can share their preference.
const tasksView = useCookie<'board' | 'list'>('apps-project-tasks-view', { default: () => 'list' });
const ticketsView = useCookie<'board' | 'list'>('apps-project-tickets-view', { default: () => 'list' });

const tabCounts = computed<Partial<Record<ProjectTabKey, number>>>(() => ({
	tasks: taskCount.value,
	tickets: ticketCount.value,
	channels: channels.value.length,
	meetings: meetings.value.length,
	invoices: invoices.value.length,
	// Files & Docs = uploaded files + authored proposals + authored contracts.
	library: files.value.length + documentsProposalCount.value + documentsContractCount.value,
	contacts: projectContactCount.value,
}));

// Overview "at a glance" — read-first health so the landing tab leads with
// signal (status, timeline, client, value) instead of a raw edit form. Uses
// only fields already on the project record so it's accurate on first paint.
const overviewGlance = computed(() => {
	const p = (project.value || {}) as any;
	const status = p.status === 'completed' ? 'Completed' : (p.status || '—');
	const closed = p.status === 'completed' || p.status === 'Archived';
	const attention: Array<{ label: string; tone?: 'warn' | 'danger' }> = [];

	let timeline = 'No due date';
	let timelineTone: 'default' | 'warn' | 'danger' = 'default';
	if (p.due_date) {
		const due = new Date(p.due_date); due.setHours(0, 0, 0, 0);
		const today = new Date(); today.setHours(0, 0, 0, 0);
		const days = Math.round((due.getTime() - today.getTime()) / 86400000);
		if (days < 0) {
			timeline = `${Math.abs(days)}d overdue`;
			if (!closed) { timelineTone = 'danger'; attention.push({ label: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`, tone: 'danger' }); }
		} else if (days === 0) {
			timeline = 'Due today';
			if (!closed) timelineTone = 'warn';
		} else {
			timeline = `${days}d left`;
		}
	}

	const usd0 = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
	const value = contractValueNum.value != null ? usd0(contractValueNum.value) : '—';

	const metrics: Array<{ label: string; value: string | number; tone?: 'default' | 'good' | 'warn' | 'danger' }> = [
		{ label: 'Status', value: status },
		{ label: 'Timeline', value: timeline, tone: timelineTone },
		{ label: 'Client', value: p.client?.name || '—' },
		{ label: 'Value', value },
	];

	// "Left to bill" sits right beside Value: contract value minus everything
	// invoiced so far. Fully-billed (≤ 0) reads as good; a negative means
	// over-billed, which we surface plainly ("−$X").
	if (remainingToBill.value != null && contractValueNum.value != null) {
		const rem = remainingToBill.value;
		metrics.push({
			label: 'Left to bill',
			value: rem < 0 ? `−${usd0(Math.abs(rem))}` : usd0(rem),
			tone: rem <= 0 ? 'good' : 'default',
		});
	}

	return { metrics, attention };
});

const projectTeamMembers = computed(() => {
	return ((project.value as any)?.assigned_to || [])
		.map((a: any) => a.directus_users_id)
		.filter((u: any) => u && typeof u === 'object')
		.map((u: any) => ({ id: u.id, first_name: u.first_name || '', last_name: u.last_name || '', avatar: u.avatar }));
});

const organizationId = computed(() => (project.value as any)?.organization?.id || null);
const clientId = computed(() => (project.value as any)?.client?.id || null);

// Tab-activation loader. Shared by the active-tab watcher AND the
// hover-prefetch handler from <ProjectTabsBar>. The `loading` flags +
// useDirectusItems request-dedup prevent doubles.
function loadForTab(tab: ProjectTabKey) {
	switch (tab) {
		case 'tasks':    if (taskCount.value === 0) refreshTaskCount(); break;
		case 'tickets':  if (ticketCount.value === 0) refreshTicketCount(); break;
		case 'channels': if (!channels.value.length && !channelsLoading.value) loadChannels(); break;
		case 'meetings': if (!meetings.value.length && !meetingsLoading.value) loadMeetings(); break;
		case 'invoices': if (!invoices.value.length && !invoicesLoading.value) loadInvoices(); break;
		case 'contacts': if (!contactsLoaded.value && !contactsLoading.value) loadProjectContacts(); break;
		// Files & Docs — warm the file list (proposals/contracts self-fetch).
		case 'library':  if (!files.value.length && !filesLoading.value) loadFiles(); break;
		// 'activity' (ProjectsActivityTimeline) self-fetches; nothing to warm.
	}
}

watch(activeTab, (next) => {
	emit('tab-change', next);
	loadForTab(next);
});

async function loadProject() {
	loading.value = true;
	error.value = null;
	billedTotal.value = null;  // reset so a project switch doesn't flash a stale figure
	paidTotal.value = null; currentOutstanding.value = null; overdueTotal.value = null; huntRows.value = [];
	try {
		const p = await projectItemsApi.get(props.projectId, {
			fields: [
				'id', 'title', 'status', 'pinned', 'description', 'contract_value',
				'start_date', 'due_date', 'projected_date', 'completion_date',
				'url', 'template',
				'csat_rating', 'csat_comment', 'csat_submitted_at',
				'service.id', 'service.name', 'service.color',
				'organization.id', 'organization.name', 'organization.logo',
				'client.id', 'client.name',
				'assigned_to.id',
				'assigned_to.directus_users_id.id',
				'assigned_to.directus_users_id.first_name',
				'assigned_to.directus_users_id.last_name',
				'assigned_to.directus_users_id.avatar',
				'assigned_to.directus_users_id.email',
			],
		});
		project.value = p;
		if (p) emit('loaded', p);
		// Kick off cheap counts in parallel for the initial tab badges.
		refreshTaskCount();
		refreshTicketCount();
		refreshProjectContactCount();
		loadBillingSummary();
		loadClientContacts();  // eager: powers the Overview "key contacts" strip
	} catch (e: any) {
		error.value = e?.message || 'Failed to load project';
	} finally {
		loading.value = false;
	}
}

// Inline quick-edit (status pill in the hero, dates in the identity strip).
// Optimistic: patch local state + re-emit `loaded` so the page hero updates
// immediately, then persist. Rolls back + toasts on failure.
async function patchProject(fields: Record<string, any>) {
	if (!project.value?.id || !fields || !Object.keys(fields).length) return;
	const prev = { ...project.value };
	Object.assign(project.value, fields);
	emit('loaded', project.value);
	try {
		// Persist only — we deliberately do NOT merge the response. A bare
		// update returns relations (client/service) as scalar FK ids, which
		// would clobber the deep-fetched objects the identity strip renders
		// (making the client name disappear). The optimistic scalar assign
		// above is already the correct new state.
		await projectItemsApi.update(project.value.id, fields);
		// Arcade reward — only on a genuine transition into completed. A project
		// finished on or before its due date earns an extra on-time bonus.
		if (fields.status === 'completed' && prev.status !== 'completed') {
			awardEvent('project_completed');
			const due = prev.due_date ? new Date(prev.due_date) : null;
			if (due && !Number.isNaN(due.getTime()) && due.getTime() >= Date.now()) {
				awardEvent('project_on_time');
			}
		}
	} catch (e: any) {
		Object.assign(project.value, prev);
		emit('loaded', project.value);
		toast.error(e?.data?.message || e?.message || 'Failed to update project');
	}
}

async function refreshTaskCount() {
	try {
		// Count ALL of the project's tasks (matches the Tasks tab + timeline).
		// No Mine/Everyone lens inside a single project.
		const filter: any = {
			_and: [
				{
					_or: [
						{ project_id: { _eq: props.projectId } },
						{ project_event_id: { project: { _eq: props.projectId } } },
					],
				},
			],
		};
		taskCount.value = await taskItemsApi.count(filter).catch(() => 0);
	} catch {
		taskCount.value = 0;
	}
}


async function refreshTicketCount() {
	try {
		ticketCount.value = await ticketItemsApi
			.count({ project: { _eq: props.projectId } })
			.catch(() => 0);
	} catch {
		ticketCount.value = 0;
	}
}

async function loadChannels() {
	channelsLoading.value = true;
	try {
		channels.value = await channelItemsApi.list({
			fields: ['id', 'name', 'date_created', 'client.id', 'client.name', 'ticket.id', 'ticket.title'],
			filter: { project: { _eq: props.projectId } },
			sort: ['name'],
			limit: -1,
		}).catch(() => []) as any[];
	} finally {
		channelsLoading.value = false;
	}
}

async function loadMeetings() {
	meetingsLoading.value = true;
	try {
		meetings.value = await meetingItemsApi.list({
			fields: [
				'id', 'title', 'status', 'scheduled_start', 'actual_start',
				'actual_duration_minutes', 'recording_url', 'transcript_text', 'summary_status',
				'host_user.id', 'host_user.first_name', 'host_user.last_name',
				'project.id', 'project.title',
				'project_event.id', 'project_event.title',
				'project_event.project.id', 'project_event.project.title',
			],
			filter: {
				_or: [
					{ project: { _eq: props.projectId } },
					{ project_event: { project: { _eq: props.projectId } } },
				],
			},
			sort: ['-scheduled_start'],
			limit: -1,
		}).catch(() => []) as any[];
	} finally {
		meetingsLoading.value = false;
	}
}

async function loadInvoices() {
	invoicesLoading.value = true;
	try {
		invoices.value = await invoiceItemsApi.list({
			fields: ['id', 'invoice_code', 'status', 'total_amount', 'invoice_date', 'due_date', 'client.id', 'client.name', 'bill_to.name'],
			filter: { projects: { projects_id: { _eq: props.projectId } } },
			sort: ['-invoice_date'],
			limit: -1,
		}).catch(() => []) as any[];
	} finally {
		invoicesLoading.value = false;
	}
}

// Billing summary — the full "value → paid → to-hunt" split for this project.
// Sums total_amount across every invoice linked to the project (billedTotal,
// mirrors the legacy loadStats invoiceTotal), and additionally derives Paid /
// Outstanding / Overdue from the nested payments. We use *summed payments*
// (not invoice.status) so partial payments count correctly — a $10k invoice
// with $6k received leaves $4k to hunt, not $0 or $10k. livemode===false rows
// are Stripe test-mode and excluded; refunds are negative rows and net out.
interface HuntRow { id: string; code: string; who: string; outstanding: number; dueDate: string | null }
const paidTotal = ref<number | null>(null);
const currentOutstanding = ref<number | null>(null);
const overdueTotal = ref<number | null>(null);
const huntRows = ref<HuntRow[]>([]);
// Dated payment ledger for this project's invoices → the period "Collected" card.
const projectPayments = ref<{ amount: number; date: string | null }[]>([]);

async function loadBillingSummary() {
	try {
		const paymentItemsApi = useDirectusItems('payments_received');
		const [rows, payments] = await Promise.all([
			invoiceItemsApi.list({
				fields: [
					'id', 'invoice_code', 'status', 'total_amount', 'due_date',
					'client.name', 'bill_to.name',
					'payments.amount', 'payments.status', 'payments.livemode',
				],
				filter: { projects: { projects_id: { _eq: props.projectId } } },
				limit: -1,
			}).catch(() => []) as Promise<any[]>,
			// Payments on invoices linked to this project (via the junction).
			paymentItemsApi.list({
				fields: ['amount', 'date_received', 'date_created'],
				filter: {
					_and: [
						{ invoice_id: { projects: { projects_id: { _eq: props.projectId } } } },
						{ _or: [{ livemode: { _null: true } }, { livemode: { _eq: true } }] },
					],
				},
				limit: -1,
			}).catch(() => []) as Promise<any[]>,
		]);

		const today = new Date(); today.setHours(0, 0, 0, 0);
		let billed = 0, paid = 0, current = 0, overdue = 0;
		const hunt: HuntRow[] = [];

		for (const inv of rows) {
			if (inv?.status === 'archived') continue;
			const total = Number(inv?.total_amount) || 0;
			billed += total;
			const invPaidRaw = (inv?.payments || []).reduce((s: number, p: any) => {
				if (p?.status !== 'paid' || p?.livemode === false) return s;
				return s + (Number(p?.amount) || 0);
			}, 0);
			// Clamp so per-invoice paid + outstanding == total (over/under-payment
			// edges don't skew the pipeline segments, which must sum to invoiced).
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
				code: inv?.invoice_code || 'Invoice',
				who: inv?.client?.name || inv?.bill_to?.name || 'Client',
				outstanding: invOut,
				dueDate: inv?.due_date || null,
			});
		}

		billedTotal.value = billed;
		paidTotal.value = paid;
		currentOutstanding.value = current;
		overdueTotal.value = overdue;
		huntRows.value = hunt;
		projectPayments.value = (payments || []).map((p: any) => ({
			amount: Number(p?.amount) || 0,
			date: p?.date_received || p?.date_created || null,
		}));
	} catch {
		billedTotal.value = 0;
		paidTotal.value = 0;
		currentOutstanding.value = 0;
		overdueTotal.value = 0;
		huntRows.value = [];
		projectPayments.value = [];
	}
}

// Hunt-list row → jump to the invoices tab (loads lazily via loadForTab).
function openInvoiceFromHunt(_id: string) {
	activeTab.value = 'invoices';
}

// ── Manual event creation (Timeline tab) ───────────────────────────────────
// The apps/work surface previously had no way to add a project_event by hand
// (only the AI wizard on the legacy page). This lightweight modal creates one
// and remounts the Gantt via `timelineRefreshKey` so the new event appears.
const showNewEventModal = ref(false);
const creatingEvent = ref(false);
const timelineRefreshKey = ref(0);
const EVENT_TYPE_OPTIONS = [
	{ label: 'General', value: 'General' },
	{ label: 'Design', value: 'Design' },
	{ label: 'Content', value: 'Content' },
	{ label: 'Timeline', value: 'Timeline' },
	{ label: 'Financial', value: 'Financial' },
	{ label: 'Hours', value: 'Hours' },
];
const EVENT_STATUS_OPTIONS = [
	{ label: 'Scheduled', value: 'Scheduled' },
	{ label: 'Active', value: 'Active' },
	{ label: 'Completed', value: 'Completed' },
];
const newEventForm = reactive({
	title: '',
	description: '',
	type: 'General',
	status: 'Active',
	date: '',
	end_date: '',
	is_milestone: false,
});
function resetNewEventForm() {
	newEventForm.title = '';
	newEventForm.description = '';
	newEventForm.type = 'General';
	newEventForm.status = 'Active';
	newEventForm.date = '';
	newEventForm.end_date = '';
	newEventForm.is_milestone = false;
}
async function handleCreateEvent() {
	if (!newEventForm.title.trim() || creatingEvent.value) return;
	creatingEvent.value = true;
	try {
		const data: Record<string, any> = {
			title: newEventForm.title.trim(),
			type: newEventForm.type,
			status: newEventForm.status,
			project: props.projectId,
			is_milestone: newEventForm.is_milestone,
		};
		if (newEventForm.description.trim()) data.description = newEventForm.description.trim();
		// Mirror event_date into date (the Gantt prefers event_date, older code
		// reads date) so the new event lands on the timeline immediately.
		if (newEventForm.date) { data.date = newEventForm.date; data.event_date = newEventForm.date; }
		if (newEventForm.end_date) data.end_date = newEventForm.end_date;
		await eventItemsApi.create(data);
		toast.success('Event added');
		showNewEventModal.value = false;
		resetNewEventForm();
		timelineRefreshKey.value++;  // remount the Gantt so it refetches
	} catch (e: any) {
		toast.error(e?.data?.message || e?.message || 'Failed to add event');
	} finally {
		creatingEvent.value = false;
	}
}

// Contract value + "left to bill" = contract_value − invoiced-to-date. Null
// until both a contract value and the billed total are known.
const contractValueNum = computed<number | null>(() => {
	const raw = (project.value as any)?.contract_value;
	if (raw == null || raw === '') return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
});
const remainingToBill = computed<number | null>(() => {
	if (contractValueNum.value == null || billedTotal.value == null) return null;
	return contractValueNum.value - billedTotal.value;
});

// Project Contacts — fetched lazily via the projects_contacts junction.
// We pull the nested contact row so the UI can render names/emails without
// an extra round trip. Junction rows are sorted by their own `sort` column
// (NOT the contacts.sort, since one contact can be pinned to many projects).
const PROJECT_CONTACT_FIELDS = [
	'id',
	'sort',
	'date_created',
	'contact.id',
	'contact.first_name',
	'contact.last_name',
	'contact.email',
	'contact.title',
	'contact.is_billing_contact',
];

// The project's client's roster — inherited onto the project by default. A
// contact belongs to one client (contact.client), so this is a direct filter.
const CLIENT_CONTACT_FIELDS = ['id', 'first_name', 'last_name', 'email', 'title', 'is_billing_contact', 'sort'];
async function loadClientContacts() {
	const cid = projectClientId.value;
	if (!cid) { clientContacts.value = []; return; }
	clientContacts.value = await contactItemsApi.list({
		fields: CLIENT_CONTACT_FIELDS,
		filter: { client: { _eq: cid } },
		sort: ['sort'],
		limit: -1,
	}).catch(() => []) as any[];
}

async function loadProjectContacts() {
	contactsLoading.value = true;
	try {
		// Client roster (inherited) + the project-only junction, in parallel.
		const [rows] = await Promise.all([
			projectsContactsApi.list({
				fields: PROJECT_CONTACT_FIELDS,
				filter: { project: { _eq: props.projectId } },
				sort: ['sort'],
				limit: -1,
			}).catch(() => []) as Promise<any[]>,
			loadClientContacts(),
		]);
		projectContactRows.value = rows;
		// Extras = pinned contacts that AREN'T already in the client roster (so a
		// client contact never shows twice). Order by junction `sort`; rows
		// missing a sort fall to the end and sub-sort alphabetically.
		const inheritedIds = new Set(clientContacts.value.map((c) => c.id));
		const ordered = rows.filter((r) => r?.contact && !inheritedIds.has(r.contact.id));
		ordered.sort((a, b) => {
			const sa = a?.sort, sb = b?.sort;
			if (sa != null && sb != null && sa !== sb) return sa - sb;
			if (sa != null && sb == null) return -1;
			if (sa == null && sb != null) return 1;
			const an = `${a?.contact?.first_name || ''} ${a?.contact?.last_name || ''}`.toLowerCase();
			const bn = `${b?.contact?.first_name || ''} ${b?.contact?.last_name || ''}`.toLowerCase();
			return an.localeCompare(bn);
		});
		directProjectContactsOrdered.value = ordered;
		projectContactCount.value = clientContacts.value.length + ordered.length;
		contactsLoaded.value = true;
	} finally {
		contactsLoading.value = false;
	}
}

// Sorted client roster for display (inherited section).
const inheritedClientContacts = computed(() => {
	return [...clientContacts.value].sort((a, b) => {
		const sa = a?.sort, sb = b?.sort;
		if (sa != null && sb != null && sa !== sb) return sa - sb;
		const an = `${a?.first_name || ''} ${a?.last_name || ''}`.toLowerCase();
		const bn = `${b?.first_name || ''} ${b?.last_name || ''}`.toLowerCase();
		return an.localeCompare(bn);
	});
});
const projectClientName = computed(() => (project.value as any)?.client?.name || 'the client');

// Overview "key contacts" strip — billing contact first, then a couple more.
const keyContacts = computed(() => {
	const list = inheritedClientContacts.value;
	const billing = list.filter((c) => c.is_billing_contact);
	const rest = list.filter((c) => !c.is_billing_contact);
	return [...billing, ...rest].slice(0, 3);
});

async function refreshProjectContactCount() {
	try {
		const cid = projectClientId.value;
		const [proj, cli] = await Promise.all([
			projectsContactsApi.count({ project: { _eq: props.projectId } }).catch(() => 0),
			cid ? contactItemsApi.count({ client: { _eq: cid } }).catch(() => 0) : Promise.resolve(0),
		]);
		// Upper bound for the badge (exact de-dupe happens once the tab loads).
		projectContactCount.value = (proj || 0) + (cli || 0);
	} catch {
		projectContactCount.value = 0;
	}
}

async function onProjectContactDragEnd() {
	const updates: Array<{ id: string; sort: number }> = [];
	directProjectContactsOrdered.value.forEach((row, idx) => {
		const next = (idx + 1) * 10;
		if (row?.sort !== next) {
			row.sort = next;
			if (row?.id) updates.push({ id: row.id, sort: next });
		}
	});
	if (!updates.length) return;
	try {
		await Promise.all(updates.map((u) => projectsContactsApi.update(u.id, { sort: u.sort })));
	} catch (err) {
		console.error('[ProjectWorkspace] persist contact order failed', err);
		// Reseed from server on failure so the UI doesn't show a phantom order.
		contactsLoaded.value = false;
		await loadProjectContacts();
	}
}

// When the user creates a brand-new contact from the Contacts tab, we want
// it attached to BOTH the client (via clients_contacts, so it appears under
// the client roster too) AND the project (via projects_contacts). The
// ContactsFormModal already writes clients_contacts when client-id is
// supplied; we just have to add the projects_contacts row on success.
async function onContactCreatedFromProject(contact: any) {
	showCreateContactModal.value = false;
	const contactId = contact?.id;
	if (!contactId) {
		await loadProjectContacts();
		return;
	}
	try {
		await projectsContactsApi.create({
			project: props.projectId,
			contact: contactId,
			sort: ((projectContactCount.value || 0) + 1) * 10,
		});
	} catch (err) {
		console.error('[ProjectWorkspace] attach new contact to project failed', err);
	}
	contactsLoaded.value = false;
	await loadProjectContacts();
}

function onContactAttachedToProject() {
	showAttachContactModal.value = false;
	contactsLoaded.value = false;
	loadProjectContacts();
}

// Cross-panel push for contact rows. NuxtLink would route the page; in the
// slide-over stack we push a Contact panel instead so the user keeps their
// project context on screen.
const { push: pushPanel } = useAppSlideOverStack();
const contactSlide = useAppSlideOver('contact');
function openContactSlideOver(id: string) {
	contactSlide.open(id);
}

// Open a channel inside the slide-over stack (see the channels list template).
function openChannel(channel: { id: string | number }) {
	pushPanel('channel', String(channel.id));
}

// Ticket board status columns — shared source of truth (also feeds the header
// New Ticket composer). Bound in script so template access is unambiguous.
const ticketColumns = TICKET_BOARD_COLUMNS;

// Pin-to-top toggle — bumps the project to the front of the home widget + lists.
const { togglePin: togglePinProject } = usePinnable('projects');
async function onTogglePin() {
	if (project.value) await togglePinProject(project.value as any);
}

async function loadFiles() {
	filesLoading.value = true;
	try {
		// projects_files has no user-level read permission — proxy via
		// the admin-token endpoint (org-membership gated).
		files.value = (await $fetch(`/api/projects/${props.projectId}/files`).catch(() => [])) as any[];
	} finally {
		filesLoading.value = false;
	}
}

// ── File upload (self-contained; no legacy-page hop) ──────────────────────
const uploadingFile = ref(false);
const isDraggingFile = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

function triggerFileUpload() {
	fileInputRef.value?.click();
}

async function handleFileUpload(fileList: FileList | File[] | null | undefined) {
	if (!fileList || !fileList.length) return;
	uploadingFile.value = true;
	try {
		for (const file of Array.from(fileList)) {
			const formData = new FormData();
			formData.append('file', file);
			if (project.value?.title) {
				formData.append('title', `${project.value.title} - ${file.name}`);
			}
			// Server endpoint handles auth (same path as the legacy page).
			const response: any = await $fetch('/api/directus/files/upload', {
				method: 'POST',
				body: formData,
			});
			const fileId = response?.id ?? response?.data?.id;
			if (fileId) {
				// Junction write goes through an admin-token endpoint —
				// projects_files has no user-level create permission.
				await $fetch('/api/projects/attach-file', {
					method: 'POST',
					body: { projectId: props.projectId, fileId },
				});
			}
		}
		toast.success('Files uploaded');
		await loadFiles();
	} catch (err: any) {
		console.error('Error uploading file:', err);
		toast.error(err?.data?.message || err?.message || 'Upload failed');
	} finally {
		uploadingFile.value = false;
		if (fileInputRef.value) fileInputRef.value.value = '';
	}
}

function onFileInputChange(e: Event) {
	handleFileUpload((e.target as HTMLInputElement).files);
}

function onFileDrop(e: DragEvent) {
	isDraggingFile.value = false;
	handleFileUpload(e.dataTransfer?.files);
}

// ── Inline create / attach modals ─────────────────────────────────────────
// Task creation is owned by the embedded TasksBoard / TasksListView (each
// ships its own + button), so the workspace only adds Attach Existing there.
// Tickets are workspace-owned: the New Ticket + Attach Existing buttons live
// together in the tickets header (board create suppressed via `hide-create`).
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
const showCreateContactModal = ref(false);
const showAttachContactModal = ref(false);

function onTicketAttached() {
	showAttachTicketModal.value = false;
	refreshTicketCount();
}
// New Ticket is created from the workspace header (next to Attach Existing);
// refresh the tab count and nudge the embedded board to re-fetch.
function onTicketCreated() {
	refreshTicketCount();
	useTicketsStore().triggerRefresh();
}
function onTaskAttached() {
	showAttachTaskModal.value = false;
	refreshTaskCount();
}
function onInvoiceCreated() {
	showCreateInvoiceModal.value = false;
	loadInvoices();
	loadBillingSummary();
}
function onInvoiceAttached() {
	showAttachInvoiceModal.value = false;
	loadInvoices();
	loadBillingSummary();
}
function onChannelAttached() {
	showAttachChannelModal.value = false;
	loadChannels();
}

// Inline channel creation — mirrors Slack/Channels.vue. Names are slugs
// (lowercase, hyphenated). New channels inherit the project's org + client so
// they land tagged to this project.
const showCreateChannel = ref(false);
const newChannelName = ref('');
const creatingChannel = ref(false);
const channelSlug = (s: string) =>
	String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const channelNameValid = computed(() => channelSlug(newChannelName.value).length >= 3);
async function createChannel() {
	if (!channelNameValid.value || creatingChannel.value) return;
	creatingChannel.value = true;
	try {
		await $fetch('/api/channels', {
			method: 'POST',
			body: {
				name: channelSlug(newChannelName.value),
				organization: organizationId.value || undefined,
				project: props.projectId,
				client: clientId.value || undefined,
			},
		});
		toast.success('Channel created');
		newChannelName.value = '';
		showCreateChannel.value = false;
		loadChannels();
	} catch (err: any) {
		toast.error(err?.data?.message || err?.message || 'Failed to create channel');
	} finally {
		creatingChannel.value = false;
	}
}
function onMeetingCreated() {
	showCreateMeetingModal.value = false;
	loadMeetings();
}
// Link the freshly-created doc to THIS project (the shared FormModals have no
// project picker; now that proposals.project / contracts.project exist we set
// it here so the doc lands under this project's Files & Docs tab).
async function onProposalCreated(created?: any) {
	showCreateProposalModal.value = false;
	if (created?.id) {
		try { await proposalItemsApi.update(created.id, { project: props.projectId } as any); } catch { /* non-fatal */ }
	}
	documentsRefreshTick.value++;
}
async function onContractCreated(created?: any) {
	showCreateContractModal.value = false;
	if (created?.id) {
		try { await contractItemsApi.update(created.id, { project: props.projectId } as any); } catch { /* non-fatal */ }
	}
	documentsRefreshTick.value++;
}
// Attaching an EXISTING proposal/contract just sets its `project` FK (handled
// by AppsWorkAttachExistingModal). Refresh the lists so it appears.
function onProposalAttached() {
	showAttachProposalModal.value = false;
	documentsRefreshTick.value++;
}
function onContractAttached() {
	showAttachContractModal.value = false;
	documentsRefreshTick.value++;
}

// Cross-panel push for client row in identity strip. NuxtLink to
// `/apps/clients/<id>` handles the page jump; if the user is inside the
// slide-over stack, we push a Client panel on top instead.
const clientSlide = useAppSlideOver('client');
function openClientSlideOver(id: string) {
	clientSlide.open(id);
}

// Custom attach for invoices: they relate to projects via the
// `projects` junction (m2m through `invoices_projects`). Bypass the
// modal's default FK update by passing `customAttach`.
async function attachInvoiceCustom(row: any) {
	await invoiceItemsApi.update(row.id, {
		projects: { create: [{ projects_id: props.projectId }] },
	});
}

const invoiceDefaults = computed(() => ({
	projects: [props.projectId],
	bill_to: organizationId.value || null,
	client: clientId.value || null,
}));

// ── Formatting helpers ─────────────────────────────────────────────────────
function fmtCurrency(n: number | string | null | undefined): string {
	const num = Number(n);
	if (!Number.isFinite(num)) return '—';
	return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(d: string | null | undefined): string {
	if (!d) return '—';
	try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
}

function fmtDateTime(d: string | null | undefined): string {
	if (!d) return '—';
	try {
		return new Date(d).toLocaleString(undefined, {
			month: 'short', day: 'numeric', year: 'numeric',
			hour: 'numeric', minute: '2-digit',
		});
	} catch { return '—'; }
}

function formatFileSize(bytes: number | null | undefined): string {
	if (!bytes) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1048576).toFixed(1)} MB`;
}

// Skeleton sizing — uses the tab badge as a hint so the body occupies
// its final height immediately. Capped so a large list doesn't produce
// a huge ghost block.
function skeletonRows(n: number, fallback = 4, max = 8): number[] {
	const k = Math.min(Math.max(n || fallback, 1), max);
	return Array.from({ length: k }, (_, i) => i);
}

function getFileIcon(type: string | null | undefined): string {
	if (!type) return 'lucide:file';
	if (type.startsWith('image/')) return 'lucide:image';
	if (type.includes('pdf')) return 'lucide:file-text';
	if (type.includes('spreadsheet') || type.includes('excel')) return 'lucide:table';
	if (type.includes('presentation') || type.includes('powerpoint')) return 'lucide:presentation';
	return 'lucide:file';
}

function meetingChipLabel(m: any): { label: string; tone: string } {
	if (m.summary_status === 'complete') return { label: 'Recap ready', tone: 'emerald' };
	if (m.summary_status === 'generating') return { label: 'Generating…', tone: 'sky' };
	if (m.summary_status === 'failed') return { label: 'Recap failed', tone: 'red' };
	if (m.transcript_text) return { label: 'Awaiting recap', tone: 'amber' };
	if (m.status === 'completed') return { label: 'Completed', tone: 'gray' };
	if (m.status === 'in_progress') return { label: 'In progress', tone: 'sky' };
	if (m.status === 'cancelled') return { label: 'Cancelled', tone: 'gray' };
	return { label: 'Scheduled', tone: 'gray' };
}

const meetingTone: Record<string, string> = {
	emerald: 'bg-success/15 text-success',
	sky: 'bg-info/15 text-info',
	amber: 'bg-warning/15 text-warning',
	red: 'bg-destructive/15 text-destructive',
	gray: 'bg-muted/40 text-muted-foreground',
};

defineExpose({
	project,
	loading,
	error,
	reload: loadProject,
	patchProject,
	tabCounts,
	activeTab,
});

watch(() => props.projectId, () => {
	if (props.projectId) loadProject();
}, { immediate: true });
</script>

<template>
	<div class="project-workspace">
		<div v-if="loading && !project" class="flex flex-col items-center justify-center py-16 gap-3">
			<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
			<p class="text-xs text-muted-foreground">Loading project…</p>
		</div>

		<div v-else-if="error && !project" class="flex flex-col items-center justify-center py-16 gap-3">
			<Icon name="lucide:alert-circle" class="w-8 h-8 text-destructive" />
			<p class="text-sm text-destructive">{{ error }}</p>
		</div>

		<template v-else-if="project">
			<AppsWorkProjectIdentityStrip
				:project="project"
				:compact="compact"
				size="sm"
				class="mb-5"
				@update="patchProject"
			>
				<!-- Satisfaction score sits in the universal rating position,
				     matching the client surface. Set from the portal on
				     completion, so it only appears once submitted. -->
				<template v-if="project.csat_rating" #rating>
					<CsatBadge
						:rating="project.csat_rating"
						:comment="project.csat_comment"
						:submitted-at="project.csat_submitted_at"
					/>
				</template>
				<template #actions>
					<!-- A single, wrapping action row so the top never spills
					     onto a sloppy second line. Order: pin, primary coaching
					     action, Ask-Earnest drafting, then any panel-injected
					     escape hatch (e.g. "Open Project" in the slide-over). -->
					<PinButton :pinned="(project as any)?.pinned" always @toggle="onTogglePin" />
					<button
						type="button"
						class="inline-flex items-center justify-center h-8 rounded-full bg-foreground text-background text-xs font-medium ios-press shrink-0"
						:class="compact ? 'w-8 p-0' : 'gap-1.5 px-3'"
						title="Convene the Boardroom — Earnest gathers your board on this project"
						aria-label="Convene the Boardroom on this project"
						@click="conveneMeeting"
					>
						<DirectorChairIcon class="w-4 h-4 shrink-0" />
						<!-- Icon-only (a perfect circle) inside the narrow slide-over;
						     labelled on the full page. Title tooltip covers icon-only. -->
						<span v-if="!compact" class="hidden sm:inline">Convene</span>
					</button>
					<!-- Slide-over only: the full page already has an "Ask Earnest" in
					     its AppHeader. One opener per surface. Icon-only circle + tooltip
					     so it doesn't crowd the narrow panel header. -->
					<UiActionButton v-if="compact" circle icon="earnest" variant="primary" hide-label="always" title="Ask Earnest" @click="openEarnestPanel()">
						Ask Earnest
					</UiActionButton>
					<slot name="actions" />
				</template>
			</AppsWorkProjectIdentityStrip>

			<AppsWorkProjectTabsBar
				v-model="activeTab"
				:counts="tabCounts"
				class="mb-5"
				@prefetch="loadForTab"
			/>

			<div class="ios-card p-4 sm:p-6">
				<!-- Overview — a work-first dashboard: health, Earnest's next
				     moves, then the live pulse (recent activity + touchpoints).
				     The raw field editor is demoted to a disclosure below so the
				     landing leads with work, not a form. -->
				<div v-if="activeTab === 'overview'" class="space-y-6">
					<AppsAtAGlance :metrics="overviewGlance.metrics" :attention="overviewGlance.attention" />

					<!-- Money: value → paid → to-hunt. Shows once billing has loaded
					     and there's either a contract value or something invoiced. -->
					<template v-if="paidTotal != null && (contractValueNum != null || (billedTotal || 0) > 0)">
						<!-- Collected · [period] — payments on this project's invoices. -->
						<MoneyCollectedCard
							:payments="projectPayments"
							title="Collected on this project"
							class="mb-4"
						/>
						<!-- Two-up only when there's something to hunt AND room for it
						     (full page). Nothing to hunt → hide the Hunt card and let the
						     pipeline span full width. Narrow slide-over (compact) always
						     stacks so the widgets aren't crushed. -->
						<div
							class="grid gap-4"
							:class="!compact && huntRows.length ? 'lg:grid-cols-2' : 'grid-cols-1'"
						>
							<MoneyPipeline
								:contract-value="contractValueNum"
								:paid="paidTotal || 0"
								:current-outstanding="currentOutstanding || 0"
								:overdue="overdueTotal || 0"
							/>
							<MoneyHuntList v-if="huntRows.length" :rows="huntRows" @open="openInvoiceFromHunt" />
						</div>
					</template>

					<!-- Key contacts — inherited from the client roster (billing
					     first), so you see who to reach without opening the tab. -->
					<div v-if="keyContacts.length" class="flex items-center gap-2 flex-wrap -mt-3">
						<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Key contacts</span>
						<button
							v-for="c in keyContacts"
							:key="c.id"
							type="button"
							class="inline-flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-full bg-muted/40 text-[12px] text-foreground/80 hover:bg-muted/70 hover:text-foreground transition-colors"
							@click="openContactSlideOver(c.id)"
						>
							<span class="w-1.5 h-1.5 rounded-full shrink-0" :class="c.is_billing_contact ? 'bg-success' : 'bg-primary/60'" />
							{{ c.first_name }} {{ c.last_name }}
							<span v-if="c.is_billing_contact" class="text-[9px] font-semibold uppercase tracking-wide text-success">Billing</span>
						</button>
						<button
							type="button"
							class="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
							@click="activeTab = 'contacts'"
						>View all →</button>
					</div>
					<!-- Earnest, focused on THIS project: scoped prompts + a Boardroom
					     convene, so opening a project surfaces work + next moves. -->
					<AppsEntityEarnestCard
						v-if="project.id"
						entity-type="project"
						:entity-id="String(project.id)"
						:label="project.title || 'this project'"
						hide-convene
					/>

					<!-- Live pulse: recent activity/events + latest touchpoints.
					     Stacks in the narrow slide-over (compact); two-up on the page. -->
					<div class="grid gap-6" :class="compact ? 'grid-cols-1' : 'lg:grid-cols-2'">
						<div class="min-w-0">
							<ETabs :items="overviewPulseTabs">
								<template #timeline>
									<div class="max-h-[24rem] overflow-y-auto pr-1 -mr-1">
										<AppsWorkProjectTimelineFeed :project-id="projectId" hide-header />
									</div>
								</template>
								<template #activity>
									<div class="max-h-[24rem] overflow-y-auto pr-1 -mr-1">
										<ProjectsActivityTimeline :project-id="projectId" hide-header />
									</div>
								</template>
							</ETabs>
						</div>
						<div class="min-w-0">
							<div class="flex items-center gap-2 mb-4">
								<Icon name="lucide:radio" class="w-5 h-5 text-primary" />
								<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Touchpoints</h3>
							</div>
							<AppsTouchpoints
								:project-id="projectId"
								:organization-id="organizationId"
								:client-id="clientId"
							/>
						</div>
					</div>

					<!-- Project details — inline editor, demoted to a disclosure. -->
					<details class="group rounded-2xl border border-border/50 bg-muted/10">
						<summary class="flex items-center justify-between gap-2 cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground/80 hover:text-foreground">
							<span class="inline-flex items-center gap-2">
								<Icon name="lucide:sliders-horizontal" class="w-4 h-4 text-muted-foreground" />
								Project details
							</span>
							<Icon name="lucide:chevron-down" class="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
						</summary>
						<div class="px-4 pb-4 pt-1 border-t border-border/40">
							<AppsInlineDetailsEditor
								v-if="project.id"
								collection="projects"
								:item-id="String(project.id)"
								:model-value="projectOverviewValues"
								:fields="PROJECT_OVERVIEW_FIELDS"
								:suggest-client-id="projectClientId"
								@updated="onProjectOverviewUpdated"
							/>
						</div>
					</details>
				</div>

				<!-- Timeline — a project-scoped Gantt: this project's events/
				     milestones + tickets + tasks on one time axis. Self-fetching
				     (isolated single-project state), so nothing to warm here. -->
				<div v-else-if="activeTab === 'timeline'">
					<div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
						<p class="text-xs text-muted-foreground">
							Events, milestones, tickets, and tasks for this project on one timeline.
						</p>
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
							@click="showNewEventModal = true"
						>
							<Icon name="lucide:plus" class="w-3 h-3" />
							New Event
						</button>
					</div>
					<ProjectTimelineUnifiedGantt :key="timelineRefreshKey" :project-id="projectId" />
				</div>

				<!-- Activity -->
				<div v-else-if="activeTab === 'activity'">
					<ProjectsActivityTimeline :project-id="projectId" />
				</div>

				<!-- Tasks — TasksBoard / TasksListView ship their own quick-add
				     inputs (per-column for the board, top-level for the list).
				     Workspace only adds the view toggle + Attach Existing
				     since neither inner component knows about already-existing
				     tasks elsewhere in the org. -->
				<div v-else-if="activeTab === 'tasks'">
					<div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
						<p class="text-xs text-muted-foreground">
							{{ tasksView === 'board' ? 'Drag a task between columns to update its status.' : 'All tasks tied to this project.' }}
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

					<TasksBoard
						v-if="tasksView === 'board'"
						:project-id="projectId"
						:organization-id="organizationId || undefined"
						:team-members="projectTeamMembers"
						@stats-changed="refreshTaskCount"
					/>
					<TasksListView
						v-else
						:project-id="projectId"
						:organization-id="organizationId || undefined"
						:team-members="projectTeamMembers"
						@stats-changed="refreshTaskCount"
					/>
				</div>

				<!-- Tickets — the workspace owns both create affordances here
				     (New Ticket + Attach Existing) so they sit together; the
				     board's own embedded create button is suppressed via
				     `hide-create`. -->
				<div v-else-if="activeTab === 'tickets'">
					<div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
						<p class="text-xs text-muted-foreground">All tickets opened for this project.</p>
						<div class="flex items-center gap-2">
							<button
								type="button"
								class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
								@click="showAttachTicketModal = true"
							>
								<Icon name="lucide:link" class="w-3 h-3" />
								Attach Existing
							</button>
							<TicketsCreate
								:columns="ticketColumns"
								:default-project="projectId"
								:default-organization="organizationId || undefined"
								@ticketCreated="onTicketCreated"
							/>
						</div>
					</div>

					<TicketsProjectBoard
						:project-id="projectId"
						:organization-id="organizationId || undefined"
						:compact="compact"
						@stats-changed="refreshTicketCount"
					/>
				</div>

				<!-- Touchpoints — lightweight communication log (outreach + follow-up). -->
				<div v-else-if="activeTab === 'touchpoints'">
					<AppsTouchpoints
						:project-id="projectId"
						:organization-id="organizationId"
						:client-id="clientId"
					/>
				</div>

				<!-- Channels -->
				<div v-else-if="activeTab === 'channels'">
					<div class="flex items-center justify-end gap-2 mb-3">
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
							@click="showAttachChannelModal = true"
						>
							<Icon name="lucide:link" class="w-3 h-3" />
							Attach Existing
						</button>
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors"
							:class="showCreateChannel
								? 'border-border text-muted-foreground hover:bg-muted/60'
								: 'border-primary/40 text-primary hover:bg-primary/10'"
							@click="showCreateChannel = !showCreateChannel"
						>
							<Icon :name="showCreateChannel ? 'lucide:x' : 'lucide:plus'" class="w-3 h-3" />
							{{ showCreateChannel ? 'Cancel' : 'New Channel' }}
						</button>
					</div>

					<!-- Inline create -->
					<div v-if="showCreateChannel" class="ios-card p-3 mb-3">
						<label class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Channel name</label>
						<div class="flex items-center gap-2">
							<div class="flex-1 flex items-center gap-1.5 h-9 rounded-full border border-border/50 bg-muted/30 px-3 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
								<span class="text-muted-foreground/50 text-sm">#</span>
								<input
									v-model="newChannelName"
									type="text"
									placeholder="e.g. design-feedback"
									:disabled="creatingChannel"
									class="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
									@keydown.enter="createChannel"
								>
							</div>
							<Button size="sm" class="h-9 shrink-0" :disabled="!channelNameValid || creatingChannel" @click="createChannel">
								{{ creatingChannel ? 'Creating…' : 'Create' }}
							</Button>
						</div>
						<p class="text-[10px] text-muted-foreground mt-1.5">
							Lowercase letters, numbers, and hyphens. Tagged to this project automatically.
						</p>
					</div>
					<div v-if="channelsLoading && !channels.length" class="space-y-px" aria-busy="true" aria-label="Loading channels">
						<div
							v-for="i in skeletonRows(channels.length)"
							:key="`ch-skel-${i}`"
							class="flex items-center gap-3 h-12 px-3 border-b border-border/30 last:border-b-0"
						>
							<span class="text-muted-foreground/40 text-sm shrink-0">#</span>
							<ESkeleton class="h-3.5 flex-1 max-w-[35%]" />
							<ESkeleton class="h-3.5 w-32 hidden md:block" />
						</div>
					</div>
					<div v-else-if="!channels.length" class="text-sm text-muted-foreground text-center py-10">
						No channels tagged to this project.
					</div>
					<div v-else class="space-y-px">
						<!-- Open the channel INSIDE the slide-over stack (stacked on
						     top of this project) rather than navigating the
						     underlying page — which previously left the channel
						     rendered behind the slide-over. Works the same on the
						     full project page (opens as a first-level slide-over). -->
						<button
							v-for="channel in channels"
							:key="channel.id"
							type="button"
							class="w-full text-left flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
							@click="openChannel(channel)"
						>
							<span class="text-muted-foreground/40 text-sm shrink-0">#</span>
							<p class="flex-1 text-sm font-medium truncate">{{ channel.name }}</p>
							<span
								v-if="channel.ticket?.title"
								class="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[160px]"
							>
								<Icon name="lucide:ticket" class="w-3 h-3 shrink-0" />
								{{ channel.ticket.title }}
							</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</button>
					</div>
				</div>

				<!-- Meetings -->
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
					<div v-if="meetingsLoading && !meetings.length" class="space-y-2" aria-busy="true" aria-label="Loading meetings">
						<div
							v-for="i in skeletonRows(meetings.length, 3, 5)"
							:key="`meet-skel-${i}`"
							class="ios-card flex items-start gap-3 px-4 py-3"
						>
							<ESkeleton class="w-9 h-9 rounded-xl shrink-0" />
							<div class="flex-1 space-y-2">
								<div class="flex items-start justify-between gap-2">
									<ESkeleton class="h-3.5 flex-1 max-w-[60%]" />
									<ESkeleton class="h-4 w-20 rounded-full shrink-0" />
								</div>
								<div class="flex gap-3">
									<ESkeleton class="h-3 w-28" />
									<ESkeleton class="h-3 w-12" />
								</div>
							</div>
						</div>
					</div>
					<div v-else-if="!meetings.length" class="text-sm text-muted-foreground text-center py-10">
						No meetings linked to this project yet.
					</div>
					<div v-else class="space-y-2">
						<button type="button" @click="pushPanel('work-meeting', m.id)"
							v-for="m in meetings"
							:key="m.id"
							class="w-full text-left ios-card block px-4 py-3 hover:bg-muted/30 transition-colors"
						>
							<div class="flex items-start gap-3">
								<div class="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0">
									<Icon name="lucide:video" class="w-4 h-4 text-success" />
								</div>
								<div class="flex-1 min-w-0">
									<div class="flex items-start justify-between gap-2">
										<p class="text-sm font-semibold text-foreground truncate">{{ m.title || 'Untitled meeting' }}</p>
										<span
											:class="[
												'flex-shrink-0 inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold uppercase tracking-wider',
												meetingTone[meetingChipLabel(m).tone],
											]"
										>
											{{ meetingChipLabel(m).label }}
										</span>
									</div>
									<div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
										<span class="inline-flex items-center gap-1">
											<Icon name="lucide:clock" class="w-3 h-3" />
											{{ fmtDateTime(m.actual_start || m.scheduled_start) }}
										</span>
										<span v-if="m.actual_duration_minutes" class="inline-flex items-center gap-1">
											<Icon name="lucide:play" class="w-3 h-3" />
											{{ m.actual_duration_minutes }}m
										</span>
										<span v-if="m.recording_url" class="inline-flex items-center gap-1 text-success">
											<Icon name="lucide:film" class="w-3 h-3" />
											Recording
										</span>
									</div>
								</div>
							</div>
						</button>
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
					<div v-if="invoicesLoading && !invoices.length" class="space-y-px" aria-busy="true" aria-label="Loading invoices">
						<div
							v-for="i in skeletonRows(invoices.length)"
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
					<div v-else-if="!invoices.length" class="text-sm text-muted-foreground text-center py-10">
						No invoices on this project yet.
					</div>
					<div v-else class="space-y-px">
						<button type="button" @click="pushPanel('invoice', inv.id)"
							v-for="inv in invoices"
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
								class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 capitalize bg-muted/40"
							>{{ inv.status }}</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</button>
					</div>
				</div>

				<!-- Files & Docs — one surface merging authored proposals/
				     contracts with uploaded files, classified by the native file
				     tags + folders that already exist in Directus. Filter chips
				     switch the population; folder chips narrow it. Authored
				     proposals/contracts still depend on the doc→project FK
				     (setup-doc-project-fk.ts); files work regardless. -->
				<div v-else-if="activeTab === 'library'" class="space-y-6">
					<!-- Filter chips + file actions -->
					<div class="flex items-center justify-between gap-2 flex-wrap">
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
						<div class="flex items-center gap-2 shrink-0">
							<button
								type="button"
								class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
								@click="showAttachFileModal = true"
							>
								<Icon name="lucide:link" class="w-3 h-3" />
								Attach file
							</button>
							<button
								type="button"
								class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
								:disabled="uploadingFile"
								@click="triggerFileUpload"
							>
								<Icon :name="uploadingFile ? 'lucide:loader-2' : 'lucide:upload'" :class="['w-3 h-3', uploadingFile && 'animate-spin']" />
								{{ uploadingFile ? 'Uploading…' : 'Upload' }}
							</button>
							<input ref="fileInputRef" type="file" multiple class="hidden" @change="onFileInputChange" />
						</div>
					</div>

					<!-- Folder filter — only when the project's files carry folders. -->
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
							:project-id="projectId"
							@count="documentsProposalCount = $event"
						/>
						<!-- Inherited: the client's proposals not tied to any project. -->
						<div v-if="projectClientId" class="mt-4">
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">From {{ projectClientName }} · client-level</p>
							<MoneyProposalsList :client-id="projectClientId" client-level-only />
						</div>
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
							:project-id="projectId"
							@count="documentsContractCount = $event"
						/>
						<!-- Inherited: the client's contracts not tied to any project. -->
						<div v-if="projectClientId" class="mt-4">
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">From {{ projectClientName }} · client-level</p>
							<MoneyContractsList :client-id="projectClientId" client-level-only />
						</div>
					</section>

					<!-- Files — uploaded attachments, filtered by chip + folder.
					     Each file carries a classifier (its tag) so a signed PDF
					     reads as a Contract, a brief as a Document, etc. -->
					<section>
						<div class="flex items-center gap-2 mb-3">
							<Icon name="lucide:folder" class="w-4 h-4 text-muted-foreground" />
							<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Files</h4>
							<span class="text-[10px] text-muted-foreground/70">{{ filteredLibraryFiles.length }}</span>
						</div>
						<div
							class="rounded-2xl border-2 border-dashed transition-colors"
							:class="isDraggingFile ? 'border-primary bg-primary/5 p-2' : 'border-transparent'"
							@dragover.prevent="isDraggingFile = true"
							@dragleave.prevent="isDraggingFile = false"
							@drop.prevent="onFileDrop"
						>
							<div v-if="filesLoading && !files.length" class="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-busy="true" aria-label="Loading files">
								<div v-for="i in skeletonRows(files.length, 4, 6)" :key="`file-skel-${i}`" class="ios-card p-3 flex items-center gap-3">
									<ESkeleton class="w-4 h-4 shrink-0" />
									<div class="flex-1 space-y-1.5">
										<ESkeleton class="h-3.5 w-3/4" />
										<ESkeleton class="h-2.5 w-20" />
									</div>
								</div>
							</div>
							<button
								v-else-if="!files.length"
								type="button"
								class="w-full text-sm text-muted-foreground text-center py-10 hover:text-foreground transition-colors"
								@click="triggerFileUpload"
							>
								Drag files here, click to upload, or attach an existing file.
							</button>
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
										<div class="flex items-center gap-2 mt-0.5">
											<span class="text-[10px] text-muted-foreground">{{ formatFileSize(row.directus_files_id?.filesize) }}</span>
											<span v-if="row.directus_files_id?.uploaded_on" class="text-[10px] text-muted-foreground">{{ fmtDate(row.directus_files_id.uploaded_on) }}</span>
											<span v-if="row.directus_files_id?.folder?.name" class="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
												<Icon name="lucide:folder" class="w-2.5 h-2.5" />{{ row.directus_files_id.folder.name }}
											</span>
										</div>
									</a>
									<select
										:value="fileKind(row)"
										class="shrink-0 h-6 rounded-full border border-border bg-muted/30 text-[10px] font-medium px-2 text-foreground/80 focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
										title="Classify this file"
										@change="setFileKind(row, ($event.target as HTMLSelectElement).value)"
									>
										<option value="document">Document</option>
										<option value="contract">Contract</option>
										<option value="proposal">Proposal</option>
										<option value="asset">Asset</option>
									</select>
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
						</div>
					</section>
				</div>

				<!-- Contacts — extra contacts pinned to this project via the
				     projects_contacts m2m junction. Mirrors the ClientWorkspace
				     contacts tab (drag to reorder, Attach Existing, New Contact)
				     but writes to the project junction instead of the client's
				     clients_contacts. New contacts also get a clients_contacts
				     row when the project has a client, so the same contact
				     surfaces under both the project AND its parent client. -->
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

					<div v-if="contactsLoading && !contactsLoaded" class="space-y-px" aria-busy="true" aria-label="Loading contacts">
						<div
							v-for="i in skeletonRows(projectContactCount)"
							:key="`pc-skel-${i}`"
							class="flex items-center gap-3 h-12 px-3 border-b border-border/30 last:border-b-0"
						>
							<span class="w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
							<ESkeleton class="h-3.5 flex-1 max-w-[40%]" />
						</div>
					</div>

					<template v-else>
						<!-- Empty only when neither the client roster nor extras exist. -->
						<div v-if="!inheritedClientContacts.length && !directProjectContactsOrdered.length" class="text-sm text-muted-foreground text-center py-10">
							No contacts yet.
							<span class="block mt-1 text-xs">
								{{ (project as any)?.client?.name ? 'This client has no contacts — add one above.' : 'Add a client to inherit its contacts, or attach one above.' }}
							</span>
						</div>

						<!-- Inherited from the client — the default roster. Read-only here;
						     managed on the client. -->
						<section v-if="inheritedClientContacts.length" class="mb-5">
							<div class="flex items-center gap-2 mb-2">
								<Icon name="lucide:building-2" class="w-3.5 h-3.5 text-muted-foreground" />
								<h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
									From
									<NuxtLink
										v-if="(project as any)?.client?.id"
										:to="`/apps/clients/${(project as any).client.id}`"
										class="text-foreground/70 hover:text-primary hover:underline"
									>{{ projectClientName }}</NuxtLink>
									<span v-else>{{ projectClientName }}</span>
								</h4>
								<span class="text-[10px] text-muted-foreground/60">{{ inheritedClientContacts.length }}</span>
							</div>
							<div class="space-y-px">
								<button
									v-for="c in inheritedClientContacts"
									:key="c.id"
									type="button"
									class="w-full text-left flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
									@click="openContactSlideOver(c.id)"
								>
									<span class="w-1.5 h-1.5 rounded-full shrink-0" :class="c.is_billing_contact ? 'bg-success' : 'bg-primary/60'" />
									<div class="flex-1 min-w-0 flex items-center gap-2">
										<p class="text-sm font-medium truncate">{{ c.first_name }} {{ c.last_name }}</p>
										<span v-if="c.title" class="text-[11px] text-muted-foreground truncate hidden sm:inline">· {{ c.title }}</span>
									</div>
									<span v-if="c.email" class="hidden md:inline text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">{{ c.email }}</span>
									<span v-if="c.is_billing_contact" class="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/15 text-success shrink-0">Billing</span>
									<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
								</button>
							</div>
						</section>

						<!-- Project-only extras — pinned via projects_contacts, not part of
						     the client roster (a stakeholder, freelancer, etc.). Reorderable. -->
						<section v-if="directProjectContactsOrdered.length">
							<div class="flex items-center gap-2 mb-2">
								<Icon name="lucide:pin" class="w-3.5 h-3.5 text-muted-foreground" />
								<h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Added to this project</h4>
								<span class="text-[10px] text-muted-foreground/60">{{ directProjectContactsOrdered.length }}</span>
							</div>
							<VueDraggable
								v-model="directProjectContactsOrdered"
								handle=".pc-row-drag-handle"
								item-key="id"
								class="space-y-px"
								ghost-class="contact-row__ghost"
								chosen-class="contact-row__chosen"
								drag-class="contact-row__drag"
								@end="onProjectContactDragEnd"
							>
								<template #item="{ element: row }">
									<div
										class="flex items-stretch gap-1 h-12 hover:bg-muted/40 border-b border-border/30 transition-colors group"
									>
										<span
											class="pc-row-drag-handle flex items-center justify-center w-6 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
											title="Drag to reorder"
										>
											<Icon name="lucide:grip-vertical" class="w-3.5 h-3.5" />
										</span>
										<button
											v-if="row.contact"
											type="button"
											class="flex flex-1 min-w-0 items-center gap-3 px-2 text-left"
											@click="openContactSlideOver(row.contact.id)"
										>
											<span
												class="w-1.5 h-1.5 rounded-full shrink-0"
												:class="row.contact.is_billing_contact ? 'bg-success' : 'bg-primary/60'"
											/>
											<div class="flex-1 min-w-0 flex items-center gap-2">
												<p class="text-sm font-medium truncate">
													{{ row.contact.first_name }} {{ row.contact.last_name }}
												</p>
												<span v-if="row.contact.title" class="text-[11px] text-muted-foreground truncate hidden sm:inline">
													· {{ row.contact.title }}
												</span>
											</div>
											<span v-if="row.contact.email" class="hidden md:inline text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
												{{ row.contact.email }}
											</span>
											<span v-if="row.contact.is_billing_contact" class="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/15 text-success shrink-0">
												Billing
											</span>
											<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
										</button>
										<div v-else class="flex flex-1 min-w-0 items-center px-2 text-xs text-muted-foreground italic">
											Contact removed
										</div>
									</div>
								</template>
							</VueDraggable>
						</section>
					</template>
				</div>

			</div>
		</template>

		<!-- New Event — manual project_event creation from the Timeline tab.
		     UModal contract: v-model + DEFAULT slot (not v-model:open/#content). -->
		<EModal v-if="project" v-model="showNewEventModal" title="New Event">
			<template #header>
				<h3 class="text-sm font-bold uppercase tracking-wide">New Event</h3>
			</template>
			<form class="space-y-4" @submit.prevent="handleCreateEvent">
				<div class="space-y-1">
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Title *</label>
					<EInput v-model="newEventForm.title" placeholder="Event title" autofocus />
				</div>
				<div class="space-y-1">
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
					<ETextarea v-model="newEventForm.description" placeholder="What happens at this milestone?" :rows="3" />
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-1">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Type</label>
						<ESelectMenu v-model="newEventForm.type" :options="EVENT_TYPE_OPTIONS" option-attribute="label" value-attribute="value" />
					</div>
					<div class="space-y-1">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
						<ESelectMenu v-model="newEventForm.status" :options="EVENT_STATUS_OPTIONS" option-attribute="label" value-attribute="value" />
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-1">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Date</label>
						<EInput v-model="newEventForm.date" type="date" />
					</div>
					<div class="space-y-1">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">End date</label>
						<EInput v-model="newEventForm.end_date" type="date" />
					</div>
				</div>
				<label class="flex items-center gap-2 text-xs text-foreground/80 cursor-pointer select-none">
					<input v-model="newEventForm.is_milestone" type="checkbox" class="rounded border-border" />
					Mark as milestone (diamond on the timeline)
				</label>
			</form>
			<template #footer>
				<div class="flex justify-end gap-3 w-full">
					<Button variant="outline" size="sm" @click="showNewEventModal = false">Cancel</Button>
					<Button size="sm" :disabled="creatingEvent || !newEventForm.title.trim()" @click="handleCreateEvent">
						<Icon v-if="creatingEvent" name="lucide:loader-2" class="animate-spin w-3 h-3 mr-1" />
						Add Event
					</Button>
				</div>
			</template>
		</EModal>

		<!-- Attach existing file — search the file library and link one to this
		     project via the admin-token attach-file proxy. Search-driven so we
		     never dump the whole asset library. -->
		<EModal v-if="project" v-model="showAttachFileModal" title="Attach existing file">
			<template #header>
				<h3 class="text-sm font-bold uppercase tracking-wide">Attach existing file</h3>
			</template>
			<div class="space-y-3">
				<div class="flex items-center gap-1.5 h-9 rounded-full border border-border/50 bg-muted/30 px-3 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
					<Icon name="lucide:search" class="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
					<input
						v-model="attachSearch"
						type="text"
						placeholder="Search files by name…"
						class="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
						@input="onAttachSearchInput"
					>
					<Icon v-if="attachSearching" name="lucide:loader-2" class="w-3.5 h-3.5 text-muted-foreground/50 animate-spin shrink-0" />
				</div>
				<p v-if="attachSearch.trim().length < 2" class="text-xs text-muted-foreground text-center py-6">
					Type at least 2 characters to search your files.
				</p>
				<p v-else-if="!attachSearching && !attachResults.length" class="text-xs text-muted-foreground text-center py-6">
					No files match “{{ attachSearch }}”.
				</p>
				<div v-else class="max-h-72 overflow-y-auto space-y-px -mx-1 px-1">
					<button
						v-for="f in attachResults"
						:key="f.id"
						type="button"
						class="w-full text-left flex items-center gap-3 h-12 px-3 rounded-lg hover:bg-muted/50 transition-colors group"
						@click="attachExistingFile(f)"
					>
						<Icon :name="getFileIcon(f.type)" class="w-4 h-4 text-muted-foreground shrink-0" />
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium truncate">{{ f.title || f.filename_download }}</p>
							<span class="text-[10px] text-muted-foreground">{{ formatFileSize(f.filesize) }}</span>
						</div>
						<Icon name="lucide:plus" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary shrink-0" />
					</button>
				</div>
			</div>
			<template #footer>
				<div class="flex justify-end w-full">
					<Button variant="outline" size="sm" @click="showAttachFileModal = false">Done</Button>
				</div>
			</template>
		</EModal>

		<!-- Create modals — UModal teleports to body, escapes the slide-over's
		     transformed container. -->
		<InvoicesFormModal
			v-if="project"
			v-model="showCreateInvoiceModal"
			:defaults="invoiceDefaults"
			@created="onInvoiceCreated"
		/>
		<ClientOnly>
			<SchedulerUnifiedEventModal
				v-if="project"
				v-model="showCreateMeetingModal"
				:default-video="true"
				:project-id="projectId"
				@created="onMeetingCreated"
				@saved="onMeetingCreated"
			/>
		</ClientOnly>

		<!-- Documents create modals. Neither ProposalsFormModal nor
		     ContractsFormModal accepts a project pre-fill today (the forms
		     have no project picker), so they open unscoped — the user picks
		     the lead/contact and the list re-scopes on refresh. Once a UI
		     for attach-to-project lands, the new row will appear under the
		     correct project via the proposals.project / contracts.project
		     FK once set. -->
		<ProposalsFormModal
			v-if="project"
			v-model="showCreateProposalModal"
			@created="onProposalCreated"
		/>
		<ContractsFormModal
			v-if="project"
			v-model="showCreateContractModal"
			@created="onContractCreated"
		/>

		<!-- Attach Existing modals — project-parented. -->
		<AppsWorkAttachExistingModal
			v-if="project"
			v-model="showAttachTicketModal"
			:project-id="projectId"
			collection="tickets"
			entity-singular="Ticket"
			entity-plural="tickets"
			fk-field="project"
			row-icon="lucide:ticket"
			:fields="['id', 'title', 'status', 'priority', 'due_date', 'project.id', 'project.title']"
			:get-label="(r) => r.title"
			:get-subtitle="(r) => [r.status, r.priority].filter(Boolean).join(' · ')"
			:get-current-project-name="(r) => r.project && r.project.title"
			:get-search-haystack="(r) => `${r.title || ''} ${r.status || ''}`"
			@attached="onTicketAttached"
		/>
		<AppsWorkAttachExistingModal
			v-if="project"
			v-model="showAttachTaskModal"
			:project-id="projectId"
			collection="tasks"
			entity-singular="Task"
			entity-plural="tasks"
			fk-field="project_id"
			row-icon="lucide:check-square"
			:fields="['id', 'title', 'status', 'priority', 'due_date', 'project_id.id', 'project_id.title']"
			:build-org-filter="(orgId) => ({ organization_id: { _eq: orgId } })"
			:get-label="(r) => r.title"
			:get-subtitle="(r) => [r.status, r.priority].filter(Boolean).join(' · ')"
			:get-current-project-name="(r) => r.project_id && r.project_id.title"
			:get-search-haystack="(r) => `${r.title || ''} ${r.status || ''}`"
			@attached="onTaskAttached"
		/>
		<AppsWorkAttachExistingModal
			v-if="project"
			v-model="showAttachInvoiceModal"
			:project-id="projectId"
			collection="invoices"
			entity-singular="Invoice"
			entity-plural="invoices"
			row-icon="lucide:file-text"
			:fields="['id', 'invoice_code', 'status', 'total_amount', 'invoice_date', 'projects.projects_id', 'client.id', 'client.name']"
			:build-org-filter="(orgId) => ({ client: { organization: { _eq: orgId } } })"
			:build-exclude-attached="(pid) => ({ projects: { _none: { projects_id: { _eq: pid } } } })"
			:custom-attach="attachInvoiceCustom"
			:get-label="(r) => r.invoice_code || `Invoice ${String(r.id).slice(0, 8)}`"
			:get-subtitle="(r) => [r.status, r.total_amount != null && fmtCurrency(r.total_amount)].filter(Boolean).join(' · ')"
			:get-current-project-name="() => null"
			:get-search-haystack="(r) => `${r.invoice_code || ''} ${r.status || ''}`"
			@attached="onInvoiceAttached"
		/>
		<AppsWorkAttachExistingModal
			v-if="project"
			v-model="showAttachChannelModal"
			:project-id="projectId"
			collection="channels"
			entity-singular="Channel"
			entity-plural="channels"
			fk-field="project"
			row-icon="lucide:message-square"
			:fields="['id', 'name', 'date_created', 'project.id', 'project.title', 'ticket.title']"
			:get-label="(r) => '#' + (r.name || '')"
			:get-subtitle="(r) => r.ticket && r.ticket.title || null"
			:get-current-project-name="(r) => r.project && r.project.title"
			:get-search-haystack="(r) => r.name || ''"
			@attached="onChannelAttached"
		/>

		<!-- Attach existing proposal / contract — sets the doc's `project` FK
		     (now that proposals.project / contracts.project exist). Surfaces
		     unlinked docs and those on other projects. -->
		<AppsWorkAttachExistingModal
			v-if="project"
			v-model="showAttachProposalModal"
			:project-id="projectId"
			collection="proposals"
			entity-singular="Proposal"
			entity-plural="proposals"
			fk-field="project"
			row-icon="lucide:file-text"
			:fields="['id', 'title', 'proposal_status', 'total_value', 'date_created', 'project.id', 'project.title']"
			:build-org-filter="(orgId) => ({ organization: { _eq: orgId } })"
			:get-label="(r) => r.title || 'Untitled proposal'"
			:get-subtitle="(r) => [r.proposal_status, r.total_value != null && fmtCurrency(r.total_value)].filter(Boolean).join(' · ')"
			:get-current-project-name="(r) => r.project && r.project.title"
			:get-search-haystack="(r) => `${r.title || ''} ${r.proposal_status || ''}`"
			@attached="onProposalAttached"
		/>
		<AppsWorkAttachExistingModal
			v-if="project"
			v-model="showAttachContractModal"
			:project-id="projectId"
			collection="contracts"
			entity-singular="Contract"
			entity-plural="contracts"
			fk-field="project"
			row-icon="lucide:file-signature"
			:fields="['id', 'title', 'contract_status', 'total_value', 'date_created', 'project.id', 'project.title']"
			:build-org-filter="(orgId) => ({ organization: { _eq: orgId } })"
			:get-label="(r) => r.title || 'Untitled contract'"
			:get-subtitle="(r) => [r.contract_status, r.total_value != null && fmtCurrency(r.total_value)].filter(Boolean).join(' · ')"
			:get-current-project-name="(r) => r.project && r.project.title"
			:get-search-haystack="(r) => `${r.title || ''} ${r.contract_status || ''}`"
			@attached="onContractAttached"
		/>

		<!-- Contacts: create + attach. ContactsFormModal handles writing
		     clients_contacts when client-id is supplied; we wrap @created to
		     also write the projects_contacts junction row. -->
		<ContactsFormModal
			v-if="project"
			v-model="showCreateContactModal"
			:client-id="clientId || undefined"
			@created="onContactCreatedFromProject"
		/>
		<AppsWorkAttachContactToProjectModal
			v-if="project"
			v-model="showAttachContactModal"
			:project-id="projectId"
			:organization-id="organizationId || undefined"
			:client-id="clientId || undefined"
			:already-attached-ids="directProjectContactsOrdered.map((r) => r.contact?.id).filter(Boolean)"
			@attached="onContactAttachedToProject"
		/>
	</div>
</template>

<style scoped>
.project-workspace {
	display: flex;
	flex-direction: column;
}
</style>

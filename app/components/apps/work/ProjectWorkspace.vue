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

// Director's Office — convene a focused meeting scoped to just this project.
const { open: openDirectorOffice } = useDirectorOffice();
function conveneMeeting() {
	openDirectorOffice({
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
const projectsContactsApi = useDirectusItems('projects_contacts');
const contactItemsApi = useDirectusItems('contacts');

const project = ref<any | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const activeTab = ref<ProjectTabKey>(props.initialTab || 'activity');

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
const files = ref<any[]>([]);
const filesLoading = ref(false);

// Contacts tab — backed by the `projects_contacts` junction (created by
// scripts/setup-projects-contacts-junction.ts). Each row holds a sort key on
// the junction itself so the same contact can be pinned to multiple projects
// with different orderings.
const projectContactRows = ref<any[]>([]);  // raw junction rows w/ contact nested
const directProjectContactsOrdered = ref<any[]>([]); // ordered for drag-reorder
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
	documents: documentsProposalCount.value + documentsContractCount.value,
	contacts: projectContactCount.value,
	files: files.value.length,
}));

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
		case 'files':    if (!files.value.length && !filesLoading.value) loadFiles(); break;
		// 'activity' (ProjectsActivityTimeline) + 'documents' (Money*List)
		// self-fetch; nothing to warm here.
	}
}

watch(activeTab, (next) => {
	emit('tab-change', next);
	loadForTab(next);
});

async function loadProject() {
	loading.value = true;
	error.value = null;
	try {
		const p = await projectItemsApi.get(props.projectId, {
			fields: [
				'id', 'title', 'status', 'description', 'contract_value',
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
		taskCount.value = await taskItemsApi.count({
			_or: [
				{ project_id: { _eq: props.projectId } },
				{ project_event_id: { project: { _eq: props.projectId } } },
			],
		}).catch(() => 0);
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

async function loadProjectContacts() {
	contactsLoading.value = true;
	try {
		const rows = await projectsContactsApi.list({
			fields: PROJECT_CONTACT_FIELDS,
			filter: { project: { _eq: props.projectId } },
			sort: ['sort'],
			limit: -1,
		}).catch(() => []) as any[];
		projectContactRows.value = rows;
		// Order by junction `sort`; rows missing a sort fall to the end and
		// sub-sort alphabetically so first-load looks tidy.
		const ordered = [...rows];
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
		projectContactCount.value = rows.length;
		contactsLoaded.value = true;
	} finally {
		contactsLoading.value = false;
	}
}

async function refreshProjectContactCount() {
	try {
		projectContactCount.value = await projectsContactsApi
			.count({ project: { _eq: props.projectId } })
			.catch(() => 0);
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
const contactSlide = useAppSlideOver('contact');
function openContactSlideOver(id: string) {
	contactSlide.open(id);
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
// Ticket/task creation is owned by the embedded TicketsBoard /
// TasksBoard / TasksListView components (each ships its own + button),
// so the workspace only adds Attach Existing affordances for those.
const showAttachTicketModal = ref(false);
const showAttachTaskModal = ref(false);
const showCreateInvoiceModal = ref(false);
const showAttachInvoiceModal = ref(false);
const showAttachChannelModal = ref(false);
const showCreateMeetingModal = ref(false);
const showCreateProposalModal = ref(false);
const showCreateContractModal = ref(false);
const showCreateContactModal = ref(false);
const showAttachContactModal = ref(false);

function onTicketAttached() {
	showAttachTicketModal.value = false;
	refreshTicketCount();
}
function onTaskAttached() {
	showAttachTaskModal.value = false;
	refreshTaskCount();
}
function onInvoiceCreated() {
	showCreateInvoiceModal.value = false;
	loadInvoices();
}
function onInvoiceAttached() {
	showAttachInvoiceModal.value = false;
	loadInvoices();
}
function onChannelAttached() {
	showAttachChannelModal.value = false;
	loadChannels();
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
				v-if="!compact"
				:project="project"
				size="sm"
				class="mb-5"
				@update="patchProject"
			>
				<template #actions>
					<!-- Convene a focused Director's Office meeting on just this
					     project — same overlay as the org-wide command center,
					     scoped to this entity. -->
					<button
						type="button"
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground text-background text-[12px] font-medium ios-press shrink-0"
						@click="conveneMeeting"
					>
						<UIcon name="i-lucide-presentation" class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">Convene a meeting</span>
					</button>
					<slot name="actions" />
				</template>
			</AppsWorkProjectIdentityStrip>

			<AppsWorkProjectTabsBar
				v-model="activeTab"
				:counts="tabCounts"
				class="mb-5"
				@prefetch="loadForTab"
			/>

			<!-- Client satisfaction (set from the portal when the project completes) -->
			<CsatBadge
				v-if="project.csat_rating"
				:rating="project.csat_rating"
				:comment="project.csat_comment"
				:submitted-at="project.csat_submitted_at"
				class="mb-4"
			/>

			<div class="ios-card p-4 sm:p-6">
				<!-- Activity -->
				<div v-if="activeTab === 'activity'">
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

				<!-- Tickets — TicketsBoard ships its own "New Ticket" button,
				     so the workspace adds only the Attach Existing affordance. -->
				<div v-else-if="activeTab === 'tickets'">
					<div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
						<p class="text-xs text-muted-foreground">All tickets opened for this project.</p>
						<button
							type="button"
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
							@click="showAttachTicketModal = true"
						>
							<Icon name="lucide:link" class="w-3 h-3" />
							Attach Existing
						</button>
					</div>

					<TicketsBoard :projectId="projectId" :organizationId="organizationId" />
				</div>

				<!-- Channels -->
				<div v-else-if="activeTab === 'channels'">
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
					<div v-if="channelsLoading && !channels.length" class="space-y-px" aria-busy="true" aria-label="Loading channels">
						<div
							v-for="i in skeletonRows(channels.length)"
							:key="`ch-skel-${i}`"
							class="flex items-center gap-3 h-12 px-3 border-b border-border/30 last:border-b-0"
						>
							<span class="text-muted-foreground/40 text-sm shrink-0">#</span>
							<USkeleton class="h-3.5 flex-1 max-w-[35%]" />
							<USkeleton class="h-3.5 w-32 hidden md:block" />
						</div>
					</div>
					<div v-else-if="!channels.length" class="text-sm text-muted-foreground text-center py-10">
						No channels tagged to this project.
					</div>
					<div v-else class="space-y-px">
						<NuxtLink
							v-for="channel in channels"
							:key="channel.id"
							:to="`/channels/${channel.name}`"
							class="flex items-center gap-3 h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors group"
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
						</NuxtLink>
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
							<USkeleton class="w-9 h-9 rounded-xl shrink-0" />
							<div class="flex-1 space-y-2">
								<div class="flex items-start justify-between gap-2">
									<USkeleton class="h-3.5 flex-1 max-w-[60%]" />
									<USkeleton class="h-4 w-20 rounded-full shrink-0" />
								</div>
								<div class="flex gap-3">
									<USkeleton class="h-3 w-28" />
									<USkeleton class="h-3 w-12" />
								</div>
							</div>
						</div>
					</div>
					<div v-else-if="!meetings.length" class="text-sm text-muted-foreground text-center py-10">
						No meetings linked to this project yet.
					</div>
					<div v-else class="space-y-2">
						<NuxtLink
							v-for="m in meetings"
							:key="m.id"
							:to="`/meetings/${m.id}`"
							class="ios-card block px-4 py-3 hover:bg-muted/30 transition-colors"
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
						</NuxtLink>
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
							<USkeleton class="h-3.5 w-24" />
							<USkeleton class="h-3.5 flex-1 max-w-[20%]" />
							<USkeleton class="h-4 w-16" />
							<USkeleton class="h-4 w-14 rounded-full" />
						</div>
					</div>
					<div v-else-if="!invoices.length" class="text-sm text-muted-foreground text-center py-10">
						No invoices on this project yet.
					</div>
					<div v-else class="space-y-px">
						<NuxtLink
							v-for="inv in invoices"
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
								class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 capitalize bg-muted/40"
							>{{ inv.status }}</span>
							<Icon name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
						</NuxtLink>
					</div>
				</div>

				<!-- Documents (proposals + contracts) — scoped to this project via
				     the proposals.project / contracts.project FK added by
				     scripts/setup-doc-project-fk.ts. Empty state until rows are
				     linked. Mirrors ClientWorkspace Documents tab. -->
				<div v-else-if="activeTab === 'documents'" class="space-y-6">
					<section>
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-2">
								<Icon name="lucide:file-text" class="w-4 h-4 text-muted-foreground" />
								<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Proposals
								</h4>
								<span class="text-[10px] text-muted-foreground/70">{{ documentsProposalCount }}</span>
							</div>
							<button
								type="button"
								class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
								@click="showCreateProposalModal = true"
							>
								<Icon name="lucide:plus" class="w-3 h-3" />
								New Proposal
							</button>
						</div>
						<MoneyProposalsList
							ref="documentsProposalsRef"
							:project-id="projectId"
							@count="documentsProposalCount = $event"
						/>
					</section>

					<section>
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-2">
								<Icon name="lucide:file-signature" class="w-4 h-4 text-muted-foreground" />
								<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Contracts
								</h4>
								<span class="text-[10px] text-muted-foreground/70">{{ documentsContractCount }}</span>
							</div>
							<button
								type="button"
								class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
								@click="showCreateContractModal = true"
							>
								<Icon name="lucide:plus" class="w-3 h-3" />
								New Contract
							</button>
						</div>
						<MoneyContractsList
							ref="documentsContractsRef"
							:project-id="projectId"
							@count="documentsContractCount = $event"
						/>
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

					<div v-if="contactsLoading && !directProjectContactsOrdered.length" class="space-y-px" aria-busy="true" aria-label="Loading contacts">
						<div
							v-for="i in skeletonRows(projectContactCount)"
							:key="`pc-skel-${i}`"
							class="flex items-center gap-3 h-12 px-3 border-b border-border/30 last:border-b-0"
						>
							<span class="w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
							<USkeleton class="h-3.5 flex-1 max-w-[40%]" />
						</div>
					</div>

					<div v-else-if="!directProjectContactsOrdered.length" class="text-sm text-muted-foreground text-center py-10">
						No contacts pinned to this project yet.
						<span v-if="(project as any)?.client?.name" class="block mt-1 text-xs">
							Client roster lives on
							<NuxtLink :to="`/apps/clients/${(project as any).client.id}`" class="text-primary hover:underline">
								{{ (project as any).client.name }}
							</NuxtLink>.
						</span>
					</div>

					<VueDraggable
						v-else
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
				</div>

				<!-- Files -->
				<div v-else-if="activeTab === 'files'">
					<div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
						<p class="text-xs text-muted-foreground">Files attached to this project.</p>
						<button
							class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all disabled:opacity-50"
							:disabled="uploadingFile"
							@click="triggerFileUpload"
						>
							<Icon :name="uploadingFile ? 'lucide:loader-2' : 'lucide:upload'" :class="['w-3.5 h-3.5', uploadingFile && 'animate-spin']" />
							{{ uploadingFile ? 'Uploading…' : 'Upload' }}
						</button>
						<input ref="fileInputRef" type="file" multiple class="hidden" @change="onFileInputChange" />
					</div>

					<div
						class="rounded-2xl border-2 border-dashed transition-colors"
						:class="isDraggingFile ? 'border-primary bg-primary/5 p-2' : 'border-transparent'"
						@dragover.prevent="isDraggingFile = true"
						@dragleave.prevent="isDraggingFile = false"
						@drop.prevent="onFileDrop"
					>
						<div v-if="filesLoading && !files.length" class="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-busy="true" aria-label="Loading files">
							<div
								v-for="i in skeletonRows(files.length, 4, 6)"
								:key="`file-skel-${i}`"
								class="ios-card p-3 flex items-center gap-3"
							>
								<USkeleton class="w-4 h-4 shrink-0" />
								<div class="flex-1 space-y-1.5">
									<USkeleton class="h-3.5 w-3/4" />
									<USkeleton class="h-2.5 w-20" />
								</div>
							</div>
						</div>
						<button
							v-else-if="!files.length"
							type="button"
							class="w-full text-sm text-muted-foreground text-center py-10 hover:text-foreground transition-colors"
							@click="triggerFileUpload"
						>
							Drag files here or click to upload documents.
						</button>
						<div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
							<a
								v-for="doc in files"
								:key="doc.id"
								:href="`${config.public.directusUrl}/assets/${doc.directus_files_id?.id}`"
								target="_blank"
								rel="noopener"
								class="ios-card p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
							>
								<Icon :name="getFileIcon(doc.directus_files_id?.type)" class="w-4 h-4 text-muted-foreground flex-shrink-0" />
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-foreground truncate">{{ doc.directus_files_id?.title || doc.directus_files_id?.filename_download }}</p>
									<div class="flex items-center gap-2 mt-0.5">
										<span class="text-[10px] text-muted-foreground">{{ formatFileSize(doc.directus_files_id?.filesize) }}</span>
										<span v-if="doc.directus_files_id?.uploaded_on" class="text-[10px] text-muted-foreground">
											{{ fmtDate(doc.directus_files_id.uploaded_on) }}
										</span>
									</div>
								</div>
								<Icon name="lucide:download" class="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
							</a>
						</div>
					</div>
				</div>

			</div>
		</template>

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

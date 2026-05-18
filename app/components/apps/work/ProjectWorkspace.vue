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
    - Heavy editors: full Gantt (project_events), time-block editor,
      file drag-drop upload — kept on the legacy /projects/[id] page
      with a CTA from the workspace.
-->
<script setup lang="ts">
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

const config = useRuntimeConfig();
const { selectedOrg } = useOrganization();

const projectItemsApi = useDirectusItems('projects');
const taskItemsApi = useDirectusItems('project_tasks');
const ticketItemsApi = useDirectusItems('tickets');
const channelItemsApi = useDirectusItems('channels');
const meetingItemsApi = useDirectusItems('video_meetings');
const invoiceItemsApi = useDirectusItems('invoices');
const projectFilesItemsApi = useDirectusItems('projects_files');

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

watch(activeTab, (next) => {
	emit('tab-change', next);
	if (next === 'tasks' && taskCount.value === 0) refreshTaskCount();
	if (next === 'tickets' && ticketCount.value === 0) refreshTicketCount();
	if (next === 'channels' && !channels.value.length && !channelsLoading.value) loadChannels();
	if (next === 'meetings' && !meetings.value.length && !meetingsLoading.value) loadMeetings();
	if (next === 'invoices' && !invoices.value.length && !invoicesLoading.value) loadInvoices();
	if (next === 'files' && !files.value.length && !filesLoading.value) loadFiles();
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
	} catch (e: any) {
		error.value = e?.message || 'Failed to load project';
	} finally {
		loading.value = false;
	}
}

async function refreshTaskCount() {
	try {
		const rows = await taskItemsApi.list({
			fields: ['id'],
			filter: {
				_or: [
					{ project: { _eq: props.projectId } },
					{ event_id: { project: { _eq: props.projectId } } },
				],
			},
			limit: -1,
		}).catch(() => [] as any[]);
		taskCount.value = (rows as any[]).length;
	} catch {
		taskCount.value = 0;
	}
}

async function refreshTicketCount() {
	try {
		const rows = await ticketItemsApi.list({
			fields: ['id'],
			filter: { project: { _eq: props.projectId } },
			limit: -1,
		}).catch(() => [] as any[]);
		ticketCount.value = (rows as any[]).length;
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

async function loadFiles() {
	filesLoading.value = true;
	try {
		files.value = await projectFilesItemsApi.list({
			fields: [
				'id',
				'directus_files_id.id',
				'directus_files_id.title',
				'directus_files_id.filename_download',
				'directus_files_id.type',
				'directus_files_id.filesize',
				'directus_files_id.uploaded_on',
			],
			filter: { projects_id: { _eq: props.projectId } },
			sort: ['-directus_files_id.uploaded_on'],
			limit: -1,
		}).catch(() => []) as any[];
	} finally {
		filesLoading.value = false;
	}
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
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
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
			>
				<template v-if="$slots.actions" #actions>
					<slot name="actions" />
				</template>
			</AppsWorkProjectIdentityStrip>

			<AppsWorkProjectTabsBar
				v-model="activeTab"
				:counts="tabCounts"
				class="mb-5"
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
					<div v-if="channelsLoading && !channels.length" class="text-sm text-muted-foreground text-center py-10">
						Loading channels…
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
					<div v-if="meetingsLoading && !meetings.length" class="text-sm text-muted-foreground text-center py-10">
						Loading meetings…
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
					<div v-if="invoicesLoading && !invoices.length" class="text-sm text-muted-foreground text-center py-10">
						Loading invoices…
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

				<!-- Files -->
				<div v-else-if="activeTab === 'files'">
					<div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
						<p class="text-xs text-muted-foreground">
							Drag-and-drop upload lives on the
							<NuxtLink :to="`/projects/${projectId}`" class="text-primary hover:underline">full project page</NuxtLink>.
						</p>
					</div>
					<div v-if="filesLoading && !files.length" class="text-sm text-muted-foreground text-center py-10">
						Loading files…
					</div>
					<div v-else-if="!files.length" class="text-sm text-muted-foreground text-center py-10">
						No documents uploaded to this project.
					</div>
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
			collection="project_tasks"
			entity-singular="Task"
			entity-plural="tasks"
			fk-field="project"
			row-icon="lucide:check-square"
			:fields="['id', 'title', 'status', 'priority', 'due_date', 'project.id', 'project.title']"
			:build-org-filter="(orgId) => ({ organization: { _eq: orgId } })"
			:get-label="(r) => r.title"
			:get-subtitle="(r) => [r.status, r.priority].filter(Boolean).join(' · ')"
			:get-current-project-name="(r) => r.project && r.project.title"
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
	</div>
</template>

<style scoped>
.project-workspace {
	display: flex;
	flex-direction: column;
}
</style>

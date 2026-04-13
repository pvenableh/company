<script setup>
import { Button } from '~/components/ui/button';
const { params } = useRoute();
const projectItems = useDirectusItems('projects');
const ticketItems = useDirectusItems('tickets');
const taskItems = useDirectusItems('project_tasks');
const invoiceItems = useDirectusItems('invoices');
const timeEntryItems = useDirectusItems('time_entries');
const fileItems = useDirectusItems('directus_files');
const projectFilesItems = useDirectusItems('projects_files');

const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Project Details | Earnest' });

const router = useRouter();
const showEditModal = ref(false);
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const project = await projectItems.get(params.id, {
	fields: [
		'id,status,service.name,service.color,title,description,contract_value,start_date,due_date,projected_date,completion_date,organization.id,organization.name,organization.logo,client.id,client.name,events.id,events.status,events.type,events.approval,events.priority,events.hours,events.title,events.description,events.date,events.link,events.prototype_link,events.amount,events.payment_amount,events.file,assigned_to.directus_users_id.id,assigned_to.directus_users_id.first_name,assigned_to.directus_users_id.last_name,assigned_to.directus_users_id.avatar,assigned_to.directus_users_id.email,assigned_to.directus_users_id.phone',
	],
});

const items = [
	{
		slot: 'overview',
		label: 'Overview',
		icon: 'i-heroicons-squares-2x2',
	},
	{
		slot: 'conversations',
		label: 'Conversations',
		icon: 'i-heroicons-chat-bubble-left-right',
	},
	{
		slot: 'tasks',
		label: 'Tasks',
		icon: 'i-heroicons-check-circle',
	},
	{
		slot: 'tickets',
		label: 'Tickets',
		icon: 'i-heroicons-square-3-stack-3d',
	},
	{
		slot: 'time',
		label: 'Time',
		icon: 'i-heroicons-clock',
	},
	{
		slot: 'documents',
		label: 'Documents',
		icon: 'i-heroicons-document-text',
	},
	{
		slot: 'billing',
		label: 'Billing',
		icon: 'i-heroicons-credit-card',
	},
	{
		slot: 'activity',
		label: 'Activity',
		icon: 'i-heroicons-clock',
	},
];

// ── Stats ──
const stats = ref({
	ticketCount: 0,
	openTickets: 0,
	taskCount: 0,
	completedTasks: 0,
	invoiceTotal: 0,
	paidTotal: 0,
	eventCount: 0,
	pendingApprovals: 0,
});

const loadStats = async () => {
	try {
		const projectFilter = { project: { _eq: params.id } };
		const invoiceProjectFilter = { projects: { projects_id: { _eq: params.id } } };
		const [tickets, tasks, invoices] = await Promise.all([
			ticketItems.list({
				fields: ['id', 'status'],
				filter: projectFilter,
				limit: 200,
			}),
			taskItems.list({
				fields: ['id', 'completed', 'status'],
				filter: {
					_or: [
						{ project: { _eq: params.id } },
						{ event_id: { project: { _eq: params.id } } },
					],
				},
				limit: 500,
			}),
			invoiceItems.list({
				fields: ['id', 'status', 'line_items'],
				filter: invoiceProjectFilter,
				limit: 100,
			}),
		]);

		stats.value.ticketCount = tickets?.length || 0;
		stats.value.openTickets = tickets?.filter(t => t.status !== 'Completed').length || 0;
		stats.value.taskCount = tasks?.length || 0;
		stats.value.completedTasks = tasks?.filter(t => t.completed || t.status === 'done').length || 0;
		stats.value.eventCount = project?.events?.length || 0;
		stats.value.pendingApprovals = project?.events?.filter(e => e.approval === 'Need Approval').length || 0;

		// Invoice totals
		let total = 0;
		let paid = 0;
		for (const inv of (invoices || [])) {
			const lineItems = inv.line_items || [];
			const invTotal = lineItems.reduce((sum, li) => sum + ((li.quantity || 0) * (li.rate || 0)), 0);
			total += invTotal;
			if (inv.status === 'paid') paid += invTotal;
		}
		stats.value.invoiceTotal = total;
		stats.value.paidTotal = paid;
	} catch (err) {
		console.error('Error loading project stats:', err);
	}
};

onMounted(() => {
	loadStats();
	loadDocuments();
	loadInvoices();
	if (project?.id) setEntity('project', String(project.id), project.title || 'Project');
});
onUnmounted(() => clearEntity());

// ── Status styling ──
const { getStatusAccent, getStatusBadgeClasses: getProjectStatusClasses } = useStatusStyle();
const statusColor = computed(() => getStatusAccent(project?.status));

// ── Days remaining ──
const daysRemaining = computed(() => {
	if (!project?.due_date) return null;
	const now = new Date();
	const due = new Date(project.due_date);
	const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
	return diff;
});

// ── Task progress ──
const taskProgress = computed(() => {
	if (stats.value.taskCount === 0) return 0;
	return Math.round((stats.value.completedTasks / stats.value.taskCount) * 100);
});

// ── Task View Mode ──
const taskViewMode = ref('board');
const projectTeamMembers = computed(() => {
	return (project?.assigned_to || [])
		.map(a => a.directus_users_id)
		.filter(u => u && typeof u === 'object')
		.map(u => ({ id: u.id, first_name: u.first_name || '', last_name: u.last_name || '', avatar: u.avatar }));
});

// ── Quick Actions ──
const showQuickInvoice = ref(false);
const showAttachInvoice = ref(false);
const showQuickChannel = ref(false);
const savingInvoice = ref(false);
const unattachedInvoices = ref([]);
const loadingUnattached = ref(false);
const toast = useToast();

const handleInvoiceSave = async (payload) => {
	savingInvoice.value = true;
	try {
		await invoiceItems.create(payload);
		toast.add({ title: 'Invoice created', color: 'green' });
		showQuickInvoice.value = false;
		loadInvoices();
		loadStats();
	} catch (err) {
		console.error('Error creating invoice:', err);
		toast.add({ title: 'Failed to create invoice', description: err.message, color: 'red' });
	} finally {
		savingInvoice.value = false;
	}
};

const openAttachInvoice = async () => {
	showAttachInvoice.value = true;
	loadingUnattached.value = true;
	try {
		const { selectedClient } = useClients();
		const filter = {
			_and: [
				{ projects: { _none: { projects_id: { _eq: params.id } } } },
				{ status: { _nin: ['archived'] } },
			],
		};
		// Filter by selected client if one is chosen in the header
		if (selectedClient.value && selectedClient.value !== 'org') {
			filter._and.push({ client: { _eq: selectedClient.value } });
		}
		const invs = await invoiceItems.list({
			fields: ['id', 'invoice_code', 'status', 'total_amount', 'client.id', 'client.name', 'bill_to.name', 'date_created'],
			filter,
			sort: ['-date_created'],
			limit: 50,
		});
		unattachedInvoices.value = invs || [];
	} catch (err) {
		console.error('Error fetching unattached invoices:', err);
		unattachedInvoices.value = [];
	} finally {
		loadingUnattached.value = false;
	}
};

const attachInvoice = async (invoiceId) => {
	try {
		await invoiceItems.update(invoiceId, {
			projects: { create: [{ projects_id: params.id }] },
		});
		unattachedInvoices.value = unattachedInvoices.value.filter((i) => i.id !== invoiceId);
		toast.add({ title: 'Invoice attached to project', color: 'green' });
		loadInvoices();
		loadStats();
	} catch (err) {
		console.error('Error attaching invoice:', err);
		toast.add({ title: 'Failed to attach invoice', color: 'red' });
	}
};

// Defaults for new invoice form (project + client + org pre-selected)
const invoiceDefaults = computed(() => ({
	projects: [params.id],
	bill_to: project?.organization?.id || null,
	client: project?.client?.id || null,
}));

// ── Attach Time Entries ──
const showAttachTimeEntry = ref(false);
const unattachedTimeEntries = ref([]);
const loadingUnattachedEntries = ref(false);
const timeEntriesRef = ref(null);

const openAttachTimeEntry = async () => {
	showAttachTimeEntry.value = true;
	loadingUnattachedEntries.value = true;
	try {
		const { selectedClient } = useClients();
		const { selectedOrg } = useOrganization();
		const filter = {
			_and: [
				{ project: { _null: true } },
				{ status: { _eq: 'completed' } },
			],
		};
		if (selectedOrg.value) {
			filter._and.push({ organization: { _eq: selectedOrg.value } });
		}
		if (selectedClient.value && selectedClient.value !== 'org') {
			filter._and.push({ client: { _eq: selectedClient.value } });
		}
		const entries = await timeEntryItems.list({
			fields: ['id', 'description', 'duration_minutes', 'date', 'start_time', 'billable', 'hourly_rate', 'user.first_name', 'user.last_name', 'client.name'],
			filter,
			sort: ['-date', '-start_time'],
			limit: 50,
		});
		unattachedTimeEntries.value = entries || [];
	} catch (err) {
		console.error('Error fetching unattached time entries:', err);
		unattachedTimeEntries.value = [];
	} finally {
		loadingUnattachedEntries.value = false;
	}
};

const attachTimeEntry = async (entryId) => {
	try {
		await timeEntryItems.update(String(entryId), { project: params.id });
		unattachedTimeEntries.value = unattachedTimeEntries.value.filter((e) => e.id !== entryId);
		toast.add({ title: 'Time entry attached to project', color: 'green' });
		timeEntriesRef.value?.refresh?.();
		loadStats();
	} catch (err) {
		console.error('Error attaching time entry:', err);
		toast.add({ title: 'Failed to attach time entry', color: 'red' });
	}
};

const formatEntryDuration = (minutes) => {
	if (!minutes) return '0m';
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const formatEntryDate = (dateStr) => {
	if (!dateStr) return '';
	const d = new Date(dateStr);
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ── Documents ──
const documents = ref([]);
const loadingDocs = ref(false);
const uploadingDoc = ref(false);
const fileInput = ref(null);
const showAttachFile = ref(false);
const existingFiles = ref([]);
const loadingExistingFiles = ref(false);
const fileSearchQuery = ref('');

const loadDocuments = async () => {
	loadingDocs.value = true;
	try {
		const files = await projectFilesItems.list({
			fields: ['id', 'directus_files_id.id', 'directus_files_id.title', 'directus_files_id.filename_download', 'directus_files_id.type', 'directus_files_id.filesize', 'directus_files_id.uploaded_on'],
			filter: { projects_id: { _eq: params.id } },
			sort: ['-directus_files_id.uploaded_on'],
		});
		documents.value = files || [];
	} catch (err) {
		console.error('Error loading documents:', err);
		documents.value = [];
	} finally {
		loadingDocs.value = false;
	}
};

const triggerFileUpload = () => {
	fileInput.value?.click();
};

const handleFileUpload = async (event) => {
	const files = event.target.files;
	if (!files?.length) return;

	uploadingDoc.value = true;
	try {
		for (const file of files) {
			const formData = new FormData();
			formData.append('file', file);
			if (project?.title) {
				formData.append('title', `${project.title} - ${file.name}`);
			}

			// Upload file to Directus
			const config = useRuntimeConfig();
			const response = await $fetch(`${config.public.directusUrl}/files`, {
				method: 'POST',
				body: formData,
				headers: {
					Authorization: `Bearer ${useDirectusToken().value}`,
				},
			});

			if (response?.data?.id) {
				// Link file to project
				await projectFilesItems.create({
					projects_id: params.id,
					directus_files_id: response.data.id,
				});
			}
		}

		useToast().add({ title: 'Files uploaded', color: 'green' });
		await loadDocuments();
	} catch (err) {
		console.error('Error uploading file:', err);
		useToast().add({ title: 'Upload failed', description: err.message, color: 'red' });
	} finally {
		uploadingDoc.value = false;
		if (fileInput.value) fileInput.value.value = '';
	}
};

const getFileIcon = (type) => {
	if (!type) return 'i-heroicons-document';
	if (type.startsWith('image/')) return 'i-heroicons-photo';
	if (type.includes('pdf')) return 'i-heroicons-document-text';
	if (type.includes('spreadsheet') || type.includes('excel')) return 'i-heroicons-table-cells';
	if (type.includes('presentation') || type.includes('powerpoint')) return 'i-heroicons-presentation-chart-bar';
	return 'i-heroicons-document';
};

const formatFileSize = (bytes) => {
	if (!bytes) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1048576).toFixed(1)} MB`;
};

const openAttachFile = async () => {
	showAttachFile.value = true;
	fileSearchQuery.value = '';
	loadingExistingFiles.value = true;
	try {
		// Get IDs of files already linked to this project
		const linkedIds = documents.value.map((d) => d.directus_files_id?.id).filter(Boolean);

		const filter = { _and: [] };
		// Exclude already-linked files
		if (linkedIds.length > 0) {
			filter._and.push({ id: { _nin: linkedIds } });
		}
		// Only show common document types
		filter._and.push({
			type: { _nin: ['application/octet-stream'] },
		});

		const files = await fileItems.list({
			fields: ['id', 'title', 'filename_download', 'type', 'filesize', 'uploaded_on'],
			filter: filter._and.length > 0 ? filter : undefined,
			sort: ['-uploaded_on'],
			limit: 50,
		});
		existingFiles.value = files || [];
	} catch (err) {
		console.error('Error fetching existing files:', err);
		existingFiles.value = [];
	} finally {
		loadingExistingFiles.value = false;
	}
};

const filteredExistingFiles = computed(() => {
	if (!fileSearchQuery.value.trim()) return existingFiles.value;
	const q = fileSearchQuery.value.toLowerCase();
	return existingFiles.value.filter((f) =>
		(f.title || f.filename_download || '').toLowerCase().includes(q)
	);
});

const attachFile = async (fileId) => {
	try {
		await projectFilesItems.create({
			projects_id: params.id,
			directus_files_id: fileId,
		});
		existingFiles.value = existingFiles.value.filter((f) => f.id !== fileId);
		toast.add({ title: 'File attached to project', color: 'green' });
		loadDocuments();
	} catch (err) {
		console.error('Error attaching file:', err);
		toast.add({ title: 'Failed to attach file', color: 'red' });
	}
};

// ── Activity for this project ──
const activityItems_d = useDirectusItems('directus_activity');
const projectActivity = ref([]);
const loadingActivity = ref(false);

const loadActivity = async () => {
	loadingActivity.value = true;
	try {
		// Get ticket and task IDs for this project to scope activity
		const [projTickets, projTasks] = await Promise.all([
			ticketItems.list({ fields: ['id'], filter: { project: { _eq: params.id } }, limit: 200 }),
			taskItems.list({ fields: ['id'], filter: { project: { _eq: params.id } }, limit: 200 }),
		]);
		const ticketIds = (projTickets || []).map((t) => t.id);
		const taskIds = (projTasks || []).map((t) => t.id);

		const orFilters = [
			{ _and: [{ collection: { _eq: 'projects' } }, { item: { _eq: params.id } }] },
		];
		if (ticketIds.length > 0) {
			orFilters.push({ _and: [{ collection: { _eq: 'tickets' } }, { item: { _in: ticketIds } }] });
		}
		if (taskIds.length > 0) {
			orFilters.push({ _and: [{ collection: { _eq: 'project_tasks' } }, { item: { _in: taskIds } }] });
		}

		const activities = await activityItems_d.list({
			fields: [
				'id', 'action', 'timestamp', 'collection', 'item',
				'user.id', 'user.first_name', 'user.last_name', 'user.avatar',
			],
			filter: { _or: orFilters },
			sort: ['-timestamp'],
			limit: 50,
		});
		projectActivity.value = activities || [];
	} catch (err) {
		console.error('Error loading project activity:', err);
	} finally {
		loadingActivity.value = false;
	}
};

// Uses getFriendlyDate from utils/dates.ts
const formatActivityDate = (ts) => getFriendlyDate(ts);

const activityActionLabel = (action) => {
	const labels = { create: 'Created', update: 'Updated', delete: 'Deleted' };
	return labels[action] || action;
};

const activityCollectionLabel = (col) => {
	const labels = { projects: 'project', tickets: 'ticket', project_tasks: 'task', invoices: 'invoice' };
	return labels[col] || col;
};

// ── Invoices for this project ──
const projectInvoices = ref([]);
const loadingInvoices = ref(false);

const loadInvoices = async () => {
	loadingInvoices.value = true;
	try {
		const invs = await invoiceItems.list({
			fields: ['id', 'invoice_code', 'status', 'invoice_date', 'due_date', 'total_amount', 'client.id', 'client.name', 'bill_to.name'],
			filter: { projects: { projects_id: { _eq: params.id } } },
			sort: ['-date_created'],
		});
		projectInvoices.value = invs || [];
	} catch (err) {
		console.error('Error loading invoices:', err);
	} finally {
		loadingInvoices.value = false;
	}
};

const getInvoiceTotal = (inv) => {
	return parseFloat(inv.total_amount) || 0;
};

// ── Refresh ──
async function refreshProject() {
	try {
		const updated = await projectItems.get(params.id, {
			fields: [
				'id,status,service.id,service.name,service.color,title,description,contract_value,start_date,due_date,projected_date,completion_date,organization.id,organization.name,organization.logo,client.id,client.name,url,template,events.id,events.status,events.type,events.approval,events.priority,events.hours,events.title,events.description,events.date,events.link,events.prototype_link,events.amount,events.payment_amount,events.file,assigned_to.directus_users_id.id,assigned_to.directus_users_id.first_name,assigned_to.directus_users_id.last_name,assigned_to.directus_users_id.avatar,assigned_to.directus_users_id.email,assigned_to.directus_users_id.phone',
			],
		});
		Object.assign(project, updated);
		loadStats();
		toast.add({ title: 'Project updated', color: 'green' });
	} catch (err) {
		console.error('Error refreshing project:', err);
		toast.add({ title: 'Failed to refresh project', color: 'red' });
	}
}

function handleDeleted() {
	router.replace('/projects');
}

// Format currency
const formatCurrency = (amount) => {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
};
</script>
<template>
	<div class="page__content">
		<div class="max-w-screen-xl mx-auto page_inner px-4 2xl:px-0">
			<!-- Back link -->
			<NuxtLink
				to="/projects"
				class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
			>
				<Icon name="lucide:chevron-left" class="w-3 h-3" />
				Projects
			</NuxtLink>

			<!-- Header -->
			<div class="flex items-start sm:items-center justify-between mb-4 gap-2">
				<div class="min-w-0">
					<div class="sm:hidden mb-1">
						<UiStatusBadge :status="project?.status" />
					</div>
					<div class="flex items-center gap-2">
						<h1 class="text-sm sm:text-base font-semibold text-foreground" style="line-height: 1.1">{{ project?.title || 'Project' }}</h1>
						<div class="hidden sm:block shrink-0">
							<UiStatusBadge :status="project?.status" />
						</div>
					</div>
					<div class="flex items-center gap-1.5 mt-0.5">
						<span v-if="project?.service" class="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
							<span class="h-2 w-2 inline-block rounded-full" :style="{ backgroundColor: project.service.color }" />
							{{ project.service.name }}
						</span>
						<span v-if="project?.service && (project?.client?.name || project?.organization?.name)" class="text-muted-foreground/40">·</span>
						<span v-if="project?.client?.name || project?.organization?.name" class="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
							<Icon name="lucide:building-2" class="w-3 h-3" />
							{{ project?.client?.name || project?.organization?.name }}
						</span>
					</div>
				</div>
				<div class="flex items-center gap-1.5">
					<button
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
						@click="sidebarOpen = true"
					>
						<Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">Ask Earnest</span>
					</button>
					<button
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
						@click="showEditModal = true"
					>
						<Icon name="lucide:pencil" class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">Edit</span>
					</button>
				</div>
			</div>

			<!-- AI Notices -->
			<ClientOnly>
				<AIProactiveNotices v-if="project?.id" entity-type="project" :entity-id="String(project.id)" />
			</ClientOnly>

			<!-- Edit Project Modal -->
			<ClientOnly>
				<ProjectsFormModal v-model="showEditModal" :project="project" @updated="refreshProject" @deleted="handleDeleted" />
			</ClientOnly>

			<!-- Stats Row -->
			<div class="grid grid-cols-5 gap-2 md:gap-3 mb-8">
				<UiStatCard label="Tickets" :value="stats.openTickets" :detail="`${stats.ticketCount} total`" />

				<div class="cg-card-compact">
					<p class="cg-text-label mb-1">Tasks</p>
					<p class="cg-text-stat text-foreground">{{ stats.completedTasks }}/{{ stats.taskCount }}</p>
					<div class="mt-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
						<div class="h-full rounded-full bg-purple-500 transition-all duration-500" :style="{ width: `${taskProgress}%` }" />
					</div>
				</div>

				<UiStatCard label="Events" :value="stats.eventCount">
					<template #detail>
						<span v-if="stats.pendingApprovals > 0" class="text-amber-500 font-medium">{{ stats.pendingApprovals }} pending</span>
						<span v-else>phases</span>
					</template>
				</UiStatCard>

				<UiStatCard label="Billed" :value="formatCurrency(stats.invoiceTotal)" :detail="`${formatCurrency(stats.paidTotal)} paid`" />

				<div class="cg-card-compact">
					<p class="cg-text-label mb-1">Timeline</p>
					<p v-if="daysRemaining !== null" class="cg-text-stat text-foreground" :class="{ 'text-destructive': daysRemaining < 0 }">
						{{ daysRemaining < 0 ? Math.abs(daysRemaining) : daysRemaining }}
					</p>
					<p v-else class="cg-text-stat text-muted-foreground/40">—</p>
					<p class="cg-text-child text-muted-foreground mt-0.5">{{ daysRemaining !== null ? (daysRemaining < 0 ? 'overdue' : 'days left') : 'no date' }}</p>
				</div>
			</div>

			<!-- Team Management -->
			<div v-if="project?.id" class="mb-6">
				<ProjectsTeamManager :project-id="String(project.id)" @updated="refreshProject" />
			</div>

			<!-- Tabs -->
			<UTabs
				:items="items"
				class="w-full"
			>
				<template #overview="{ item }">
					<ProjectsOverview :project="project" @eventCreated="refreshProject" />
				</template>
				<template #conversations="{ item }">
					<ProjectsConversations :project="project" />
				</template>
				<template #tasks="{ item }">
					<div class="py-6">
						<!-- View Toggle -->
						<div class="flex items-center justify-between mb-4 px-1">
							<div class="flex gap-0.5 p-0.5 bg-muted/40 rounded-lg">
								<button
									class="px-3 py-1 text-[10px] font-medium rounded-md transition-all"
									:class="taskViewMode === 'board' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
									@click="taskViewMode = 'board'"
								>
									<Icon name="lucide:columns-3" class="w-3.5 h-3.5 inline mr-1" />Board
								</button>
								<button
									class="px-3 py-1 text-[10px] font-medium rounded-md transition-all"
									:class="taskViewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
									@click="taskViewMode = 'list'"
								>
									<Icon name="lucide:list" class="w-3.5 h-3.5 inline mr-1" />List
								</button>
							</div>
						</div>
						<TasksBoard
							v-if="taskViewMode === 'board'"
							:project-id="project.id"
							:organization-id="project.organization?.id"
							:team-members="projectTeamMembers"
							@stats-changed="loadStats"
						/>
						<TasksListView
							v-else
							:project-id="project.id"
							:organization-id="project.organization?.id"
							:team-members="projectTeamMembers"
							@stats-changed="loadStats"
						/>
					</div>
				</template>
				<template #tickets="{ item }">
					<TicketsBoard :projectId="project.id" :organizationId="project.organization?.id" />
				</template>
				<template #activity="{ item }">
					<div class="w-full py-6">
						<ProjectsActivityTimeline :project-id="params.id" />
					</div>
				</template>
				<template #time="{ item }">
					<div class="w-full">
						<!-- Attach Existing button above time entries -->
						<div class="flex justify-end px-1 mb-2">
							<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="openAttachTimeEntry">
								<UIcon name="i-heroicons-link" class="h-3 w-3 mr-1" />
								Attach Existing
							</Button>
						</div>
						<ProjectsTimeEntries ref="timeEntriesRef" :project-id="params.id" :client-id="project?.client?.id" />
					</div>

					<!-- Attach Existing Time Entry Modal -->
					<ClientOnly>
						<UModal v-model="showAttachTimeEntry">
							<div class="p-6">
								<h3 class="text-lg font-semibold mb-4">Attach Existing Time Entry</h3>

								<div v-if="loadingUnattachedEntries" class="space-y-2 py-4">
									<div v-for="n in 3" :key="n" class="h-14 bg-muted rounded-xl animate-pulse" />
								</div>

								<div v-else-if="unattachedTimeEntries.length === 0" class="text-center py-8 text-muted-foreground">
									<UIcon name="i-heroicons-clock" class="w-8 h-8 mx-auto mb-2 opacity-40" />
									<p class="text-sm">No unattached time entries found.</p>
								</div>

								<div v-else class="space-y-2 max-h-[60vh] overflow-y-auto">
									<div
										v-for="entry in unattachedTimeEntries"
										:key="entry.id"
										class="ios-card p-3 flex items-center justify-between"
									>
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2 mb-0.5">
												<span class="text-xs font-semibold text-foreground tabular-nums">{{ formatEntryDuration(entry.duration_minutes) }}</span>
												<span v-if="entry.date" class="text-[10px] text-muted-foreground">{{ formatEntryDate(entry.date) }}</span>
												<span v-if="entry.billable" class="text-[10px] text-emerald-600 font-medium">$</span>
											</div>
											<p class="text-xs text-foreground truncate">{{ entry.description || 'No description' }}</p>
											<p class="text-[10px] text-muted-foreground">
												{{ entry.user?.first_name }} {{ entry.user?.last_name }}
												<span v-if="entry.client?.name"> &middot; {{ entry.client.name }}</span>
											</p>
										</div>
										<UButton
											icon="i-heroicons-link"
											size="xs"
											color="primary"
											variant="soft"
											class="shrink-0 ml-3"
											@click="attachTimeEntry(entry.id)"
										>
											Attach
										</UButton>
									</div>
								</div>

								<div class="flex justify-end mt-4 pt-4 border-t border-border/40">
									<UButton color="gray" variant="ghost" @click="showAttachTimeEntry = false">Close</UButton>
								</div>
							</div>
						</UModal>
					</ClientOnly>
				</template>
				<template #documents="{ item }">
					<div class="w-full py-6">
						<div class="flex items-center justify-between mb-4">
							<h2 class="t-label text-muted-foreground">Documents</h2>
							<div class="flex items-center gap-2">
								<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="openAttachFile">
									<UIcon name="i-heroicons-link" class="h-3 w-3 mr-1" />
									Attach Existing
								</Button>
								<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="triggerFileUpload" :disabled="uploadingDoc">
									<UIcon v-if="uploadingDoc" name="i-heroicons-arrow-path" class="h-3 w-3 mr-1 animate-spin" />
									<UIcon v-else name="i-heroicons-arrow-up-tray" class="h-3 w-3 mr-1" />
									Upload
								</Button>
							</div>
							<input ref="fileInput" type="file" multiple class="hidden" @change="handleFileUpload" />
						</div>

						<transition name="fade" mode="out-in">
						<div v-if="loadingDocs" key="docs-loading" class="space-y-2">
							<div v-for="n in 3" :key="n" class="h-16 bg-muted/30 rounded-2xl animate-pulse" />
						</div>

						<div v-else-if="documents.length > 0" key="docs-list" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
							<a
								v-for="doc in documents"
								:key="doc.id"
								:href="`${useRuntimeConfig().public.directusUrl}/assets/${doc.directus_files_id?.id}`"
								target="_blank"
								class="ios-card p-4 flex items-center gap-3 ios-press block stagger-item"
							>
								<UIcon :name="getFileIcon(doc.directus_files_id?.type)" class="w-5 h-5 text-muted-foreground flex-shrink-0" />
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-foreground truncate">{{ doc.directus_files_id?.title || doc.directus_files_id?.filename_download }}</p>
									<div class="flex items-center gap-2 mt-0.5">
										<span class="text-[10px] text-muted-foreground">{{ formatFileSize(doc.directus_files_id?.filesize) }}</span>
										<span v-if="doc.directus_files_id?.uploaded_on" class="text-[10px] text-muted-foreground">
											{{ getFriendlyDate(doc.directus_files_id.uploaded_on) }}
										</span>
									</div>
								</div>
								<UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
							</a>
						</div>

						<div v-else key="docs-empty" class="flex flex-col items-center justify-center py-16 text-center">
							<div class="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
								<Icon name="lucide:file-text" class="h-6 w-6 text-muted-foreground/60" />
							</div>
							<p class="text-sm text-muted-foreground">No documents yet</p>
							<p class="text-xs text-muted-foreground/60 mt-1">Upload files to keep everything organized.</p>
							<Button size="sm" variant="outline" class="mt-4 uppercase text-[10px] tracking-wide" @click="triggerFileUpload">
								<UIcon name="i-heroicons-arrow-up-tray" class="h-3 w-3 mr-1" />
								Upload Files
							</Button>
						</div>
						</transition>

						<!-- Attach Existing File Modal -->
						<ClientOnly>
							<UModal v-model="showAttachFile">
								<div class="p-6">
									<h3 class="text-lg font-semibold mb-4">Attach Existing File</h3>

									<UInput
										v-model="fileSearchQuery"
										icon="i-heroicons-magnifying-glass"
										placeholder="Search files..."
										size="sm"
										class="mb-4"
									/>

									<div v-if="loadingExistingFiles" class="space-y-2 py-4">
										<div v-for="n in 3" :key="n" class="h-14 bg-muted rounded-xl animate-pulse" />
									</div>

									<div v-else-if="filteredExistingFiles.length === 0" class="text-center py-8 text-muted-foreground">
										<UIcon name="i-heroicons-document-magnifying-glass" class="w-8 h-8 mx-auto mb-2 opacity-40" />
										<p class="text-sm">{{ fileSearchQuery ? 'No matching files found.' : 'No files available to attach.' }}</p>
									</div>

									<div v-else class="space-y-2 max-h-[60vh] overflow-y-auto">
										<div
											v-for="file in filteredExistingFiles"
											:key="file.id"
											class="ios-card p-3 flex items-center justify-between"
										>
											<div class="flex items-center gap-3 min-w-0">
												<UIcon :name="getFileIcon(file.type)" class="w-4 h-4 text-muted-foreground flex-shrink-0" />
												<div class="min-w-0">
													<p class="text-sm font-medium text-foreground truncate">{{ file.title || file.filename_download }}</p>
													<p class="text-[10px] text-muted-foreground">
														{{ formatFileSize(file.filesize) }}
														<span v-if="file.uploaded_on"> &middot; {{ getFriendlyDate(file.uploaded_on) }}</span>
													</p>
												</div>
											</div>
											<UButton
												icon="i-heroicons-link"
												size="xs"
												color="primary"
												variant="soft"
												@click="attachFile(file.id)"
											>
												Attach
											</UButton>
										</div>
									</div>

									<div class="flex justify-end mt-4 pt-4 border-t border-border/40">
										<UButton color="gray" variant="ghost" @click="showAttachFile = false">Close</UButton>
									</div>
								</div>
							</UModal>
						</ClientOnly>
					</div>
				</template>
				<template #billing="{ item }">
					<div class="w-full py-6">
						<div class="flex items-center justify-between mb-4">
							<h2 class="t-label text-muted-foreground">Invoices</h2>
							<div class="flex items-center gap-2">
								<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="openAttachInvoice">
									<UIcon name="i-heroicons-link" class="h-3 w-3 mr-1" />
									Attach Existing
								</Button>
								<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="showQuickInvoice = true">
									<UIcon name="i-heroicons-plus" class="h-3 w-3 mr-1" />
									New Invoice
								</Button>
							</div>
						</div>

						<transition name="fade" mode="out-in">
						<div v-if="loadingInvoices" key="inv-loading" class="space-y-2">
							<div v-for="n in 3" :key="n" class="h-16 bg-muted/30 rounded-2xl animate-pulse" />
						</div>

						<div v-else-if="projectInvoices.length > 0" key="inv-list" class="grid grid-cols-1 md:grid-cols-2 gap-3">
							<NuxtLink
								v-for="inv in projectInvoices"
								:key="inv.id"
								:to="`/invoices/${inv.id}`"
								class="ios-card p-4 flex items-center justify-between ios-press block stagger-item"
							>
								<div class="flex items-center gap-3 min-w-0">
									<div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
										:class="{
											'bg-green-500/10': inv.status === 'paid',
											'bg-amber-500/10': inv.status === 'pending',
											'bg-blue-500/10': inv.status === 'processing',
											'bg-muted/60': inv.status === 'archived',
										}"
									>
										<UIcon name="i-heroicons-document-currency-dollar" class="w-4 h-4"
											:class="{
												'text-green-500': inv.status === 'paid',
												'text-amber-500': inv.status === 'pending',
												'text-blue-500': inv.status === 'processing',
												'text-muted-foreground': inv.status === 'archived',
											}"
										/>
									</div>
									<div class="min-w-0">
										<p class="text-sm font-medium text-foreground">{{ inv.invoice_code || `Invoice #${inv.id}` }}</p>
										<p class="text-[10px] text-muted-foreground">{{ inv.client?.name || inv.bill_to?.name || '' }}</p>
									</div>
								</div>
								<div class="text-right flex-shrink-0 ml-2">
									<p class="text-sm font-semibold text-foreground">{{ formatCurrency(getInvoiceTotal(inv)) }}</p>
									<span
										class="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
										:class="{
											'text-green-500 bg-green-500/10': inv.status === 'paid',
											'text-amber-500 bg-amber-500/10': inv.status === 'pending',
											'text-blue-500 bg-blue-500/10': inv.status === 'processing',
											'text-muted-foreground bg-muted/40': inv.status === 'archived',
										}"
									>
										{{ inv.status }}
									</span>
								</div>
							</NuxtLink>
						</div>

						<div v-else key="inv-empty" class="flex flex-col items-center justify-center py-16 text-center">
							<div class="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
								<Icon name="lucide:receipt" class="h-6 w-6 text-muted-foreground/60" />
							</div>
							<p class="text-sm text-muted-foreground">No invoices for this project.</p>
							<Button size="sm" variant="outline" class="mt-4 uppercase text-[10px] tracking-wide" @click="showQuickInvoice = true">
								<UIcon name="i-heroicons-plus" class="h-3 w-3 mr-1" />
								Create Invoice
							</Button>
						</div>
						</transition>
					</div>

					<!-- Invoice Create Modal -->
					<ClientOnly>
						<UModal v-model="showQuickInvoice" class="sm:max-w-2xl">
							<div class="p-6 max-h-[85vh] overflow-y-auto">
								<h3 class="text-lg font-semibold mb-4">Create Invoice</h3>
								<InvoicesInvoiceForm
									:defaults="invoiceDefaults"
									:saving="savingInvoice"
									@save="handleInvoiceSave"
									@cancel="showQuickInvoice = false"
								/>
							</div>
						</UModal>

						<!-- Attach Existing Invoice Modal -->
						<UModal v-model="showAttachInvoice">
							<div class="p-6">
								<h3 class="text-lg font-semibold mb-4">Attach Existing Invoice</h3>

								<div v-if="loadingUnattached" class="space-y-2 py-4">
									<div v-for="n in 3" :key="n" class="h-14 bg-muted rounded-xl animate-pulse" />
								</div>

								<div v-else-if="unattachedInvoices.length === 0" class="text-center py-8 text-muted-foreground">
									<UIcon name="i-heroicons-document-magnifying-glass" class="w-8 h-8 mx-auto mb-2 opacity-40" />
									<p class="text-sm">No unattached invoices found for this organization.</p>
								</div>

								<div v-else class="space-y-2 max-h-[60vh] overflow-y-auto">
									<div
										v-for="inv in unattachedInvoices"
										:key="inv.id"
										class="ios-card p-3 flex items-center justify-between"
									>
										<div class="min-w-0">
											<p class="text-sm font-medium text-foreground">{{ inv.invoice_code || `Invoice #${inv.id.slice(0, 8)}` }}</p>
											<p class="text-[10px] text-muted-foreground">
												{{ inv.client?.name || inv.bill_to?.name || 'No client' }}
												<span v-if="inv.total_amount"> &middot; {{ formatCurrency(parseFloat(inv.total_amount) || 0) }}</span>
											</p>
										</div>
										<UButton
											icon="i-heroicons-link"
											size="xs"
											color="primary"
											variant="soft"
											@click="attachInvoice(inv.id)"
										>
											Attach
										</UButton>
									</div>
								</div>

								<div class="flex justify-end mt-4 pt-4 border-t border-border/40">
									<UButton color="gray" variant="ghost" @click="showAttachInvoice = false">Close</UButton>
								</div>
							</div>
						</UModal>
					</ClientOnly>
				</template>
			</UTabs>
		</div>

		<!-- Contextual AI Sidebar -->
		<ClientOnly>
			<AIContextualSidebar
				v-if="sidebarOpen && project?.id"
				entity-type="project"
				:entity-id="String(project.id)"
				:entity-label="project.title || 'Project'"
				@close="closeSidebar"
			/>
			<Transition name="overlay">
				<div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
			</Transition>
		</ClientOnly>
	</div>
</template>
<style></style>

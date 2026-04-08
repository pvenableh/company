<script setup>
import { Button } from '~/components/ui/button';
const { params } = useRoute();
const projectItems = useDirectusItems('projects');
const ticketItems = useDirectusItems('tickets');
const taskItems = useDirectusItems('project_tasks');
const invoiceItems = useDirectusItems('invoices');
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
		slot: 'activity',
		label: 'Activity',
		icon: 'i-heroicons-clock',
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
});

const loadStats = async () => {
	try {
		const projectFilter = { project: { _eq: params.id } };
		const [tickets, tasks, invoices] = await Promise.all([
			ticketItems.list({
				fields: ['id', 'status'],
				filter: projectFilter,
				limit: 200,
			}),
			taskItems.list({
				fields: ['id', 'completed', 'status'],
				filter: projectFilter,
				limit: 200,
			}),
			invoiceItems.list({
				fields: ['id', 'status', 'line_items'],
				filter: projectFilter,
				limit: 100,
			}),
		]);

		stats.value.ticketCount = tickets?.length || 0;
		stats.value.openTickets = tickets?.filter(t => t.status !== 'Completed').length || 0;
		stats.value.taskCount = tasks?.length || 0;
		stats.value.completedTasks = tasks?.filter(t => t.completed || t.status === 'completed').length || 0;
		stats.value.eventCount = project?.events?.length || 0;

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
});

// ── Status color ──
const statusColor = computed(() => {
	const map = {
		Pending: 'var(--cyan)',
		Scheduled: 'var(--cyan2)',
		'In Progress': 'var(--green2)',
		Completed: 'var(--green)',
	};
	return map[project?.status] || 'var(--cyan)';
});

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
const showQuickChannel = ref(false);
const savingInvoice = ref(false);
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

// Defaults for new invoice form (project + org pre-selected)
const invoiceDefaults = computed(() => ({
	project: params.id,
	bill_to: project?.organization?.id || null,
}));

// ── Documents ──
const documents = ref([]);
const loadingDocs = ref(false);
const uploadingDoc = ref(false);
const fileInput = ref(null);

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
			filter: { project: { _eq: params.id } },
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
	} catch (err) {
		console.error('Error refreshing project:', err);
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
			<!-- Header -->
			<div class="flex items-center justify-between mb-4">
				<div class="flex items-center gap-3">
					<BackButton to="/projects" />
					<div>
						<div class="flex items-center gap-2">
							<h1 class="text-xl font-semibold text-foreground">{{ project?.title || 'Project' }}</h1>
							<span
								class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
								:style="{ backgroundColor: statusColor, color: 'var(--darkBlue)' }"
							>
								{{ project?.status }}
							</span>
						</div>
						<div class="flex items-center gap-2 mt-0.5">
							<span v-if="project?.service" class="flex items-center gap-1 text-xs text-muted-foreground">
								<span class="h-2 w-2 inline-block rounded-full" :style="{ backgroundColor: project.service.color }" />
								{{ project.service.name }}
							</span>
							<span class="text-xs text-muted-foreground">{{ project?.client?.name || project?.organization?.name }}</span>
						</div>
					</div>
				</div>
				<button
					class="h-8 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center gap-1.5"
					@click="showEditModal = true"
				>
					<Icon name="lucide:pencil" class="w-3.5 h-3.5" />
					Edit
				</button>
			</div>

			<!-- Stats Row -->
			<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
				<!-- Open Tickets -->
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-1">
						<UIcon name="i-heroicons-square-3-stack-3d" class="w-4 h-4 text-amber-500" />
						<span class="t-label text-muted-foreground">Tickets</span>
					</div>
					<p class="text-2xl font-bold text-foreground">{{ stats.openTickets }}</p>
					<p class="text-[10px] text-muted-foreground">{{ stats.ticketCount }} total</p>
				</div>

				<!-- Tasks -->
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-1">
						<UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-purple-500" />
						<span class="t-label text-muted-foreground">Tasks</span>
					</div>
					<p class="text-2xl font-bold text-foreground">{{ stats.completedTasks }}/{{ stats.taskCount }}</p>
					<div class="mt-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
						<div class="h-full rounded-full bg-purple-500 transition-all duration-500" :style="{ width: `${taskProgress}%` }" />
					</div>
				</div>

				<!-- Billing -->
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-1">
						<UIcon name="i-heroicons-currency-dollar" class="w-4 h-4 text-green-500" />
						<span class="t-label text-muted-foreground">Billed</span>
					</div>
					<p class="text-2xl font-bold text-foreground">{{ formatCurrency(stats.invoiceTotal) }}</p>
					<p class="text-[10px] text-muted-foreground">{{ formatCurrency(stats.paidTotal) }} paid</p>
				</div>

				<!-- Timeline -->
				<div class="ios-card p-4">
					<div class="flex items-center gap-2 mb-1">
						<UIcon name="i-heroicons-calendar-days" class="w-4 h-4 text-blue-500" />
						<span class="t-label text-muted-foreground">Timeline</span>
					</div>
					<p v-if="daysRemaining !== null" class="text-2xl font-bold text-foreground" :class="{ 'text-red-500': daysRemaining < 0 }">
						{{ daysRemaining < 0 ? Math.abs(daysRemaining) : daysRemaining }}
					</p>
					<p v-else class="text-2xl font-bold text-muted-foreground/40">—</p>
					<p class="text-[10px] text-muted-foreground">{{ daysRemaining !== null ? (daysRemaining < 0 ? 'days overdue' : 'days remaining') : 'no due date' }}</p>
				</div>
			</div>

			<!-- Assigned Team -->
			<div v-if="project?.assigned_to?.length" class="flex items-center gap-2 mb-6">
				<span class="t-label text-muted-foreground mr-2">Team:</span>
				<div class="flex -space-x-2">
					<UAvatar
						v-for="assignment in project.assigned_to.slice(0, 6)"
						:key="assignment.directus_users_id?.id"
						:src="assignment.directus_users_id?.avatar ? `${useRuntimeConfig().public.directusUrl}/assets/${assignment.directus_users_id.avatar}?width=64&height=64&fit=cover` : undefined"
						:alt="`${assignment.directus_users_id?.first_name || ''} ${assignment.directus_users_id?.last_name || ''}`"
						size="xs"
						class="ring-2 ring-background"
					/>
				</div>
				<span v-if="project.assigned_to.length > 6" class="text-xs text-muted-foreground">+{{ project.assigned_to.length - 6 }}</span>
			</div>

			<!-- Edit Project Modal -->
			<ClientOnly>
				<ProjectsFormModal v-model="showEditModal" :project="project" @updated="refreshProject" @deleted="handleDeleted" />
			</ClientOnly>
		</div>

		<!-- Tabs -->
		<div class="max-w-screen-xl mx-auto page_inner px-4 2xl:px-0 my-4">
			<UTabs
				:items="items"
				class="mt-2"
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
						<div v-else class="max-w-xl mx-auto">
							<TasksInlineAdder context="project" :context-id="project.id" :organization-id="project.organization?.id" />
						</div>
					</div>
				</template>
				<template #tickets="{ item }">
					<TicketsBoard :projectId="project.id" :organizationId="project.organization?.id" />
				</template>
				<template #activity="{ item }">
					<div class="max-w-2xl mx-auto py-6">
						<ProjectsActivityTimeline :project-id="params.id" />
					</div>
				</template>
				<template #time="{ item }">
					<ProjectsTimeEntries :project-id="params.id" :client-id="project?.client?.id" />
				</template>
				<template #documents="{ item }">
					<div class="w-full px-4 py-6 min-h-[50vh] flex items-start justify-center">
						<div class="w-full max-w-2xl">
							<div class="flex items-center justify-between mb-4">
								<h2 class="t-label text-muted-foreground">Documents</h2>
								<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="triggerFileUpload" :disabled="uploadingDoc">
									<UIcon v-if="uploadingDoc" name="i-heroicons-arrow-path" class="h-3 w-3 mr-1 animate-spin" />
									<UIcon v-else name="i-heroicons-arrow-up-tray" class="h-3 w-3 mr-1" />
									Upload
								</Button>
								<input ref="fileInput" type="file" multiple class="hidden" @change="handleFileUpload" />
							</div>

							<!-- Loading -->
							<div v-if="loadingDocs" class="space-y-2">
								<div v-for="n in 3" :key="n" class="h-16 bg-muted rounded-xl animate-pulse" />
							</div>

							<!-- Documents list -->
							<div v-else-if="documents.length > 0" class="space-y-2">
								<a
									v-for="doc in documents"
									:key="doc.id"
									:href="`${useRuntimeConfig().public.directusUrl}/assets/${doc.directus_files_id?.id}`"
									target="_blank"
									class="ios-card p-4 flex items-center gap-3 ios-press block"
								>
									<UIcon :name="getFileIcon(doc.directus_files_id?.type)" class="w-5 h-5 text-muted-foreground flex-shrink-0" />
									<div class="flex-1 min-w-0">
										<p class="text-sm font-medium text-foreground truncate">{{ doc.directus_files_id?.title || doc.directus_files_id?.filename_download }}</p>
										<div class="flex items-center gap-2 mt-0.5">
											<span class="text-[10px] text-muted-foreground">{{ formatFileSize(doc.directus_files_id?.filesize) }}</span>
											<span v-if="doc.directus_files_id?.uploaded_on" class="text-[10px] text-muted-foreground">
												{{ new Date(doc.directus_files_id.uploaded_on).toLocaleDateString() }}
											</span>
										</div>
									</div>
									<UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
								</a>
							</div>

							<!-- Empty state -->
							<div v-else class="flex flex-col items-center justify-center py-16 text-center">
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
						</div>
					</div>
				</template>
				<template #billing="{ item }">
					<div class="w-full px-4 py-6 min-h-[50vh] flex items-start justify-center">
						<div class="w-full max-w-2xl">
							<div class="flex items-center justify-between mb-4">
								<h2 class="t-label text-muted-foreground">Invoices</h2>
								<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="showQuickInvoice = true">
									<UIcon name="i-heroicons-plus" class="h-3 w-3 mr-1" />
									New Invoice
								</Button>
							</div>

							<div v-if="loadingInvoices" class="space-y-2">
								<div v-for="n in 3" :key="n" class="h-16 bg-muted rounded-xl animate-pulse" />
							</div>

							<div v-else-if="projectInvoices.length > 0" class="space-y-2">
								<NuxtLink
									v-for="inv in projectInvoices"
									:key="inv.id"
									:to="`/invoices/${inv.id}`"
									class="ios-card p-4 flex items-center justify-between ios-press block"
								>
									<div class="flex items-center gap-3 min-w-0">
										<UIcon name="i-heroicons-document-currency-dollar" class="w-5 h-5 text-green-500 flex-shrink-0" />
										<div class="min-w-0">
											<p class="text-sm font-medium text-foreground">{{ inv.invoice_code || `Invoice #${inv.id}` }}</p>
											<p class="text-[10px] text-muted-foreground">{{ inv.client?.name || inv.bill_to?.name || '' }}</p>
										</div>
									</div>
									<div class="text-right flex-shrink-0 ml-2">
										<p class="text-sm font-semibold text-foreground">{{ formatCurrency(getInvoiceTotal(inv)) }}</p>
										<span
											class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
											:class="{
												'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': inv.status === 'paid',
												'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': inv.status === 'pending',
												'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': inv.status === 'processing',
												'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': inv.status === 'archived',
											}"
										>
											{{ inv.status }}
										</span>
									</div>
								</NuxtLink>
							</div>

							<div v-else class="flex flex-col items-center justify-center py-16 text-center">
								<div class="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
									<Icon name="lucide:receipt" class="h-6 w-6 text-muted-foreground/60" />
								</div>
								<p class="text-sm text-muted-foreground">No invoices for this project.</p>
								<Button size="sm" variant="outline" class="mt-4 uppercase text-[10px] tracking-wide" @click="showQuickInvoice = true">
									<UIcon name="i-heroicons-plus" class="h-3 w-3 mr-1" />
									Create Invoice
								</Button>
							</div>
						</div>
					</div>

					<!-- Invoice Create Modal -->
					<ClientOnly>
						<UModal v-model="showQuickInvoice" class="sm:max-w-2xl">
							<div class="p-6">
								<h3 class="text-lg font-semibold mb-4">Create Invoice</h3>
								<InvoicesInvoiceForm
									:defaults="invoiceDefaults"
									:saving="savingInvoice"
									@save="handleInvoiceSave"
									@cancel="showQuickInvoice = false"
								/>
							</div>
						</UModal>
					</ClientOnly>
				</template>
			</UTabs>
		</div>
	</div>
</template>
<style></style>

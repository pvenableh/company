<template>
	<div class="w-full py-6 space-y-6">
		<!-- Status Update Section -->
		<div class="ios-card p-5">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<Icon name="lucide:flag" class="w-4 h-4 text-muted-foreground" />
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project Status</span>
				</div>
				<button
					v-if="isAdmin && !showUpdateForm"
					class="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
					@click="showUpdateForm = true"
				>
					Post Update
				</button>
			</div>

			<!-- Post Update Form -->
			<div v-if="showUpdateForm" class="space-y-3 mb-4 p-3 rounded-xl bg-muted/20 border border-border/50">
				<div class="flex gap-2">
					<button
						v-for="(cfg, key) in statusUpdateColors"
						:key="key"
						class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors"
						:class="newStatus === key ? `${cfg.bg} ${cfg.text}` : 'text-muted-foreground hover:bg-muted/40'"
						@click="newStatus = key"
					>
						<span class="w-2 h-2 rounded-full" :class="cfg.dot" />
						{{ cfg.label }}
					</button>
				</div>
				<textarea
					v-model="newStatusText"
					rows="2"
					class="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/40 resize-none"
					placeholder="What's the latest on this project?"
				/>
				<div class="flex justify-end gap-2">
					<button class="text-xs text-muted-foreground hover:text-foreground" @click="showUpdateForm = false">Cancel</button>
					<button
						class="px-3 py-1 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
						:disabled="!newStatusText.trim() || postingUpdate"
						@click="postStatusUpdate"
					>
						{{ postingUpdate ? 'Posting...' : 'Post' }}
					</button>
				</div>
			</div>

			<!-- Latest Status -->
			<div v-if="statusUpdates.length" class="space-y-3">
				<div
					v-for="update in statusUpdates.slice(0, 3)"
					:key="update.id"
					class="flex items-start gap-3"
				>
					<span
						class="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
						:class="statusUpdateColors[update.status]?.dot || 'bg-muted'"
					/>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2">
							<span
								class="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
								:class="`${statusUpdateColors[update.status]?.bg || 'bg-muted'} ${statusUpdateColors[update.status]?.text || 'text-muted-foreground'}`"
							>
								{{ statusUpdateColors[update.status]?.label || update.status }}
							</span>
							<span class="text-[10px] text-muted-foreground">
								{{ update.user_created?.first_name }} · {{ getFriendlyDate(update.date_created) }}
							</span>
						</div>
						<p class="text-xs text-foreground mt-1">{{ update.text }}</p>
					</div>
				</div>
			</div>
			<p v-else class="text-xs text-muted-foreground/50 text-center py-2">No status updates yet</p>
		</div>

		<!-- Info Widgets Row -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
			<!-- Project Details Widget -->
			<div class="ios-card p-5">
				<div class="flex items-center gap-2 mb-4">
					<div class="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
						<UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-primary" />
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project Details</span>
				</div>
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Status</span>
						<span class="text-xs font-medium text-foreground px-2 py-0.5 rounded-full bg-muted">{{ project.status || 'Unknown' }}</span>
					</div>
					<div v-if="project.service" class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Service</span>
						<span class="flex items-center gap-1.5 text-xs font-medium text-foreground">
							<span class="h-2 w-2 rounded-full inline-block" :style="{ backgroundColor: project.service.color }" />
							{{ project.service.name }}
						</span>
					</div>
					<div v-if="project.organization" class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Organization</span>
						<span class="text-xs font-medium text-foreground">{{ project.organization.name }}</span>
					</div>
					<div v-if="project.start_date" class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Start Date</span>
						<span class="text-xs font-medium text-foreground">{{ formatDate(project.start_date) }}</span>
					</div>
					<div v-if="project.due_date" class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Due Date</span>
						<span class="text-xs font-medium text-foreground">{{ formatDate(project.due_date) }}</span>
					</div>
					<div v-if="project.contract_value" class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Contract Value</span>
						<span class="text-xs font-medium text-foreground">{{ formatCurrency(project.contract_value) }}</span>
					</div>
				</div>
				<p v-if="project.description" class="text-xs text-muted-foreground mt-4 line-clamp-3">{{ project.description }}</p>
			</div>

			<!-- Team Widget -->
			<div class="ios-card p-5">
				<div class="flex items-center gap-2 mb-4">
					<div class="h-8 w-8 rounded-xl bg-indigo-500/10 flex items-center justify-center">
						<UIcon name="i-heroicons-user-group" class="w-4 h-4 text-indigo-500" />
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team</span>
					<span v-if="project.assigned_to?.length" class="text-[10px] text-muted-foreground ml-auto">{{ project.assigned_to.length }} member{{ project.assigned_to.length !== 1 ? 's' : '' }}</span>
				</div>
				<div v-if="project.assigned_to?.length" class="space-y-2.5">
					<div
						v-for="assignment in project.assigned_to"
						:key="assignment.directus_users_id?.id"
						class="flex items-center gap-3"
					>
						<UAvatar
							:src="assignment.directus_users_id?.avatar ? `${runtimeConfig.public.directusUrl}/assets/${assignment.directus_users_id.avatar}?width=64&height=64&fit=cover` : undefined"
							:alt="`${assignment.directus_users_id?.first_name || ''} ${assignment.directus_users_id?.last_name || ''}`"
							size="xs"
						/>
						<div class="min-w-0">
							<p class="text-sm font-medium text-foreground truncate">
								{{ assignment.directus_users_id?.first_name }} {{ assignment.directus_users_id?.last_name }}
							</p>
							<p v-if="assignment.directus_users_id?.email" class="text-[10px] text-muted-foreground truncate">{{ assignment.directus_users_id.email }}</p>
						</div>
					</div>
				</div>
				<div v-else class="flex flex-col items-center justify-center py-8 text-center">
					<UIcon name="i-heroicons-user-group" class="w-8 h-8 text-muted-foreground/30 mb-2" />
					<p class="text-xs text-muted-foreground">No team members assigned</p>
				</div>
			</div>

			<!-- Financial Summary Widget -->
			<div class="ios-card p-5">
				<div class="flex items-center gap-2 mb-4">
					<div class="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
						<UIcon name="i-heroicons-banknotes" class="w-4 h-4 text-emerald-500" />
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Financials</span>
				</div>
				<div class="space-y-3">
					<div v-if="project.contract_value" class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Contract</span>
						<span class="text-xs font-bold text-foreground">{{ formatCurrency(project.contract_value) }}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Invoiced</span>
						<span class="text-xs font-medium text-foreground">{{ formatCurrency(stats.invoiceTotal) }}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Paid</span>
						<span class="text-xs font-medium text-green-600">{{ formatCurrency(stats.paidTotal) }}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">Outstanding</span>
						<span class="text-xs font-medium" :class="stats.invoiceTotal - stats.paidTotal > 0 ? 'text-amber-500' : 'text-foreground'">
							{{ formatCurrency(stats.invoiceTotal - stats.paidTotal) }}
						</span>
					</div>
					<div v-if="project.contract_value && stats.invoiceTotal > 0" class="pt-2">
						<div class="flex items-center justify-between mb-1">
							<span class="text-[10px] text-muted-foreground">Invoiced vs Contract</span>
							<span class="text-[10px] font-medium text-foreground">{{ Math.round((stats.invoiceTotal / project.contract_value) * 100) }}%</span>
						</div>
						<div class="h-1.5 bg-muted/30 rounded-full overflow-hidden">
							<div class="h-full rounded-full bg-emerald-500 transition-all duration-500" :style="{ width: `${Math.min(100, (stats.invoiceTotal / project.contract_value) * 100)}%` }" />
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Events Section -->
		<div class="ios-card p-5">
			<div class="flex items-center justify-between mb-4">
				<div class="flex items-center gap-2">
					<div class="h-8 w-8 rounded-xl bg-cyan-500/10 flex items-center justify-center">
						<UIcon name="i-heroicons-calendar" class="w-4 h-4 text-cyan-500" />
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project Events</span>
					<span v-if="allEvents.length" class="text-[10px] text-muted-foreground">({{ allEvents.length }})</span>
				</div>
				<div class="flex items-center gap-2">
					<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="showTimelineWizard = true">
						<Icon name="lucide:sparkles" class="h-3 w-3 mr-1" />
						Generate Timeline
					</Button>
					<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="showNewEventModal = true">
						<UIcon name="i-heroicons-plus" class="h-3 w-3 mr-1" />
						New Event
					</Button>
				</div>
			</div>

			<!-- Events list -->
			<div v-if="allEvents.length > 0" class="space-y-2">
				<button
					v-for="event in allEvents"
					:key="event.id"
					class="w-full text-left p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors ios-press"
					@click="openEventDetail(event)"
				>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 min-w-0">
							<div
								class="h-2.5 w-2.5 rounded-full shrink-0"
								:class="{
									'bg-blue-500': event.type === 'design',
									'bg-green-500': event.type === 'payment',
									'bg-orange-500': event.type === 'review',
									'bg-purple-500': event.type === 'meeting',
									'bg-gray-400': !['design', 'payment', 'review', 'meeting'].includes(event.type),
								}"
							/>
							<h5 class="uppercase tracking-wide font-bold text-xs truncate">{{ event.title }}</h5>
						</div>
						<div class="flex items-center gap-2 shrink-0 ml-2">
							<span v-if="event.date" class="text-[9px] text-muted-foreground">
								{{ formatEventDate(event.date || event.event_date) }}
							</span>
							<span
								class="text-[8px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full"
								:class="{
									'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': event.status === 'Active',
									'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': event.status === 'Completed',
									'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400': event.status === 'Cancelled',
								}"
							>
								{{ event.status }}
							</span>
							<Icon name="lucide:chevron-right" class="h-3.5 w-3.5 text-muted-foreground/50" />
						</div>
					</div>
				</button>
			</div>

			<!-- Empty state -->
			<div v-else class="flex flex-col items-center justify-center py-12 text-center">
				<UIcon name="i-heroicons-calendar" class="w-8 h-8 text-muted-foreground/30 mb-2" />
				<p class="text-sm text-muted-foreground">No events yet</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Create events manually or generate a timeline with AI.</p>
			</div>
		</div>

		<!-- New Event Modal -->
		<UModal v-model="showNewEventModal" title="New Event">
			<template #header>
				<div class="flex items-center justify-between w-full">
					<h3 class="text-sm font-bold uppercase tracking-wide">New Event</h3>
					<Button variant="ghost" size="icon-sm" @click="showNewEventModal = false">
						<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
					</Button>
				</div>
			</template>

			<form @submit.prevent="handleCreateEvent" class="space-y-4 p-4">
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Title *</label>
					<UInput v-model="newEventForm.title" placeholder="Event title" />
				</div>
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Description</label>
					<UTextarea v-model="newEventForm.description" placeholder="Event description..." :rows="3" />
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Type</label>
						<USelectMenu v-model="newEventForm.type" :options="eventTypeOptions" option-attribute="label" value-attribute="value" placeholder="Select type" />
					</div>
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Status</label>
						<USelectMenu v-model="newEventForm.status" :options="eventStatusOptions" option-attribute="label" value-attribute="value" placeholder="Select status" />
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Date</label>
						<UInput v-model="newEventForm.date" type="date" />
					</div>
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Priority</label>
						<USelectMenu v-model="newEventForm.priority" :options="priorityOptions" option-attribute="label" value-attribute="value" placeholder="Select priority" />
					</div>
				</div>
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Figma / Prototype Link</label>
					<UInput v-model="newEventForm.prototype_link" placeholder="https://figma.com/..." />
				</div>
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Images / Files</label>
					<div
						class="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
						@click="eventFileInput?.click()"
					>
						<UIcon name="i-heroicons-arrow-up-tray" class="w-5 h-5 mx-auto mb-1 text-muted-foreground/50" />
						<p class="text-xs text-muted-foreground">Click to upload images or files</p>
						<input ref="eventFileInput" type="file" multiple accept="image/*,.pdf,.fig" class="hidden" @change="handleEventFiles" />
					</div>
					<div v-if="pendingFiles.length" class="space-y-1 mt-2">
						<div v-for="(file, i) in pendingFiles" :key="i" class="flex items-center gap-2 text-xs text-foreground bg-muted/30 rounded-lg px-3 py-1.5">
							<UIcon name="i-heroicons-document" class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
							<span class="truncate flex-1">{{ file.name }}</span>
							<button @click.prevent="removeEventFile(i)" class="text-muted-foreground hover:text-red-500 flex-shrink-0">
								<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				</div>
			</form>

			<template #footer>
				<div class="flex justify-end gap-3 w-full">
					<Button variant="outline" size="sm" @click="showNewEventModal = false">Cancel</Button>
					<Button size="sm" :disabled="creatingEvent || !newEventForm.title.trim()" @click="handleCreateEvent">
						<UIcon v-if="creatingEvent" name="i-heroicons-arrow-path" class="animate-spin h-3 w-3 mr-1" />
						Create Event
					</Button>
				</div>
			</template>
		</UModal>

		<!-- Timeline Generator Wizard -->
		<ProjectsAITimelineWizard
			v-if="showTimelineWizard"
			:project="project"
			@close="showTimelineWizard = false"
			@created="handleTimelineCreated"
		/>

		<!-- Event Detail Modal -->
		<UModal v-model="showEventDetail" class="sm:max-w-xl">
			<template #header>
				<div class="flex items-center justify-between w-full">
					<div class="flex items-center gap-2">
						<span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: project.service?.color || '#888' }" />
						<h3 class="t-label">{{ selectedEventFull?.title || 'Event Detail' }}</h3>
					</div>
					<Button variant="ghost" size="icon-sm" @click="closeEventDetail">
						<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
					</Button>
				</div>
			</template>

			<div class="max-h-[70vh] overflow-y-auto px-4 pb-4">
				<div v-if="loadingEventDetail" class="flex items-center justify-center py-20">
					<div class="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
				</div>
				<ProjectTimelineEventDetail
					v-else-if="selectedEventFull"
					:event="selectedEventFull"
					:project="eventProjectProxy"
					@close="closeEventDetail"
					@updated="handleEventUpdated"
				/>
			</div>
		</UModal>
	</div>
</template>
<script setup>
import { Button } from '~/components/ui/button';

const props = defineProps({
	project: {
		type: Object,
		required: true,
	},
});

const emit = defineEmits(['eventCreated']);

const { user } = useDirectusAuth();
const { canAccess } = useOrgRole();
const runtimeConfig = useRuntimeConfig();
const eventItems = useDirectusItems('project_events');
const eventFileItems = useDirectusItems('project_events_files');
const ticketItems = useDirectusItems('tickets');
const taskItems = useDirectusItems('project_tasks');
const invoiceItems = useDirectusItems('invoices');
const { upload: uploadFile } = useDirectusFiles();

const isAdmin = computed(() => canAccess('projects'));

// ── Status Updates ──
const statusUpdateItems = useDirectusItems('project_status_updates');
const statusUpdates = ref([]);
const showUpdateForm = ref(false);
const newStatus = ref('on_track');
const newStatusText = ref('');
const postingUpdate = ref(false);

const statusUpdateColors = {
	on_track: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-500', label: 'On Track' },
	at_risk: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-500', label: 'At Risk' },
	off_track: { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-500', label: 'Off Track' },
};

async function loadStatusUpdates() {
	try {
		const data = await statusUpdateItems.list({
			fields: ['id', 'status', 'text', 'date_created', 'user_created.id', 'user_created.first_name', 'user_created.last_name'],
			filter: { project: { _eq: props.project.id } },
			sort: ['-date_created'],
			limit: 10,
		});
		statusUpdates.value = data || [];
	} catch {
		// Collection may not have data yet
	}
}

async function postStatusUpdate() {
	if (!newStatusText.value.trim()) return;
	postingUpdate.value = true;
	try {
		await statusUpdateItems.create({
			project: props.project.id,
			status: newStatus.value,
			text: newStatusText.value,
		});
		newStatusText.value = '';
		showUpdateForm.value = false;
		await loadStatusUpdates();
	} catch (err) {
		console.error('Failed to post status update:', err);
	} finally {
		postingUpdate.value = false;
	}
}

// ── Stats ──
const stats = ref({
	ticketCount: 0,
	openTickets: 0,
	taskCount: 0,
	completedTasks: 0,
	invoiceTotal: 0,
	paidTotal: 0,
});

const loadStats = async () => {
	try {
		const projectFilter = { project: { _eq: props.project.id } };
		const [tickets, tasks, invoices] = await Promise.all([
			ticketItems.list({ fields: ['id', 'status'], filter: projectFilter, limit: 200 }),
			taskItems.list({ fields: ['id', 'completed', 'status'], filter: projectFilter, limit: 200 }),
			invoiceItems.list({ fields: ['id', 'status', 'line_items'], filter: projectFilter, limit: 100 }),
		]);

		stats.value.ticketCount = tickets?.length || 0;
		stats.value.openTickets = tickets?.filter(t => t.status !== 'Completed').length || 0;
		stats.value.taskCount = tasks?.length || 0;
		stats.value.completedTasks = tasks?.filter(t => t.completed || t.status === 'completed').length || 0;

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
		console.warn('Could not load project stats:', err);
	}
};

const taskProgress = computed(() => {
	if (!stats.value.taskCount) return 0;
	return Math.round((stats.value.completedTasks / stats.value.taskCount) * 100);
});

const daysRemaining = computed(() => {
	if (!props.project?.due_date) return null;
	const due = new Date(props.project.due_date);
	const now = new Date();
	return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
});

const formatCurrency = (amount) => {
	if (!amount && amount !== 0) return '$0';
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const formatDate = (dateStr) => {
	if (!dateStr) return '';
	return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

onMounted(() => {
	loadStats();
	loadStatusUpdates();
});

// Timeline wizard state
const showTimelineWizard = ref(false);

const handleTimelineCreated = (count) => {
	emit('eventCreated');
};

// New Event modal state
const showNewEventModal = ref(false);
const creatingEvent = ref(false);
const newEventForm = reactive({
	title: '',
	description: '',
	type: 'design',
	status: 'Active',
	date: '',
	prototype_link: '',
	priority: 'medium',
});
const pendingFiles = ref([]);
const uploadingFiles = ref(false);
const eventFileInput = ref(null);

const eventTypeOptions = [
	{ label: 'Design', value: 'design' },
	{ label: 'Development', value: 'development' },
	{ label: 'Review', value: 'review' },
	{ label: 'Meeting', value: 'meeting' },
];

const eventStatusOptions = [
	{ label: 'Active', value: 'Active' },
	{ label: 'Completed', value: 'Completed' },
	{ label: 'Cancelled', value: 'Cancelled' },
];

const priorityOptions = [
	{ label: 'Low', value: 'low' },
	{ label: 'Medium', value: 'medium' },
	{ label: 'High', value: 'high' },
];

const resetNewEventForm = () => {
	newEventForm.title = '';
	newEventForm.description = '';
	newEventForm.type = 'design';
	newEventForm.status = 'Active';
	newEventForm.date = '';
	newEventForm.prototype_link = '';
	newEventForm.priority = 'medium';
	pendingFiles.value = [];
};

const handleEventFiles = (e) => {
	const files = Array.from(e.target.files || []);
	pendingFiles.value.push(...files);
	if (eventFileInput.value) eventFileInput.value.value = '';
};

const removeEventFile = (index) => {
	pendingFiles.value.splice(index, 1);
};

const handleCreateEvent = async () => {
	if (!newEventForm.title.trim()) {
		useToast().add({ title: 'Error', description: 'Event title is required', color: 'red' });
		return;
	}

	creatingEvent.value = true;
	try {
		const data = {
			title: newEventForm.title.trim(),
			type: newEventForm.type,
			status: newEventForm.status,
			priority: newEventForm.priority,
			project: props.project.id,
		};

		if (newEventForm.description?.trim()) data.description = newEventForm.description.trim();
		if (newEventForm.date) data.date = newEventForm.date;
		if (newEventForm.prototype_link?.trim()) data.prototype_link = newEventForm.prototype_link.trim();

		const created = await eventItems.create(data);

		// Upload and link files if any
		if (pendingFiles.value.length > 0 && created?.id) {
			uploadingFiles.value = true;
			for (const file of pendingFiles.value) {
				try {
					const uploaded = await uploadFile(file, { title: `${data.title} - ${file.name}` });
					if (uploaded?.id) {
						await eventFileItems.create({
							project_events_id: created.id,
							directus_files_id: uploaded.id,
						});
					}
				} catch (fileErr) {
					console.warn('Failed to upload file:', fileErr);
				}
			}
			uploadingFiles.value = false;
		}

		useToast().add({ title: 'Event Created', description: `"${data.title}" has been created`, color: 'green' });
		emit('eventCreated');
		showNewEventModal.value = false;
		resetNewEventForm();
	} catch (error) {
		console.error('Error creating event:', error);
		useToast().add({ title: 'Error', description: 'Failed to create event', color: 'red' });
	} finally {
		creatingEvent.value = false;
	}
};

// Show all events sorted by date
const allEvents = computed(() => {
	return (props.project?.events || [])
		.sort((a, b) => new Date(a.date || a.event_date || 0) - new Date(b.date || b.event_date || 0));
});

const formatEventDate = (dateStr) => {
	if (!dateStr) return '';
	return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Event detail sheet
const showEventDetail = ref(false);
const selectedEventFull = ref(null);
const loadingEventDetail = ref(false);

const eventProjectProxy = computed(() => ({
	id: props.project.id,
	title: props.project.title,
	color: props.project.service?.color || '#888',
}));

const openEventDetail = async (event) => {
	showEventDetail.value = true;
	loadingEventDetail.value = true;
	try {
		const fullEvent = await eventItems.get(event.id, {
			fields: ['*', 'tasks.*', 'files.directus_files_id.*', 'category_id.id,category_id.name,category_id.color,category_id.text_color'],
		});
		selectedEventFull.value = fullEvent;
	} catch (err) {
		console.error('Error fetching event details:', err);
		selectedEventFull.value = event;
	} finally {
		loadingEventDetail.value = false;
	}
};

const closeEventDetail = () => {
	showEventDetail.value = false;
	selectedEventFull.value = null;
};

const handleEventUpdated = () => {
	emit('eventCreated');
};
</script>

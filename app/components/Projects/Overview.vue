<template>
	<div class="w-full py-6 space-y-6">
		<!-- Info Widgets Row -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
			<!-- Project Status Widget -->
			<div class="ios-card p-5">
				<div class="flex items-center justify-between mb-3">
					<div class="flex items-center gap-2">
						<div class="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
							<Icon name="lucide:flag" class="w-4 h-4 text-blue-500" />
						</div>
						<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
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
		<div class="ios-card p-3 sm:p-5 overflow-hidden">
			<div class="flex items-center justify-between gap-2 mb-4">
				<div class="flex items-center gap-2 sm:gap-3 min-w-0">
					<div class="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
						<UIcon name="i-heroicons-calendar" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-500" />
					</div>
					<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Events</span>
					<span v-if="allEvents.length" class="text-[10px] text-muted-foreground/50">({{ allEvents.length }})</span>
				</div>
				<div class="flex items-center gap-1 sm:gap-2 shrink-0">
					<Button size="sm" variant="outline" class="uppercase text-[9px] sm:text-[10px] tracking-wide h-7 px-2 sm:px-3" @click="showTimelineWizard = true">
						<UIcon name="i-heroicons-sparkles" class="h-3 w-3 mr-0.5 sm:mr-1" />
						<span class="hidden sm:inline">Generate</span> Timeline
					</Button>
					<Button size="sm" variant="outline" class="uppercase text-[9px] sm:text-[10px] tracking-wide h-7 px-2 sm:px-3" @click="showNewEventModal = true">
						<UIcon name="i-heroicons-plus" class="h-3 w-3 mr-0.5 sm:mr-1" />
						New
					</Button>
				</div>
			</div>

			<div v-if="allEvents.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
				<UIcon name="i-heroicons-calendar" class="w-8 h-8 text-muted-foreground/30 mb-2" />
				<p class="text-sm text-muted-foreground">No events yet</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Create events manually or generate a timeline with AI.</p>
			</div>

			<UTabs v-else :items="eventTabs">
				<template #timeline>
					<ProjectsMiniGantt :project="project" class="mt-2" @event-click="openEventDetail" />
				</template>
				<template #list>
					<div class="space-y-2 mt-2">
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
										v-if="event.approval === 'Need Approval'"
										class="text-[8px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-md text-amber-500 bg-amber-500/10"
									>
										Needs Approval
									</span>
									<span
										v-else-if="event.approval === 'Approved'"
										class="text-[8px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-md text-green-500 bg-green-500/10"
									>
										Approved
									</span>
									<span
										class="text-[8px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-md"
										:class="{
											'text-blue-500 bg-blue-500/10': event.status === 'Active',
											'text-green-500 bg-green-500/10': event.status === 'Completed',
											'text-muted-foreground bg-muted/40': event.status === 'draft' || event.status === 'archived',
											'text-cyan-500 bg-cyan-500/10': event.status === 'Scheduled',
										}"
									>
										{{ event.status }}
									</span>
									<UIcon name="i-heroicons-chevron-right" class="h-3.5 w-3.5 text-muted-foreground/50" />
								</div>
							</div>
						</button>
					</div>
				</template>
			</UTabs>
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
				<div class="w-full space-y-3">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-bold uppercase tracking-wide">Event Details</h3>
						<div class="flex items-center gap-2">
							<!-- Approval actions -->
							<template v-if="selectedEventFull?.approval === 'Need Approval'">
								<button
									class="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/30 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400 transition-colors hover:bg-green-500/20"
									:disabled="approvingEvent"
									@click="approveEvent(selectedEventFull)"
								>
									<Icon name="lucide:check" class="w-3 h-3" />
									Approve
								</button>
								<button
									class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
									:disabled="generatingLink"
									@click="generateApprovalLink(selectedEventFull)"
								>
									<Icon name="lucide:link" class="w-3 h-3" />
									Send Link
								</button>
							</template>
							<span
								v-else-if="selectedEventFull?.approval === 'Approved'"
								class="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-[9px] uppercase tracking-wider font-semibold text-green-500"
							>
								<Icon name="lucide:check-circle" class="w-3 h-3" />
								Approved
								<span v-if="selectedEventFull?.approved_at" class="text-muted-foreground font-normal normal-case">
									{{ getFriendlyDate(selectedEventFull.approved_at) }}
								</span>
							</span>
							<Button variant="ghost" size="icon-sm" @click="closeEventDetail">
								<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
							</Button>
						</div>
					</div>
					<FormStatusTimeline
						v-if="selectedEventFull && !loadingEventDetail"
						:currentStatus="selectedEventFull.status || 'Active'"
						:statuses="eventStatusOptions.map(s => ({ id: s, name: s }))"
						collection="project_events"
						:itemId="selectedEventFull.id"
						@status-change="handleEventStatusChange"
					/>
				</div>
			</template>

			<div class="max-h-[70vh] overflow-y-auto px-4 pb-4">
				<div v-if="loadingEventDetail" class="flex items-center justify-center py-20">
					<div class="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
				</div>
				<ProjectTimelineEventDetail
					v-else-if="selectedEventFull"
					ref="eventDetailRef"
					:event="selectedEventFull"
					:project="eventProjectProxy"
					@close="closeEventDetail"
					@updated="handleEventUpdated"
				/>
			</div>

			<template #footer v-if="selectedEventFull && !loadingEventDetail">
				<div class="flex items-center justify-between w-full">
					<div class="flex items-center gap-1">
						<UTooltip text="Delete event">
							<Button
								variant="ghost"
								size="icon-sm"
								class="text-destructive hover:text-destructive hover:bg-destructive/10"
								@click="handleDeleteEvent"
							>
								<Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
							</Button>
						</UTooltip>
					</div>
					<Button
						size="sm"
						:disabled="!eventDetailRef?.dirty || eventDetailRef?.saving"
						@click="eventDetailRef?.save()"
					>
						<Icon v-if="eventDetailRef?.saving" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 animate-spin" />
						<Icon v-else name="lucide:save" class="h-3.5 w-3.5 mr-1" />
						Save
					</Button>
				</div>
			</template>
		</UModal>
	</div>
</template>
<script setup>
import { Button } from '~/components/ui/button';

const toast = useToast();

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
		const invoiceProjectFilter = { projects: { projects_id: { _eq: props.project.id } } };
		const [tickets, tasks, invoices] = await Promise.all([
			ticketItems.list({ fields: ['id', 'status'], filter: projectFilter, limit: 200 }),
			taskItems.list({ fields: ['id', 'completed', 'status'], filter: projectFilter, limit: 200 }),
			invoiceItems.list({ fields: ['id', 'status', 'line_items'], filter: invoiceProjectFilter, limit: 100 }),
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

// Uses getFriendlyDateThree from utils/dates.ts
const formatDate = (dateStr) => getFriendlyDateThree(dateStr);

onMounted(() => {
	loadStats();
	loadStatusUpdates();
});

// Timeline wizard state
const showTimelineWizard = ref(false);

const eventTabs = [
	{ slot: 'timeline', label: 'Timeline', icon: 'i-heroicons-chart-bar' },
	{ slot: 'list', label: 'List', icon: 'i-heroicons-list-bullet' },
];

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

// Uses getFriendlyDateTwo from utils/dates.ts
const formatEventDate = (dateStr) => getFriendlyDateTwo(dateStr);

// Event detail sheet
const showEventDetail = ref(false);
const selectedEventFull = ref(null);
const loadingEventDetail = ref(false);
const eventDetailRef = ref(null);
const eventStatusOptions = ['Scheduled', 'Active', 'Completed'];
const { updateEvent, deleteEvent } = useProjectTimeline();

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

const handleEventStatusChange = async (e) => {
	if (!selectedEventFull.value) return;
	try {
		await updateEvent(selectedEventFull.value.id, { status: e.newStatus });
		selectedEventFull.value.status = e.newStatus;
		emit('eventCreated');
	} catch (err) {
		console.error('Error updating event status:', err);
	}
};

const handleDeleteEvent = async () => {
	if (!selectedEventFull.value) return;
	if (!confirm('Are you sure you want to delete this event? This cannot be undone.')) return;
	try {
		await deleteEvent(selectedEventFull.value.id);
		closeEventDetail();
		emit('eventCreated');
		toast.add({ title: 'Event deleted', color: 'green' });
	} catch (err) {
		toast.add({ title: 'Failed to delete event', color: 'red' });
	}
};

// ── Approval functions ──
const approvingEvent = ref(false);
const generatingLink = ref(false);

const approveEvent = async (event) => {
	approvingEvent.value = true;
	try {
		await eventItems.update(event.id, {
			approval: 'Approved',
			approved_at: new Date().toISOString(),
		});
		event.approval = 'Approved';
		event.approved_at = new Date().toISOString();
		toast.add({ title: 'Event approved', color: 'green' });
		emit('eventCreated'); // refresh parent
	} catch (err) {
		console.error('Error approving event:', err);
		toast.add({ title: 'Failed to approve event', color: 'red' });
	} finally {
		approvingEvent.value = false;
	}
};

const generateApprovalLink = async (event) => {
	generatingLink.value = true;
	try {
		const result = await $fetch('/api/projects/generate-approval-link', {
			method: 'POST',
			body: { eventId: event.id },
		});
		const link = `${window.location.origin}/approve/${result.token}`;
		await navigator.clipboard.writeText(link);
		toast.add({ title: 'Approval link copied to clipboard', color: 'green' });
	} catch (err) {
		console.error('Error generating approval link:', err);
		toast.add({ title: 'Failed to generate link', color: 'red' });
	} finally {
		generatingLink.value = false;
	}
};
</script>

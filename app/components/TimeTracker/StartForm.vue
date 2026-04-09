<template>
	<div class="ios-card rounded-2xl border border-border bg-card p-5 space-y-4">
		<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			Start Timer
		</h3>

		<form @submit.prevent="handleStart" class="space-y-4">
			<!-- Description -->
			<div>
				<input
					v-model="form.description"
					type="text"
					placeholder="What are you working on?"
					class="w-full rounded-md border bg-background px-3 py-2 text-sm"
				/>
			</div>

			<!-- Client + Project -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="block text-xs font-medium text-muted-foreground mb-1">Client</label>
					<select
						v-model="form.client"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm"
					>
						<option :value="null">No client</option>
						<option
							v-for="client in clients"
							:key="client.value"
							:value="client.value"
						>
							{{ client.label }}
						</option>
					</select>
				</div>
				<div>
					<label class="block text-xs font-medium text-muted-foreground mb-1">Project</label>
					<select
						v-model="form.project"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm"
					>
						<option :value="null">No project</option>
						<option
							v-for="project in projectOptions"
							:key="project.id"
							:value="project.id"
						>
							{{ project.title }}
						</option>
					</select>
				</div>
			</div>

			<!-- Ticket + Task -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="block text-xs font-medium text-muted-foreground mb-1">Ticket</label>
					<select
						v-model="form.ticket"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm"
					>
						<option :value="null">No ticket</option>
						<option
							v-for="ticket in ticketOptions"
							:key="ticket.id"
							:value="ticket.id"
						>
							{{ ticket.title }}
						</option>
					</select>
				</div>
				<div>
					<label class="block text-xs font-medium text-muted-foreground mb-1">Task</label>
					<select
						v-model="form.task"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm"
					>
						<option :value="null">No task</option>
						<option
							v-for="task in taskOptions"
							:key="task.id"
							:value="task.id"
						>
							{{ task.title }}
						</option>
					</select>
				</div>
			</div>

			<!-- Billable + Rate -->
			<div class="grid grid-cols-2 gap-3">
				<div class="flex items-end pb-0.5">
					<label class="flex items-center gap-2 cursor-pointer">
						<Switch
							v-model="form.billable"
						/>
						<span class="text-sm font-medium text-foreground">Billable</span>
					</label>
				</div>
				<div v-if="form.billable">
					<label class="block text-xs font-medium text-muted-foreground mb-1">Hourly Rate</label>
					<input
						v-model.number="form.hourly_rate"
						type="number"
						min="0"
						step="0.01"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm"
						placeholder="0.00"
					/>
				</div>
			</div>

			<!-- Start button -->
			<Button type="submit" class="w-full" :disabled="starting">
				<Icon name="lucide:play" class="w-4 h-4" />
				{{ starting ? 'Starting...' : 'Start Timer' }}
			</Button>
		</form>
	</div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';

const emit = defineEmits<{
	started: [];
}>();

const { startTimer } = useTimeTracker();
const { getClientOptions, selectedClient } = useClients();
const { selectedOrg, getOrganizationFilter, currentOrg } = useOrganization();

const starting = ref(false);
const clients = ref<{ label: string; value: string }[]>([]);
const projectOptions = ref<{ id: string; title: string }[]>([]);
const ticketOptions = ref<{ id: string; title: string }[]>([]);
const taskOptions = ref<{ id: string; title: string }[]>([]);

// Auto-select client from header (skip 'org' sentinel value)
const initialClient = computed(() => {
	const c = selectedClient.value;
	return c && c !== 'org' ? c : null;
});

const defaultRate = computed(() => currentOrg.value?.default_hourly_rate || null);

const form = reactive({
	description: '',
	client: initialClient.value as string | null,
	project: null as string | null,
	ticket: null as string | null,
	task: null as string | null,
	billable: true,
	hourly_rate: null as number | null,
});

// Auto-populate hourly rate from org default when it becomes available
watch(defaultRate, (rate) => {
	if (rate && !form.hourly_rate) {
		form.hourly_rate = rate;
	}
}, { immediate: true });

// Load client options
const projectItems = useDirectusItems('projects');
const ticketItems = useDirectusItems('tickets');
const taskItems = useDirectusItems('tasks');

async function loadClients() {
	try {
		clients.value = await getClientOptions();
	} catch {
		clients.value = [];
	}
}

// ── Load projects: by client if selected, otherwise internal org projects ──
watch(
	() => form.client,
	async (clientId) => {
		form.project = null;
		form.ticket = null;
		form.task = null;
		ticketOptions.value = [];
		taskOptions.value = [];

		try {
			const filter: any = { status: { _in: ['Pending', 'Scheduled', 'In Progress'] } };
			if (clientId) {
				filter.client = { _eq: clientId };
			} else {
				// Internal org projects (no client)
				const orgFilter = getOrganizationFilter();
				if (orgFilter?.organization) {
					filter.organization = orgFilter.organization;
				}
				filter.client = { _null: true };
			}

			const data = await projectItems.list({
				fields: ['id', 'title'],
				filter,
				sort: ['title'],
				limit: -1,
			});
			projectOptions.value = data;
		} catch {
			projectOptions.value = [];
		}
	},
	{ immediate: true },
);

// ── Load tickets: by project if selected, by client if selected, otherwise org tickets ──
watch(
	[() => form.client, () => form.project],
	async ([clientId, projectId]) => {
		form.ticket = null;

		try {
			const filter: any = { status: { _nin: ['Completed'] } };

			if (projectId) {
				filter.project = { _eq: projectId };
			} else if (clientId) {
				filter.client = { _eq: clientId };
			} else {
				const orgFilter = getOrganizationFilter();
				if (orgFilter?.organization) {
					filter.organization = orgFilter.organization;
				}
			}

			const data = await ticketItems.list({
				fields: ['id', 'title'],
				filter,
				sort: ['title'],
				limit: 50,
			});
			ticketOptions.value = data;
		} catch {
			ticketOptions.value = [];
		}
	},
	{ immediate: true },
);

// ── Load tasks: by ticket, by project, or org-level quick tasks ──
watch(
	[() => form.client, () => form.project, () => form.ticket],
	async ([clientId, projectId, ticketId]) => {
		form.task = null;

		try {
			const filter: any = { status: { _nin: ['completed'] } };

			if (ticketId) {
				filter.ticket_id = { _eq: ticketId };
			} else if (projectId) {
				filter.project_id = { _eq: projectId };
			} else if (clientId) {
				filter.client_id = { _eq: clientId };
			} else {
				const orgFilter = getOrganizationFilter();
				if (orgFilter?.organization) {
					filter.organization_id = orgFilter.organization;
				}
			}

			const data = await taskItems.list({
				fields: ['id', 'title'],
				filter,
				sort: ['title'],
				limit: 50,
			});
			taskOptions.value = data;
		} catch {
			taskOptions.value = [];
		}
	},
	{ immediate: true },
);

async function handleStart() {
	starting.value = true;
	try {
		await startTimer({
			description: form.description || undefined,
			client: form.client,
			project: form.project,
			ticket: form.ticket,
			task: form.task,
			billable: form.billable,
			hourly_rate: form.billable ? form.hourly_rate : null,
		});

		// Reset form
		form.description = '';
		form.client = null;
		form.project = null;
		form.ticket = null;
		form.task = null;
		form.billable = true;
		form.hourly_rate = defaultRate.value;

		emit('started');
	} catch (error) {
		console.error('Failed to start timer:', error);
	} finally {
		starting.value = false;
	}
}

// Refresh all dropdown options (called when form becomes visible)
async function refreshOptions() {
	await loadClients();
	// Auto-populate hourly rate from org default if not already set
	if (!form.hourly_rate && defaultRate.value) {
		form.hourly_rate = defaultRate.value;
	}
	const clientId = form.client;
	const projectId = form.project;
	const ticketId = form.ticket;

	try {
		// Reload projects
		const projFilter: any = { status: { _in: ['Pending', 'Scheduled', 'In Progress'] } };
		if (clientId) {
			projFilter.client = { _eq: clientId };
		} else {
			const orgFilter = getOrganizationFilter();
			if (orgFilter?.organization) projFilter.organization = orgFilter.organization;
			projFilter.client = { _null: true };
		}
		projectOptions.value = await projectItems.list({ fields: ['id', 'title'], filter: projFilter, sort: ['title'], limit: -1 });
	} catch { projectOptions.value = []; }

	try {
		// Reload tickets
		const tickFilter: any = { status: { _nin: ['Completed'] } };
		if (projectId) tickFilter.project = { _eq: projectId };
		else if (clientId) tickFilter.client = { _eq: clientId };
		else {
			const orgFilter = getOrganizationFilter();
			if (orgFilter?.organization) tickFilter.organization = orgFilter.organization;
		}
		ticketOptions.value = await ticketItems.list({ fields: ['id', 'title'], filter: tickFilter, sort: ['title'], limit: 50 });
	} catch { ticketOptions.value = []; }

	try {
		// Reload tasks
		const taskFilter: any = { status: { _nin: ['completed'] } };
		if (ticketId) taskFilter.ticket_id = { _eq: ticketId };
		else if (projectId) taskFilter.project_id = { _eq: projectId };
		else if (clientId) taskFilter.client_id = { _eq: clientId };
		else {
			const orgFilter = getOrganizationFilter();
			if (orgFilter?.organization) taskFilter.organization_id = orgFilter.organization;
		}
		taskOptions.value = await taskItems.list({ fields: ['id', 'title'], filter: taskFilter, sort: ['title'], limit: 50 });
	} catch { taskOptions.value = []; }
}

// Sync form client when header client changes
watch(initialClient, (newClient) => {
	form.client = newClient;
});

onMounted(() => {
	refreshOptions();
});

// Re-fetch options each time the component is activated (e.g. modal reopened)
onActivated(() => {
	refreshOptions();
});

defineExpose({ refreshOptions });
</script>

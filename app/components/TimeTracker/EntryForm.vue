<template>
	<Teleport to="body">
		<Transition name="modal">
			<div
				v-if="show"
				class="fixed inset-0 z-50 flex items-center justify-center p-4"
			>
				<!-- Backdrop -->
				<div
					class="absolute inset-0 bg-black/50 backdrop-blur-sm"
					@click="emit('cancel')"
				/>

				<!-- Modal content -->
				<div class="relative w-full max-w-lg ios-card rounded-2xl border border-border bg-card p-6 shadow-xl space-y-5">
					<div class="flex items-center justify-between">
						<h3 class="text-base font-semibold text-foreground">
							{{ entry ? 'Edit Time Entry' : 'Add Manual Entry' }}
						</h3>
						<Button variant="ghost" size="icon-sm" @click="emit('cancel')">
							<Icon name="lucide:x" class="w-4 h-4" />
						</Button>
					</div>

					<form @submit.prevent="handleSave" class="space-y-4">
						<!-- Date + Duration row -->
						<div class="grid grid-cols-3 gap-3">
							<div>
								<label class="block text-xs font-medium text-muted-foreground mb-1">Date</label>
								<input
									v-model="form.date"
									type="date"
									required
									class="w-full rounded-md border bg-background px-3 py-2 text-sm"
								/>
							</div>
							<div>
								<label class="block text-xs font-medium text-muted-foreground mb-1">Hours</label>
								<input
									v-model.number="form.hours"
									type="number"
									min="0"
									max="24"
									step="1"
									class="w-full rounded-md border bg-background px-3 py-2 text-sm"
									placeholder="0"
								/>
							</div>
							<div>
								<label class="block text-xs font-medium text-muted-foreground mb-1">Minutes</label>
								<input
									v-model.number="form.minutes"
									type="number"
									min="0"
									max="59"
									step="5"
									class="w-full rounded-md border bg-background px-3 py-2 text-sm"
									placeholder="0"
								/>
							</div>
						</div>

						<!-- Description -->
						<div>
							<label class="block text-xs font-medium text-muted-foreground mb-1">Description</label>
							<textarea
								v-model="form.description"
								rows="2"
								class="w-full rounded-md border bg-background px-3 py-2 text-sm"
								placeholder="What did you work on?"
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

						<!-- Actions -->
						<div class="flex justify-end gap-2 pt-2">
							<Button type="button" variant="outline" @click="emit('cancel')">
								Cancel
							</Button>
							<Button type="submit" :disabled="saving || totalMinutes <= 0">
								{{ saving ? 'Saving...' : (entry ? 'Update Entry' : 'Save Entry') }}
							</Button>
						</div>
					</form>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import type { TimeEntry } from '~~/shared/directus';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';

const props = defineProps<{
	entry?: TimeEntry | null;
	show: boolean;
}>();

const emit = defineEmits<{
	save: [entry: TimeEntry];
	cancel: [];
}>();

const { createManualEntry, updateTimeEntry } = useTimeTracker();
const { getClientOptions, selectedClient } = useClients();
const { getOrganizationFilter, currentOrg } = useOrganization();

const defaultRate = computed(() => currentOrg.value?.default_hourly_rate || null);

// Auto-select client from header (skip 'org' sentinel value)
const headerClient = computed(() => {
	const c = selectedClient.value;
	return c && c !== 'org' ? c : null;
});

const saving = ref(false);
const clients = ref<{ label: string; value: string }[]>([]);
const projectOptions = ref<{ id: string; title: string }[]>([]);
const ticketOptions = ref<{ id: string; title: string }[]>([]);
const taskOptions = ref<{ id: string; title: string }[]>([]);

const projectItems = useDirectusItems('projects');
const ticketItems = useDirectusItems('tickets');
const taskItems = useDirectusItems('tasks');

const form = reactive({
	date: new Date().toISOString().split('T')[0],
	hours: 0,
	minutes: 0,
	description: '',
	client: null as string | null,
	project: null as string | null,
	ticket: null as string | null,
	task: null as string | null,
	billable: true,
	hourly_rate: null as number | null,
});

const totalMinutes = computed(() => (form.hours || 0) * 60 + (form.minutes || 0));

// Populate form when editing
watch(
	() => props.entry,
	(entry) => {
		if (entry) {
			form.date = entry.date || new Date().toISOString().split('T')[0];
			const minutes = entry.duration_minutes || 0;
			form.hours = Math.floor(minutes / 60);
			form.minutes = minutes % 60;
			form.description = entry.description || '';
			form.client = typeof entry.client === 'object' ? entry.client?.id || null : entry.client || null;
			form.project = typeof entry.project === 'object' ? entry.project?.id || null : entry.project || null;
			form.ticket = typeof entry.ticket === 'object' ? entry.ticket?.id || null : entry.ticket || null;
			form.task = typeof entry.task === 'object' ? entry.task?.id || null : entry.task || null;
			form.billable = !!entry.billable;
			form.hourly_rate = entry.hourly_rate ?? null;
		} else {
			form.date = new Date().toISOString().split('T')[0];
			form.hours = 0;
			form.minutes = 0;
			form.description = '';
			form.client = headerClient.value;
			form.project = null;
			form.ticket = null;
			form.task = null;
			form.billable = true;
			form.hourly_rate = defaultRate.value;
		}
	},
	{ immediate: true },
);

// Load client options
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
		if (!props.entry) {
			form.project = null;
		}
		form.ticket = null;
		form.task = null;
		ticketOptions.value = [];
		taskOptions.value = [];

		try {
			const filter: any = { status: { _in: ['Pending', 'Scheduled', 'In Progress'] } };
			if (clientId) {
				filter.client = { _eq: clientId };
			} else {
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
);

// ── Load tickets: by project, by client, or org-level ──
watch(
	[() => form.client, () => form.project],
	async ([clientId, projectId]) => {
		if (!props.entry) {
			form.ticket = null;
		}

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
);

// ── Load tasks: by ticket, by project, by client, or org-level ──
watch(
	[() => form.client, () => form.project, () => form.ticket],
	async ([clientId, projectId, ticketId]) => {
		if (!props.entry) {
			form.task = null;
		}

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
);

async function handleSave() {
	saving.value = true;
	try {
		let result: TimeEntry;

		if (props.entry) {
			result = await updateTimeEntry(props.entry.id, {
				date: form.date,
				duration_minutes: totalMinutes.value,
				description: form.description || null,
				client: form.client || null,
				project: form.project || null,
				ticket: form.ticket || null,
				task: form.task || null,
				billable: form.billable,
				hourly_rate: form.billable ? form.hourly_rate : null,
			} as Partial<TimeEntry>);
		} else {
			result = await createManualEntry({
				date: form.date,
				duration_minutes: totalMinutes.value,
				description: form.description || undefined,
				client: form.client,
				project: form.project,
				ticket: form.ticket,
				task: form.task,
				billable: form.billable,
				hourly_rate: form.billable ? form.hourly_rate : null,
			});
		}

		emit('save', result);
	} catch (error) {
		console.error('Failed to save time entry:', error);
	} finally {
		saving.value = false;
	}
}

// Refresh all options when form becomes visible
watch(
	() => props.show,
	async (visible) => {
		if (visible) {
			await loadClients();
			// Re-fetch dependent options based on current form values
			const clientId = form.client;
			const projectId = form.project;
			const ticketId = form.ticket;

			try {
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
	},
	{ immediate: true },
);
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
	transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
	opacity: 0;
}
</style>

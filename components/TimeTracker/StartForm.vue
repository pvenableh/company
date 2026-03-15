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

			<!-- Ticket + Billable -->
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
				<div class="flex items-end pb-0.5">
					<label class="flex items-center gap-2 cursor-pointer">
						<Switch
							:checked="form.billable"
							@update:checked="form.billable = $event"
						/>
						<span class="text-sm font-medium text-foreground">Billable</span>
					</label>
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

const starting = ref(false);
const clients = ref<{ label: string; value: string }[]>([]);
const projectOptions = ref<{ id: string; title: string }[]>([]);
const ticketOptions = ref<{ id: string; title: string }[]>([]);

// Auto-select client from header (skip 'org' sentinel value)
const initialClient = computed(() => {
	const c = selectedClient.value;
	return c && c !== 'org' ? c : null;
});

const form = reactive({
	description: '',
	client: initialClient.value as string | null,
	project: null as string | null,
	ticket: null as string | null,
	billable: true,
});

// Load client options
const projectItems = useDirectusItems('projects');
const ticketItems = useDirectusItems('tickets');

async function loadClients() {
	try {
		clients.value = await getClientOptions();
	} catch {
		clients.value = [];
	}
}

// Load projects when client changes
watch(
	() => form.client,
	async (clientId) => {
		form.project = null;
		form.ticket = null;
		ticketOptions.value = [];

		if (!clientId) {
			projectOptions.value = [];
			return;
		}

		try {
			const data = await projectItems.list({
				fields: ['id', 'title'],
				filter: { client: { _eq: clientId }, status: { _in: ['active', 'in_progress'] } },
				sort: ['title'],
				limit: -1,
			});
			projectOptions.value = data;
		} catch {
			projectOptions.value = [];
		}
	},
);

// Load tickets when project changes
watch(
	() => form.project,
	async (projectId) => {
		form.ticket = null;

		if (!projectId) {
			ticketOptions.value = [];
			return;
		}

		try {
			const data = await ticketItems.list({
				fields: ['id', 'title'],
				filter: { project: { _eq: projectId }, status: { _nin: ['completed', 'archived'] } },
				sort: ['title'],
				limit: -1,
			});
			ticketOptions.value = data;
		} catch {
			ticketOptions.value = [];
		}
	},
);

async function handleStart() {
	starting.value = true;
	try {
		await startTimer({
			description: form.description || undefined,
			client: form.client,
			project: form.project,
			ticket: form.ticket,
			billable: form.billable,
		});

		// Reset form
		form.description = '';
		form.client = null;
		form.project = null;
		form.ticket = null;
		form.billable = true;

		emit('started');
	} catch (error) {
		console.error('Failed to start timer:', error);
	} finally {
		starting.value = false;
	}
}

// Sync form client when header client changes
watch(initialClient, (newClient) => {
	form.client = newClient;
});

onMounted(() => {
	loadClients();
});
</script>

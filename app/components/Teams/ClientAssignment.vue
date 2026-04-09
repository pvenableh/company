<template>
	<div class="client-assignment">
		<div class="flex items-center justify-between mb-3">
			<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assigned Clients</h3>
			<button
				v-if="canManage"
				class="text-xs text-primary hover:underline"
				@click="showPicker = !showPicker"
			>
				{{ showPicker ? 'Done' : '+ Assign' }}
			</button>
		</div>

		<!-- Assigned clients list -->
		<div v-if="assignedClients.length" class="space-y-1.5">
			<div
				v-for="client in assignedClients"
				:key="client.id"
				class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 group"
			>
				<div class="size-6 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
					<img
						v-if="getClientLogo(client)"
						:src="getClientLogo(client)"
						:alt="client.name"
						class="size-6 object-cover rounded-full"
					/>
					<span v-else class="text-[8px] font-semibold text-muted-foreground">{{ getInitials(client) }}</span>
				</div>
				<span class="text-sm flex-1">{{ client.name }}</span>
				<button
					v-if="canManage"
					class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
					@click="removeAssignment(client.id)"
				>
					<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
		<div v-else class="text-xs text-muted-foreground/60 py-3 text-center">
			No clients assigned to this team
		</div>

		<!-- Client picker -->
		<div v-if="showPicker && canManage" class="mt-3 space-y-2">
			<input
				v-model="searchQuery"
				type="text"
				placeholder="Search clients..."
				class="w-full h-8 rounded-lg border border-border bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
			/>
			<div class="max-h-40 overflow-y-auto space-y-1">
				<button
					v-for="client in availableClients"
					:key="client.id"
					class="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg hover:bg-muted/30 transition-colors text-sm"
					@click="addAssignment(client.id)"
				>
					<UIcon name="i-heroicons-plus-circle" class="w-4 h-4 text-primary/60 flex-shrink-0" />
					<span>{{ client.name }}</span>
				</button>
				<div v-if="!availableClients.length" class="text-xs text-muted-foreground text-center py-2">
					{{ searchQuery ? 'No matching clients' : 'All clients assigned' }}
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	teamId: string;
	canManage?: boolean;
}>();

const config = useRuntimeConfig();
const clientTeamsItems = useDirectusItems('clients_teams');
const clientItems = useDirectusItems('clients');
const { selectedOrg } = useOrganization();

const showPicker = ref(false);
const searchQuery = ref('');
const assignedClients = ref<any[]>([]);
const allOrgClients = ref<any[]>([]);
const loading = ref(false);

// Fetch assigned clients for this team
async function fetchAssignedClients() {
	if (!props.teamId) return;
	loading.value = true;
	try {
		const junctions = await clientTeamsItems.list({
			filter: { teams_id: { _eq: props.teamId } },
			fields: ['id', 'clients_id.id', 'clients_id.name', 'clients_id.logo', 'clients_id.status'],
			limit: -1,
		});
		assignedClients.value = junctions
			.map((j: any) => j.clients_id)
			.filter((c: any) => c && c.status === 'active');
	} catch (err) {
		console.error('Failed to fetch assigned clients:', err);
		assignedClients.value = [];
	} finally {
		loading.value = false;
	}
}

// Fetch all org clients for the picker
async function fetchAllOrgClients() {
	if (!selectedOrg.value) return;
	try {
		const data = await clientItems.list({
			filter: {
				_and: [
					{ status: { _eq: 'active' } },
					{ organization: { _eq: selectedOrg.value } },
				],
			},
			fields: ['id', 'name', 'logo'],
			sort: ['name'],
			limit: -1,
		});
		allOrgClients.value = data;
	} catch (err) {
		console.error('Failed to fetch org clients:', err);
	}
}

// Available clients = all org clients minus already assigned
const availableClients = computed(() => {
	const assignedIds = new Set(assignedClients.value.map((c: any) => c.id));
	let filtered = allOrgClients.value.filter((c: any) => !assignedIds.has(c.id));
	if (searchQuery.value) {
		const q = searchQuery.value.toLowerCase();
		filtered = filtered.filter((c: any) => c.name?.toLowerCase().includes(q));
	}
	return filtered;
});

async function addAssignment(clientId: string) {
	try {
		await clientTeamsItems.create({
			clients_id: clientId,
			teams_id: props.teamId,
		});
		await fetchAssignedClients();
	} catch (err) {
		console.error('Failed to assign client:', err);
	}
}

async function removeAssignment(clientId: string) {
	try {
		// Find the junction record
		const junctions = await clientTeamsItems.list({
			filter: {
				_and: [
					{ clients_id: { _eq: clientId } },
					{ teams_id: { _eq: props.teamId } },
				],
			},
			fields: ['id'],
			limit: 1,
		});
		if (junctions.length > 0) {
			await clientTeamsItems.remove(junctions[0].id);
			await fetchAssignedClients();
		}
	} catch (err) {
		console.error('Failed to remove client assignment:', err);
	}
}

function getClientLogo(client: any) {
	if (!client?.logo) return null;
	const assetId = typeof client.logo === 'object' ? client.logo.id : client.logo;
	if (!assetId) return null;
	return `${config.public.directusUrl}/assets/${assetId}?key=avatar`;
}

function getInitials(client: any) {
	if (!client?.name) return '';
	return client.name
		.split(' ')
		.map((w: string) => w[0])
		.join('')
		.toUpperCase()
		.substring(0, 2);
}

onMounted(() => {
	fetchAssignedClients();
	fetchAllOrgClients();
});

watch(() => props.teamId, () => {
	fetchAssignedClients();
});
</script>

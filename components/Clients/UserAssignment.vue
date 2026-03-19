<template>
	<div class="user-assignment">
		<div class="flex items-center justify-between mb-3">
			<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assigned Users</h3>
			<button
				v-if="canManage"
				class="text-xs text-primary hover:underline"
				@click="showPicker = !showPicker"
			>
				{{ showPicker ? 'Done' : '+ Assign' }}
			</button>
		</div>

		<!-- Assigned users list -->
		<div v-if="assignedUsers.length" class="space-y-1.5">
			<div
				v-for="u in assignedUsers"
				:key="u.id"
				class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 group"
			>
				<div class="size-6 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
					<img
						v-if="getAvatarUrl(u)"
						:src="getAvatarUrl(u)"
						:alt="u.first_name"
						class="size-6 object-cover rounded-full"
					/>
					<span v-else class="text-[8px] font-semibold text-muted-foreground">{{ getUserInitials(u) }}</span>
				</div>
				<div class="flex-1 min-w-0">
					<span class="text-sm block truncate">{{ u.first_name }} {{ u.last_name }}</span>
					<span v-if="u.email" class="text-[10px] text-muted-foreground/60 block truncate">{{ u.email }}</span>
				</div>
				<button
					v-if="canManage"
					class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
					@click="removeAssignment(u.id)"
				>
					<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
		<div v-else class="text-xs text-muted-foreground/60 py-3 text-center">
			No individual user overrides
		</div>

		<!-- User picker -->
		<div v-if="showPicker && canManage" class="mt-3 space-y-2">
			<input
				v-model="searchQuery"
				type="text"
				placeholder="Search users..."
				class="w-full h-8 rounded-lg border border-border bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
			/>
			<div class="max-h-40 overflow-y-auto space-y-1">
				<button
					v-for="u in availableUsers"
					:key="u.id"
					class="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg hover:bg-muted/30 transition-colors text-sm"
					@click="addAssignment(u.id)"
				>
					<UIcon name="i-heroicons-plus-circle" class="w-4 h-4 text-primary/60 flex-shrink-0" />
					<span>{{ u.first_name }} {{ u.last_name }}</span>
				</button>
				<div v-if="!availableUsers.length" class="text-xs text-muted-foreground text-center py-2">
					{{ searchQuery ? 'No matching users' : 'All org users assigned' }}
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	clientId: string;
	canManage?: boolean;
}>();

const config = useRuntimeConfig();
const clientUsersItems = useDirectusItems('clients_directus_users');
const { selectedOrg } = useOrganization();

const showPicker = ref(false);
const searchQuery = ref('');
const assignedUsers = ref<any[]>([]);
const allOrgUsers = ref<any[]>([]);
const loading = ref(false);

// Fetch users assigned to this client
async function fetchAssignedUsers() {
	if (!props.clientId) return;
	loading.value = true;
	try {
		const junctions = await clientUsersItems.list({
			filter: { clients_id: { _eq: props.clientId } },
			fields: ['id', 'directus_users_id.id', 'directus_users_id.first_name', 'directus_users_id.last_name', 'directus_users_id.email', 'directus_users_id.avatar'],
			limit: -1,
		});
		assignedUsers.value = junctions
			.map((j: any) => j.directus_users_id)
			.filter((u: any) => u);
	} catch (err) {
		console.error('Failed to fetch assigned users:', err);
		assignedUsers.value = [];
	} finally {
		loading.value = false;
	}
}

// Fetch all org users for the picker (uses readUsers which has proper permissions)
async function fetchAllOrgUsers() {
	if (!selectedOrg.value) return;
	try {
		const { readUsers } = useDirectusUsers();
		const data = await readUsers({
			filter: {
				organizations: {
					organizations_id: {
						id: { _eq: selectedOrg.value },
					},
				},
			},
			fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
			sort: ['first_name'],
		});
		allOrgUsers.value = data;
	} catch (err) {
		console.error('Failed to fetch org users:', err);
	}
}

// Available users = all org users minus already assigned
const availableUsers = computed(() => {
	const assignedIds = new Set(assignedUsers.value.map((u: any) => u.id));
	let filtered = allOrgUsers.value.filter((u: any) => !assignedIds.has(u.id));
	if (searchQuery.value) {
		const q = searchQuery.value.toLowerCase();
		filtered = filtered.filter((u: any) => {
			const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
			return name.includes(q) || u.email?.toLowerCase().includes(q);
		});
	}
	return filtered;
});

async function addAssignment(userId: string) {
	try {
		await clientUsersItems.create({
			clients_id: props.clientId,
			directus_users_id: userId,
		});
		await fetchAssignedUsers();
	} catch (err) {
		console.error('Failed to assign user:', err);
	}
}

async function removeAssignment(userId: string) {
	try {
		const junctions = await clientUsersItems.list({
			filter: {
				_and: [
					{ clients_id: { _eq: props.clientId } },
					{ directus_users_id: { _eq: userId } },
				],
			},
			fields: ['id'],
			limit: 1,
		});
		if (junctions.length > 0) {
			await clientUsersItems.remove(junctions[0].id);
			await fetchAssignedUsers();
		}
	} catch (err) {
		console.error('Failed to remove user assignment:', err);
	}
}

function getAvatarUrl(user: any) {
	if (!user?.avatar) return null;
	const avatarId = typeof user.avatar === 'object' ? user.avatar.id : user.avatar;
	if (!avatarId) return null;
	return `${config.public.directusUrl}/assets/${avatarId}?key=avatar`;
}

function getUserInitials(user: any) {
	const first = user?.first_name?.[0] || '';
	const last = user?.last_name?.[0] || '';
	return (first + last).toUpperCase() || '?';
}

onMounted(() => {
	fetchAssignedUsers();
	fetchAllOrgUsers();
});

watch(() => props.clientId, () => {
	fetchAssignedUsers();
});
</script>

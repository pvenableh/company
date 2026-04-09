<template>
	<div class="container mx-auto py-6 px-4">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h2 class="text-2xl font-semibold">Roles & Permissions</h2>
				<p class="text-sm t-text-secondary mt-1">Manage what each role can access in this organization</p>
			</div>
		</div>

		<!-- No org selected -->
		<UAlert
			v-if="!selectedOrg"
			class="mb-6"
			title="No Organization Selected"
			description="Please select an organization from the global header to manage roles."
			color="blue"
		/>

		<!-- Loading -->
		<div v-else-if="loading" class="flex justify-center py-12">
			<UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
		</div>

		<!-- No roles found -->
		<UCard v-else-if="!roles.length" class="mb-6 text-center py-8">
			<UIcon name="i-heroicons-shield-check" class="mx-auto h-12 w-12 text-gray-300 mb-4" />
			<h3 class="text-lg font-medium mb-2">No Roles Found</h3>
			<p class="t-text-secondary mb-4">Seed the default roles for this organization to get started.</p>
			<UButton color="primary" :loading="seeding" @click="seedRoles"> Seed Default Roles </UButton>
		</UCard>

		<!-- Roles + Permission Matrix -->
		<div v-else>
			<!-- Role Cards -->
			<div class="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
				<button
					v-for="role in roles"
					:key="role.id"
					class="p-4 rounded-lg border-2 transition-all text-left"
					:class="
						selectedRole?.id === role.id
							? 'border-primary bg-primary/5'
							: 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
					"
					@click="selectRole(role)"
				>
					<div class="flex items-center gap-2 mb-1">
						<span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: getRoleColor(role.slug) }" />
						<span class="font-medium text-sm">{{ role.name }}</span>
					</div>
					<p class="text-xs t-text-secondary">{{ getRoleDescription(role.slug) }}</p>
					<div class="mt-2 text-xs t-text-muted">
						{{ getMemberCount(role.id) }} member{{ getMemberCount(role.id) === 1 ? '' : 's' }}
					</div>
				</button>
			</div>

			<!-- Permission Matrix for Selected Role -->
			<UCard v-if="selectedRole" class="overflow-hidden">
				<template #header>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<span
								class="w-3 h-3 rounded-full"
								:style="{ backgroundColor: getRoleColor(selectedRole.slug) }"
							/>
							<h3 class="text-lg font-semibold">{{ selectedRole.name }} Permissions</h3>
						</div>
						<div class="flex items-center gap-2">
							<UButton
								v-if="hasChanges"
								variant="outline"
								size="sm"
								@click="resetChanges"
							>
								Reset
							</UButton>
							<UButton
								v-if="hasChanges"
								color="primary"
								size="sm"
								:loading="saving"
								@click="savePermissions"
							>
								Save Changes
							</UButton>
						</div>
					</div>
				</template>

				<!-- Owner/Admin notice -->
				<div
					v-if="selectedRole.slug === 'owner' || selectedRole.slug === 'admin'"
					class="mb-4 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm"
				>
					<Icon name="heroicons:information-circle" class="inline w-4 h-4 mr-1" />
					{{ selectedRole.slug === 'owner' ? 'Owners' : 'Admins' }} have full access to all features.
					Permissions cannot be customized for this role.
				</div>

				<!-- Permission Table -->
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b t-border">
								<th class="text-left py-3 px-4 font-medium t-text-secondary w-48">Feature</th>
								<th class="text-center py-3 px-2 font-medium t-text-secondary w-20">Access</th>
								<th class="text-center py-3 px-2 font-medium t-text-secondary w-20">Create</th>
								<th class="text-center py-3 px-2 font-medium t-text-secondary w-20">Read</th>
								<th class="text-center py-3 px-2 font-medium t-text-secondary w-20">Update</th>
								<th class="text-center py-3 px-2 font-medium t-text-secondary w-20">Delete</th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="feature in featureKeys"
								:key="feature"
								class="border-b t-border last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
							>
								<td class="py-3 px-4 font-medium">{{ featureLabels[feature] }}</td>
								<td class="text-center py-3 px-2">
									<UToggle
										:model-value="getPermission(feature, 'access')"
										:disabled="isReadOnly"
										size="sm"
										@update:model-value="setPermission(feature, 'access', $event)"
									/>
								</td>
								<td class="text-center py-3 px-2">
									<UToggle
										:model-value="getPermission(feature, 'create')"
										:disabled="isReadOnly || !getPermission(feature, 'access')"
										size="sm"
										@update:model-value="setPermission(feature, 'create', $event)"
									/>
								</td>
								<td class="text-center py-3 px-2">
									<UToggle
										:model-value="getPermission(feature, 'read')"
										:disabled="isReadOnly || !getPermission(feature, 'access')"
										size="sm"
										@update:model-value="setPermission(feature, 'read', $event)"
									/>
								</td>
								<td class="text-center py-3 px-2">
									<UToggle
										:model-value="getPermission(feature, 'update')"
										:disabled="isReadOnly || !getPermission(feature, 'access')"
										size="sm"
										@update:model-value="setPermission(feature, 'update', $event)"
									/>
								</td>
								<td class="text-center py-3 px-2">
									<UToggle
										:model-value="getPermission(feature, 'delete')"
										:disabled="isReadOnly || !getPermission(feature, 'access')"
										size="sm"
										@update:model-value="setPermission(feature, 'delete', $event)"
									/>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</UCard>
		</div>
	</div>
</template>

<script setup>
import { FEATURE_KEYS, FEATURE_LABELS, ROLE_METADATA } from '~~/types/permissions';

definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Roles | Earnest' });

const roleItems = useDirectusItems('org_roles');
const membershipItems = useDirectusItems('org_memberships');
const { selectedOrg } = useOrganization();
const toast = useToast();

const roles = ref([]);
const memberCounts = ref({});
const selectedRole = ref(null);
const editedPermissions = ref(null);
const loading = ref(false);
const saving = ref(false);
const seeding = ref(false);

const featureKeys = FEATURE_KEYS;
const featureLabels = FEATURE_LABELS;

// ── Computed ──────────────────────────────────────────────────────────────────
const isReadOnly = computed(() => {
	if (!selectedRole.value) return true;
	return selectedRole.value.slug === 'owner' || selectedRole.value.slug === 'admin';
});

const hasChanges = computed(() => {
	if (!selectedRole.value || !editedPermissions.value) return false;
	return JSON.stringify(editedPermissions.value) !== JSON.stringify(selectedRole.value.permissions);
});

// ── Role helpers ──────────────────────────────────────────────────────────────
function getRoleColor(slug) {
	return ROLE_METADATA[slug]?.color || '#6B7280';
}

function getRoleDescription(slug) {
	return ROLE_METADATA[slug]?.description || '';
}

function getMemberCount(roleId) {
	return memberCounts.value[roleId] || 0;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchRoles() {
	if (!selectedOrg.value) return;

	loading.value = true;
	try {
		const data = await roleItems.list({
			filter: { organization: { _eq: selectedOrg.value } },
			fields: ['*'],
			sort: ['sort', 'name'],
		});

		// Sort by role hierarchy: owner, admin, manager, member, client
		const order = ['owner', 'admin', 'manager', 'member', 'client'];
		roles.value = data.sort((a, b) => {
			const ai = order.indexOf(a.slug);
			const bi = order.indexOf(b.slug);
			return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
		});

		// Fetch member counts
		await fetchMemberCounts();

		// Auto-select first customizable role
		if (roles.value.length && !selectedRole.value) {
			const firstCustomizable = roles.value.find((r) => r.slug !== 'owner' && r.slug !== 'admin');
			selectRole(firstCustomizable || roles.value[0]);
		}
	} catch (err) {
		console.error('Failed to fetch roles:', err);
		toast.add({ title: 'Error', description: 'Failed to load roles', color: 'red' });
	} finally {
		loading.value = false;
	}
}

async function fetchMemberCounts() {
	if (!selectedOrg.value) return;

	try {
		const memberships = await membershipItems.list({
			filter: {
				organization: { _eq: selectedOrg.value },
				status: { _eq: 'active' },
			},
			fields: ['role'],
			limit: -1,
		});

		const counts = {};
		for (const m of memberships) {
			const roleId = typeof m.role === 'object' ? m.role?.id : m.role;
			if (roleId) counts[roleId] = (counts[roleId] || 0) + 1;
		}
		memberCounts.value = counts;
	} catch {
		// Memberships may not exist yet
	}
}

// ── Role selection ────────────────────────────────────────────────────────────
function selectRole(role) {
	selectedRole.value = role;
	editedPermissions.value = JSON.parse(JSON.stringify(role.permissions || {}));
}

// ── Permission getters/setters ────────────────────────────────────────────────
function getPermission(feature, action) {
	if (!editedPermissions.value?.[feature]) return false;
	if (action === 'access') return editedPermissions.value[feature].access ?? false;
	return editedPermissions.value[feature][action] ?? false;
}

function setPermission(feature, action, value) {
	if (!editedPermissions.value) return;

	if (!editedPermissions.value[feature]) {
		editedPermissions.value[feature] = { access: false, create: false, read: false, update: false, delete: false };
	}

	editedPermissions.value[feature][action] = value;

	// If access is turned off, disable all CRUD
	if (action === 'access' && !value) {
		editedPermissions.value[feature].create = false;
		editedPermissions.value[feature].read = false;
		editedPermissions.value[feature].update = false;
		editedPermissions.value[feature].delete = false;
	}

	// If any CRUD is turned on, ensure access is on
	if (action !== 'access' && value) {
		editedPermissions.value[feature].access = true;
	}
}

// ── Save / Reset ──────────────────────────────────────────────────────────────
async function savePermissions() {
	if (!selectedRole.value || !editedPermissions.value) return;

	saving.value = true;
	try {
		await roleItems.update(selectedRole.value.id, {
			permissions: editedPermissions.value,
		});

		// Update local state
		selectedRole.value.permissions = JSON.parse(JSON.stringify(editedPermissions.value));

		// Update in roles array too
		const idx = roles.value.findIndex((r) => r.id === selectedRole.value.id);
		if (idx !== -1) {
			roles.value[idx].permissions = JSON.parse(JSON.stringify(editedPermissions.value));
		}

		toast.add({ title: 'Saved', description: `${selectedRole.value.name} permissions updated`, color: 'green' });
	} catch (err) {
		console.error('Failed to save permissions:', err);
		toast.add({ title: 'Error', description: 'Failed to save permissions', color: 'red' });
	} finally {
		saving.value = false;
	}
}

function resetChanges() {
	if (selectedRole.value) {
		editedPermissions.value = JSON.parse(JSON.stringify(selectedRole.value.permissions || {}));
	}
}

// ── Seed Roles ────────────────────────────────────────────────────────────────
async function seedRoles() {
	if (!selectedOrg.value) return;

	seeding.value = true;
	try {
		const result = await $fetch('/api/org/seed-roles', {
			method: 'POST',
			body: { organizationId: selectedOrg.value },
		});

		toast.add({ title: 'Success', description: result.message, color: 'green' });
		await fetchRoles();
	} catch (err) {
		console.error('Failed to seed roles:', err);
		toast.add({ title: 'Error', description: 'Failed to seed roles', color: 'red' });
	} finally {
		seeding.value = false;
	}
}

// ── Watch org changes ─────────────────────────────────────────────────────────
watch(() => selectedOrg.value, () => {
	selectedRole.value = null;
	editedPermissions.value = null;
	fetchRoles();
}, { immediate: true });
</script>

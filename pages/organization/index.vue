<script setup>
const organizationItems = useDirectusItems('organizations');
const orgUserJunction = useDirectusItems('organizations_directus_users');
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const { selectedOrg, fetchOrganizationDetails } = useOrganization();
const { filteredUsers, fetchFilteredUsers } = useFilteredUsers();
const { fetchTeams, visibleTeams, loading: teamsLoading, setupStorageListener, hasAdminAccess, ADMIN_ROLE_ID, CLIENT_MANAGER_ROLE_ID } = useTeams();
const config = useRuntimeConfig();
const toast = useToast();

const org = ref(null);
const isLoading = ref(true);

const activeTab = ref(0);

// Define tab items once:
const tabItems = [
	{ slot: 'overview', label: 'Overview', icon: 'i-heroicons-home' },
	{ slot: 'members', label: 'Members', icon: 'i-heroicons-users' },
	{ slot: 'teams', label: 'Teams', icon: 'i-heroicons-user-group' },
];

definePageMeta({
	middleware: ['auth'],
});

// Set up cross-tab synchronization for teams
const cleanup = setupStorageListener();
onUnmounted(() => {
	if (typeof cleanup === 'function') {
		cleanup();
	}
});

// --- Edit Organization ---
const showEditOrgModal = ref(false);
const editForm = ref({
	name: '',
	website: '',
	phone: '',
	notes: '',
	brand_color: '',
});
const savingOrg = ref(false);

const canManageOrg = computed(() => {
	return user.value?.role === ADMIN_ROLE_ID || user.value?.role === CLIENT_MANAGER_ROLE_ID;
});

const openEditModal = () => {
	if (!org.value) return;
	editForm.value = {
		name: org.value.name || '',
		website: org.value.website || '',
		phone: org.value.phone || '',
		notes: org.value.notes || '',
		brand_color: org.value.brand_color || '',
	};
	showEditOrgModal.value = true;
};

const saveOrganization = async () => {
	if (!org.value?.id) return;
	savingOrg.value = true;
	try {
		await organizationItems.update(org.value.id, {
			name: editForm.value.name,
			website: editForm.value.website,
			phone: editForm.value.phone,
			notes: editForm.value.notes,
			brand_color: editForm.value.brand_color,
		});
		toast.add({ title: 'Success', description: 'Organization updated successfully', color: 'green' });
		showEditOrgModal.value = false;
		await fetchOrganizationData();
		// Also refresh the global org data so the sidebar updates
		await fetchOrganizationDetails();
	} catch (error) {
		console.error('Error updating organization:', error);
		toast.add({ title: 'Error', description: 'Failed to update organization', color: 'red' });
	} finally {
		savingOrg.value = false;
	}
};

// --- Invite Member ---
const showInviteModal = ref(false);
const inviteForm = ref({
	email: '',
	role: CLIENT_MANAGER_ROLE_ID,
});
const sendingInvite = ref(false);

const roleOptions = [
	{ label: 'Member', value: CLIENT_MANAGER_ROLE_ID },
];

const openInviteModal = () => {
	inviteForm.value = { email: '', role: CLIENT_MANAGER_ROLE_ID };
	showInviteModal.value = true;
};

const sendInvitation = async () => {
	if (!inviteForm.value.email || !selectedOrg.value) return;
	sendingInvite.value = true;
	try {
		// 1. Invite the user via Directus
		await $fetch('/api/directus/users/invite', {
			method: 'POST',
			body: {
				email: inviteForm.value.email,
				role: inviteForm.value.role,
			},
		});

		toast.add({
			title: 'Invitation Sent',
			description: `An invitation has been sent to ${inviteForm.value.email}`,
			color: 'green',
		});
		showInviteModal.value = false;

		// Refresh users list
		await fetchFilteredUsers(selectedOrg.value);
	} catch (error) {
		console.error('Error sending invitation:', error);
		const message = error?.data?.message || error?.message || 'Failed to send invitation';
		toast.add({ title: 'Error', description: message, color: 'red' });
	} finally {
		sendingInvite.value = false;
	}
};

// --- Add Existing User to Organization ---
const showAddMemberModal = ref(false);
const searchEmail = ref('');
const searchResults = ref([]);
const searching = ref(false);
const addingUser = ref(false);

const { readUsers } = useDirectusUsers();

const openAddMemberModal = () => {
	searchEmail.value = '';
	searchResults.value = [];
	showAddMemberModal.value = true;
};

const searchUsers = async () => {
	if (!searchEmail.value || searchEmail.value.length < 2) {
		searchResults.value = [];
		return;
	}
	searching.value = true;
	try {
		const users = await readUsers({
			filter: {
				_or: [
					{ email: { _contains: searchEmail.value } },
					{ first_name: { _contains: searchEmail.value } },
					{ last_name: { _contains: searchEmail.value } },
				],
			},
			fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
			limit: 10,
		});

		// Filter out users already in the organization
		const existingIds = new Set(filteredUsers.value.map((u) => u.id));
		searchResults.value = (users || []).filter((u) => !existingIds.has(u.id));
	} catch (error) {
		console.error('Error searching users:', error);
		searchResults.value = [];
	} finally {
		searching.value = false;
	}
};

const addUserToOrganization = async (userId) => {
	if (!selectedOrg.value || !userId) return;
	addingUser.value = true;
	try {
		await orgUserJunction.create({
			organizations_id: selectedOrg.value,
			directus_users_id: userId,
		});
		toast.add({ title: 'Success', description: 'User added to organization', color: 'green' });
		// Refresh
		await fetchFilteredUsers(selectedOrg.value);
		// Remove from search results
		searchResults.value = searchResults.value.filter((u) => u.id !== userId);
	} catch (error) {
		console.error('Error adding user to organization:', error);
		toast.add({ title: 'Error', description: 'Failed to add user to organization', color: 'red' });
	} finally {
		addingUser.value = false;
	}
};

// --- Remove Member ---
const showRemoveMemberModal = ref(false);
const memberToRemove = ref(null);
const removingMember = ref(false);

const confirmRemoveMember = (member) => {
	memberToRemove.value = member;
	showRemoveMemberModal.value = true;
};

const removeMember = async () => {
	if (!memberToRemove.value || !selectedOrg.value) return;
	removingMember.value = true;
	try {
		// Find the junction record
		const junctions = await orgUserJunction.list({
			filter: {
				organizations_id: { _eq: selectedOrg.value },
				directus_users_id: { _eq: memberToRemove.value.id },
			},
			fields: ['id'],
		});
		if (junctions.length > 0) {
			await orgUserJunction.remove(junctions.map((j) => j.id));
		}
		toast.add({ title: 'Success', description: 'Member removed from organization', color: 'green' });
		showRemoveMemberModal.value = false;
		memberToRemove.value = null;
		await fetchFilteredUsers(selectedOrg.value);
	} catch (error) {
		console.error('Error removing member:', error);
		toast.add({ title: 'Error', description: 'Failed to remove member', color: 'red' });
	} finally {
		removingMember.value = false;
	}
};

// Function to fetch organization data with correct fields
const fetchOrganizationData = async () => {
	if (!selectedOrg.value) return;

	try {
		isLoading.value = true;

		const orgs = await organizationItems.list({
			filter: { id: { _eq: selectedOrg.value } },
			fields: [
				'id',
				'name',
				'logo',
				'category',
				'notes',
				'website',
				'phone',
				'address',
				'industry.name',
				'industry.class',
				'brand_color',
				'emails',
				'date_created',
				'origin_date',
				'icon',
			],
			limit: 1,
		});

		org.value = orgs?.[0] || null;

		// Run these in parallel for better performance
		await Promise.all([
			fetchFilteredUsers(selectedOrg.value),
			fetchTeams(selectedOrg.value),
		]);
	} catch (error) {
		console.error('Error fetching organization data:', error);
		org.value = null;
	} finally {
		isLoading.value = false;
	}
};

// Watch for changes in selectedOrg and fetch data
watch(
	() => selectedOrg.value,
	(newVal) => {
		if (newVal) {
			fetchOrganizationData();
		} else {
			org.value = null;
		}
	},
	{ immediate: true },
);

// Format date helper
const formatDate = (dateString) => {
	if (!dateString) return 'N/A';
	return new Date(dateString).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
};

// Get organization logo URL
const getIconUrl = computed(() => {
	if (!org.value?.icon) return null;
	return `${config.public.directusUrl}/assets/${org.value.icon}?key=avatar`;
});

// Debounced search
let searchTimeout = null;
watch(searchEmail, (val) => {
	clearTimeout(searchTimeout);
	if (val && val.length >= 2) {
		searchTimeout = setTimeout(() => searchUsers(), 300);
	} else {
		searchResults.value = [];
	}
});
</script>

<template>
	<div class="w-full relative">
		<h1 class="page__title">Company</h1>
		<div class="flex items-center justify-start flex-col z-10 w-full page__inner">
			<!-- Loading state -->
			<div v-if="isLoading" class="flex justify-center items-center min-h-[300px]">
				<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-500" />
			</div>

			<!-- No organization selected -->
			<UAlert
				v-else-if="!selectedOrg || !org"
				title="No Organization Selected"
				description="Please select an organization from the dropdown in the navigation bar."
				color="blue"
				class="max-w-2xl mx-auto mt-12"
			/>

			<!-- Organization Data -->
			<div v-else class="max-w-7xl mx-auto w-full">
				<!-- Organization Header -->
				<div class="flex flex-col md:flex-row gap-6 items-start mb-8">
					<!-- Logo -->
					<div class="flex-shrink-0">
						<div
							v-if="getIconUrl"
							class="w-24 h-24 rounded-full shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center bg-white dark:bg-gray-800"
						>
							<img
								:src="getIconUrl"
								:alt="org.name"
								class="max-w-full max-h-full object-contain"
							/>
						</div>
						<div
							v-else
							class="w-24 h-24 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full shadow-md border border-gray-200 dark:border-gray-700"
						>
							<UIcon name="i-heroicons-building-office" class="w-12 h-12 text-gray-400" />
						</div>
					</div>

					<!-- Organization Info -->
					<div class="flex-grow">
						<div class="flex items-center justify-between">
							<h1 class="text-2xl md:text-3xl font-bold mb-2">{{ org.name }}</h1>
							<UButton
								v-if="canManageOrg"
								color="gray"
								variant="ghost"
								icon="i-heroicons-pencil-square"
								size="sm"
								@click="openEditModal"
							/>
						</div>

						<div class="flex flex-wrap gap-x-6 gap-y-1 mb-4 text-sm text-gray-600 dark:text-gray-300">
							<div v-if="org.industry?.name" class="flex items-center">
								<UIcon name="i-heroicons-building-office-2" class="w-4 h-4 mr-1" />
								<span>{{ org.industry.name }}</span>
							</div>
							<div v-if="org.origin_date" class="flex items-center">
								<UIcon name="i-heroicons-calendar" class="w-4 h-4 mr-1" />
								<span>Member since {{ formatDate(org.origin_date) }}</span>
							</div>
						</div>

						<p v-if="org.notes" class="text-gray-700 dark:text-gray-300 mb-4">
							{{ org.notes }}
						</p>

						<div class="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-gray-300">
							<a
								v-if="org.website"
								:href="org.website.startsWith('http') ? org.website : 'https://' + org.website"
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center text-primary"
							>
								<UIcon name="i-heroicons-globe-alt" class="w-4 h-4 mr-1" />
								<span>{{ org.website.startsWith('http') ? org.website : 'https://' + org.website }}</span>
							</a>
							<div v-if="org.emails && org.emails.length" class="flex items-center">
								<UIcon name="i-heroicons-envelope" class="w-4 h-4 mr-1 flex-shrink-0" />
								<div class="flex flex-wrap gap-2">
									<UBadge
										v-for="(email, index) in Array.isArray(org.emails) ? org.emails : [org.emails]"
										:key="index"
										color="primary"
										variant="soft"
									>
										<span class="truncate max-w-48">{{ email }}</span>
									</UBadge>
								</div>
							</div>
							<a
								v-if="org.phone"
								:href="'tel:' + org.phone"
								class="flex items-center text-primary"
							>
								<UIcon name="i-heroicons-phone" class="w-4 h-4 mr-1" />
								<span>{{ org.phone }}</span>
							</a>
						</div>
					</div>
				</div>

				<!-- Tabs -->
				<UTabs v-model="activeTab" :items="tabItems">
					<template #overview>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
							<!-- Contact Information Card -->
							<UCard>
								<template #header>
									<div class="flex items-center">
										<UIcon name="i-heroicons-information-circle" class="w-5 h-5 mr-2" />
										<h3 class="text-lg font-medium">Contact Information</h3>
									</div>
								</template>

								<div class="space-y-4">
									<div v-if="org.address">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Address</h4>
										<p class="text-gray-700 dark:text-gray-300">{{ org.address }}</p>
									</div>

									<div v-if="org.phone">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Phone</h4>
										<p class="text-gray-700 dark:text-gray-300">{{ org.phone }}</p>
									</div>

									<div v-if="org.emails && org.emails.length">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Email Addresses</h4>
										<div class="flex flex-wrap gap-2">
											<UBadge
												v-for="(email, index) in Array.isArray(org.emails) ? org.emails : [org.emails]"
												:key="index"
												color="primary"
												variant="soft"
											>
												{{ email }}
											</UBadge>
										</div>
									</div>

									<div v-if="org.website">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Website</h4>
										<p class="text-gray-700 dark:text-gray-300">
											<a
												:href="org.website.startsWith('http') ? org.website : 'https://' + org.website"
												target="_blank"
												rel="noopener noreferrer"
												class="text-primary"
											>
												{{ org.website }}
											</a>
										</p>
									</div>

									<div v-if="org.brand_color">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Brand Color</h4>
										<div class="flex items-center">
											<div
												class="w-6 h-6 rounded mr-2 border border-gray-200"
												:style="{ backgroundColor: org.brand_color }"
											></div>
											<span class="text-gray-700 dark:text-gray-300">{{ org.brand_color }}</span>
										</div>
									</div>
								</div>
							</UCard>

							<!-- Industry Information -->
							<UCard v-if="org.industry">
								<template #header>
									<div class="flex items-center">
										<UIcon name="i-heroicons-building-office-2" class="w-5 h-5 mr-2" />
										<h3 class="text-lg font-medium">Industry Information</h3>
									</div>
								</template>

								<div class="space-y-4">
									<div v-if="org.industry.name">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Industry</h4>
										<p class="text-gray-700 dark:text-gray-300">{{ org.industry.name }}</p>
									</div>

									<div v-if="org.industry.class">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Classification</h4>
										<p class="text-gray-700 dark:text-gray-300">{{ org.industry.class }}</p>
									</div>
								</div>
							</UCard>
						</div>
					</template>

					<template #members>
						<div class="mt-6">
							<div class="flex justify-between items-center mb-4">
								<h3 class="text-lg font-medium">Organization Members</h3>
								<div v-if="canManageOrg" class="flex gap-2">
									<UButton
										color="gray"
										variant="outline"
										icon="i-heroicons-user-plus"
										size="sm"
										@click="openAddMemberModal"
									>
										Add Existing User
									</UButton>
									<UButton
										color="primary"
										icon="i-heroicons-envelope"
										size="sm"
										@click="openInviteModal"
									>
										Invite Member
									</UButton>
								</div>
							</div>

							<div v-if="filteredUsers.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
								<UCard v-for="member in filteredUsers" :key="member.id">
									<div class="flex items-center justify-between">
										<div class="flex items-center space-x-4">
											<UAvatar
												:src="member.avatar ? `${config.public.directusUrl}/assets/${member.avatar}?key=small` : null"
												:alt="`${member.first_name} ${member.last_name}`"
											/>
											<div>
												<h4 class="font-medium">{{ member.first_name }} {{ member.last_name }}</h4>
												<p class="text-sm text-gray-500">{{ member.email }}</p>
											</div>
										</div>
										<UButton
											v-if="canManageOrg && member.id !== user?.id"
											color="red"
											variant="ghost"
											icon="i-heroicons-user-minus"
											size="xs"
											@click="confirmRemoveMember(member)"
										/>
									</div>
								</UCard>
							</div>

							<div v-else class="text-center py-12">
								<UIcon name="i-heroicons-users" class="w-12 h-12 text-gray-300 mx-auto mb-4" />
								<p class="text-gray-500 mb-4">No members found for this organization.</p>
								<UButton
									v-if="canManageOrg"
									color="primary"
									icon="i-heroicons-envelope"
									@click="openInviteModal"
								>
									Invite a Member
								</UButton>
							</div>
						</div>
					</template>

					<template #teams>
						<div class="mt-6">
							<!-- Add loading indicator for teams -->
							<div v-if="teamsLoading" class="flex justify-center py-8">
								<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-500" />
							</div>

							<TeamsManageTeams
								v-else
								:embedded="true"
								:organization-id="selectedOrg"
								:initial-teams="visibleTeams"
								:external-loading="teamsLoading"
							/>
						</div>
					</template>
				</UTabs>
			</div>
		</div>

		<!-- Edit Organization Modal -->
		<UModal v-model="showEditOrgModal">
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">Edit Organization</h3>
						<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showEditOrgModal = false" />
					</div>
				</template>

				<form @submit.prevent="saveOrganization" class="space-y-4">
					<UFormGroup label="Organization Name" required>
						<UInput v-model="editForm.name" placeholder="Organization name" />
					</UFormGroup>

					<UFormGroup label="Website">
						<UInput v-model="editForm.website" placeholder="https://example.com" />
					</UFormGroup>

					<UFormGroup label="Phone">
						<UInput v-model="editForm.phone" placeholder="+1 (555) 000-0000" />
					</UFormGroup>

					<UFormGroup label="Notes">
						<UInput v-model="editForm.notes" placeholder="Organization description or notes" />
					</UFormGroup>

					<UFormGroup label="Brand Color">
						<div class="flex items-center gap-3">
							<input
								type="color"
								v-model="editForm.brand_color"
								class="w-10 h-10 rounded cursor-pointer border border-gray-200"
							/>
							<UInput v-model="editForm.brand_color" placeholder="#000000" class="flex-1" />
						</div>
					</UFormGroup>
				</form>

				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton color="gray" variant="ghost" @click="showEditOrgModal = false">Cancel</UButton>
						<UButton color="primary" :loading="savingOrg" :disabled="!editForm.name" @click="saveOrganization">
							Save Changes
						</UButton>
					</div>
				</template>
			</UCard>
		</UModal>

		<!-- Invite Member Modal -->
		<UModal v-model="showInviteModal">
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">Invite Member</h3>
						<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showInviteModal = false" />
					</div>
				</template>

				<form @submit.prevent="sendInvitation" class="space-y-4">
					<p class="text-sm text-gray-500">
						Send an email invitation to join this organization. The user will receive an email with instructions to create their account.
					</p>

					<UFormGroup label="Email Address" required>
						<UInput
							v-model="inviteForm.email"
							type="email"
							placeholder="user@example.com"
							icon="i-heroicons-envelope"
						/>
					</UFormGroup>

					<UFormGroup label="Role">
						<USelect
							v-model="inviteForm.role"
							:options="roleOptions"
							option-attribute="label"
							value-attribute="value"
						/>
					</UFormGroup>
				</form>

				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton color="gray" variant="ghost" @click="showInviteModal = false">Cancel</UButton>
						<UButton
							color="primary"
							:loading="sendingInvite"
							:disabled="!inviteForm.email"
							@click="sendInvitation"
						>
							Send Invitation
						</UButton>
					</div>
				</template>
			</UCard>
		</UModal>

		<!-- Add Existing User Modal -->
		<UModal v-model="showAddMemberModal" :ui="{ width: 'max-w-lg' }">
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">Add Member to Organization</h3>
						<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showAddMemberModal = false" />
					</div>
				</template>

				<div class="space-y-4">
					<p class="text-sm text-gray-500">
						Search for existing users to add them to this organization.
					</p>

					<UFormGroup label="Search Users">
						<UInput
							v-model="searchEmail"
							placeholder="Search by name or email..."
							icon="i-heroicons-magnifying-glass"
						/>
					</UFormGroup>

					<div v-if="searching" class="flex justify-center py-4">
						<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-500" />
					</div>

					<div v-else-if="searchResults.length > 0" class="space-y-2 max-h-64 overflow-y-auto">
						<div
							v-for="result in searchResults"
							:key="result.id"
							class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
						>
							<div class="flex items-center space-x-3">
								<UAvatar
									:src="result.avatar ? `${config.public.directusUrl}/assets/${result.avatar}?key=small` : null"
									:alt="`${result.first_name} ${result.last_name}`"
									size="sm"
								/>
								<div>
									<p class="font-medium text-sm">{{ result.first_name }} {{ result.last_name }}</p>
									<p class="text-xs text-gray-500">{{ result.email }}</p>
								</div>
							</div>
							<UButton
								color="primary"
								variant="outline"
								size="xs"
								icon="i-heroicons-plus"
								:loading="addingUser"
								@click="addUserToOrganization(result.id)"
							>
								Add
							</UButton>
						</div>
					</div>

					<p v-else-if="searchEmail.length >= 2 && !searching" class="text-center text-sm text-gray-500 py-4">
						No users found matching your search.
					</p>
				</div>

				<template #footer>
					<div class="flex justify-end">
						<UButton color="gray" variant="ghost" @click="showAddMemberModal = false">Close</UButton>
					</div>
				</template>
			</UCard>
		</UModal>

		<!-- Remove Member Confirmation Modal -->
		<UModal v-model="showRemoveMemberModal">
			<UCard>
				<template #header>
					<h3 class="text-lg font-semibold text-red-600">Remove Member</h3>
				</template>

				<div>
					<p class="mb-4">
						Are you sure you want to remove
						<strong>{{ memberToRemove?.first_name }} {{ memberToRemove?.last_name }}</strong>
						from this organization?
					</p>
					<p class="text-sm text-gray-500">
						This will remove their access to organization resources. Their user account will remain active.
					</p>
				</div>

				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton color="gray" variant="ghost" @click="showRemoveMemberModal = false">Cancel</UButton>
						<UButton color="red" :loading="removingMember" @click="removeMember">Remove Member</UButton>
					</div>
				</template>
			</UCard>
		</UModal>
	</div>
</template>

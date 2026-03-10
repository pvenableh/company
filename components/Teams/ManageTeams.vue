<template>
	<div class="teams-manager">
		<div class="flex items-center justify-between mb-6">
			<h2 class="text-2xl font-semibold">{{ embedded ? '' : 'Teams' }}</h2>
			<UButton
				v-if="hasTeamManagementAccess"
				color="primary"
				@click="showCreateTeamModal = true"
				icon="i-heroicons-user-group"
			>
				Create Team
			</UButton>
		</div>

		<div v-if="isLoading" class="flex justify-center py-12">
			<UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
		</div>

		<div v-else>
			<!-- Current Organization Display -->
			<div v-if="!embedded" class="mb-6 flex items-center">
				<h3 class="text-md font-medium text-gray-500">
					{{ currentOrg ? `Teams for ${currentOrg.name}` : 'No Organization Selected' }}
				</h3>
			</div>

			<!-- No Organization Selected -->
			<UAlert
				v-if="!effectiveOrgId"
				class="mb-6"
				title="No Organization Selected"
				description="Please select an organization from the global header to manage teams."
				color="blue"
			/>

			<!-- No Teams Found -->
			<UCard v-else-if="!displayTeams.length" class="mb-6 text-center py-8">
				<UIcon name="i-heroicons-user-group" class="mx-auto h-12 w-12 text-gray-300 mb-4" />
				<h3 class="text-lg font-medium mb-2">No Teams Found</h3>
				<p class="text-gray-500 mb-4">
					{{
						hasTeamManagementAccess
							? 'Start by creating a team for this organization.'
							: 'You are not a member of any teams in this organization.'
					}}
				</p>
				<UButton v-if="hasTeamManagementAccess" color="primary" @click="showCreateTeamModal = true">
					Create Team
				</UButton>
			</UCard>

			<!-- Teams List -->
			<div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
				<!-- Regular Team Cards -->
				<UCard
					v-for="team in displayTeams"
					:key="team.id"
					class="border-2"
					:ui="{ border: { color: selectedTeam === team.id ? 'primary' : 'gray-200' } }"
				>
					<template #header>
						<div class="flex items-center justify-between">
							<h3 class="text-lg font-medium">{{ team.name }}</h3>
							<div class="flex gap-1">
								<UBadge v-if="isTeamManager(team.id)" color="green" class="text-[9px] uppercase">Manager</UBadge>
								<UBadge v-if="isOnTeam(team)" color="blue" class="text-[9px] uppercase">Member</UBadge>
							</div>
						</div>
					</template>

					<div class="text-sm text-gray-500" v-html="team.description || 'No description provided'" />

					<div class="mt-4 flex items-center justify-between">
						<span class="text-xs font-medium text-gray-500">{{ getTeamMembers(team).length }} Members</span>

						<UDropdown v-if="hasTeamManagementAccess && canManageTeam(team.id)" :items="dropdownItems(team)">
							<UButton icon="i-heroicons-ellipsis-horizontal" color="gray" variant="ghost" size="xs" />
						</UDropdown>
					</div>

					<template #footer>
						<div class="flex justify-between items-center">
							<div class="flex -space-x-2">
								<UAvatar
									v-for="(user, index) in getTeamMembers(team).slice(0, 5)"
									:key="index"
									:src="getAvatarUrl(user.directus_users_id)"
									:alt="getUserFullName(user.directus_users_id)"
									size="sm"
								/>
								<div
									v-if="getTeamMembers(team).length > 5"
									class="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-600 text-xs font-medium border-2 border-white -ml-2"
								>
									+{{ getTeamMembers(team).length - 5 }}
								</div>
							</div>

							<div class="flex gap-2">
								<UButton
									v-if="canManageTeam(team.id)"
									color="gray"
									variant="ghost"
									size="sm"
									icon="i-heroicons-user-plus"
									@click="manageTeamMembers(team)"
								/>

								<UButton
									:color="selectedTeam === team.id ? 'gray' : 'primary'"
									:variant="selectedTeam === team.id ? 'solid' : 'outline'"
									size="sm"
									@click="setTeam(team.id)"
								>
									{{ selectedTeam === team.id ? 'Selected' : 'Select' }}
								</UButton>
							</div>
						</div>
					</template>
				</UCard>
			</div>
		</div>

		<!-- Team Management Modal -->
		<UModal v-model="showTeamMembersModal" :ui="{ width: 'max-w-xl' }">
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">Manage Team: {{ currentEditTeam?.name }}</h3>
						<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showTeamMembersModal = false" />
					</div>
				</template>

				<TeamsManageTeamMembers
					v-if="currentEditTeam"
					:team-id="currentEditTeam.id"
					:team-name="currentEditTeam.name"
					:organization-id="effectiveOrgId"
					@update="refreshTeams"
				/>
			</UCard>
		</UModal>

		<!-- Create/Edit Team Modal -->
		<UModal v-model="showCreateTeamModal">
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">{{ isEditing ? 'Edit' : 'Create' }} Team</h3>
						<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="cancelTeamForm" />
					</div>
				</template>

				<form @submit.prevent="submitTeamForm">
					<UFormGroup label="Team Name" required>
						<UInput v-model="teamForm.name" placeholder="Enter team name" />
					</UFormGroup>

					<UFormGroup label="Description">
						<FormTiptap v-model="teamForm.description" placeholder="Describe the purpose of this team" />
					</UFormGroup>

					<UFormGroup label="Active">
						<div class="flex items-center gap-3">
							<UToggle v-model="teamForm.active" />
							<span class="text-sm text-gray-500">
								{{ teamForm.active ? 'Team is active and visible in selectors' : 'Team is inactive and hidden from selectors' }}
							</span>
						</div>
					</UFormGroup>
				</form>

				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton color="gray" variant="ghost" @click="cancelTeamForm">Cancel</UButton>
						<UButton color="primary" :loading="submittingTeam" :disabled="!teamForm.name" @click="submitTeamForm">
							{{ isEditing ? 'Save Changes' : 'Create Team' }}
						</UButton>
					</div>
				</template>
			</UCard>
		</UModal>

		<!-- Delete Confirmation Modal -->
		<UModal v-model="showDeleteTeamModal">
			<UCard>
				<template #header>
					<h3 class="text-lg font-semibold text-red-600">Delete Team</h3>
				</template>

				<div>
					<p class="mb-4">Are you sure you want to delete the team "{{ currentEditTeam?.name }}"?</p>
					<p class="text-sm text-gray-500">
						This action cannot be undone. All team associations will be removed, but user accounts will remain.
					</p>
				</div>

				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton color="gray" variant="ghost" @click="showDeleteTeamModal = false">Cancel</UButton>
						<UButton color="red" :loading="deletingTeam" @click="deleteTeam">Delete Team</UButton>
					</div>
				</template>
			</UCard>
		</UModal>
	</div>
</template>

<script setup>
// Props for better component composition
const props = defineProps({
	// Allow embedding the component in another page
	embedded: {
		type: Boolean,
		default: false,
	},
	// Allow specifying organization ID directly (for embedding)
	organizationId: {
		type: String,
		default: null,
	},
	// Allow providing initial teams data (for embedding)
	initialTeams: {
		type: Array,
		default: () => [],
	},
	// Control loading state externally
	externalLoading: {
		type: Boolean,
		default: null,
	},
});

// Get composables
const {
	visibleTeams,
	loading: teamsLoading,
	selectedTeam,
	fetchTeams,
	createTeam: createTeamAction,
	updateTeam: updateTeamAction,
	deleteTeam: deleteTeamAction,
	setTeam,
	clearTeam,
	isTeamManager,
	canManageTeam,
	hasAdminAccess,
	isOnTeam,
	getTeamMembers,
	setupStorageListener,
	ADMIN_ROLE_ID,
	CLIENT_MANAGER_ROLE_ID,
} = useTeams();

const { selectedOrg, currentOrg } = useOrganization();

const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const toast = useToast();

// Set up cross-tab sync listener
onMounted(() => {
	if (typeof setupStorageListener === 'function') {
		const cleanup = setupStorageListener();
		onUnmounted(() => {
			if (typeof cleanup === 'function') {
				cleanup();
			}
		});
	}
});

// Use either provided organizationId or global selectedOrg
const effectiveOrgId = computed(() => props.organizationId || selectedOrg.value);

// Determine which teams to display based on props
const displayTeams = computed(() => {
	if (props.initialTeams && props.initialTeams.length > 0) {
		return props.initialTeams;
	}
	return visibleTeams.value;
});

// Combined loading state from props and internal state
const isLoading = computed(() => {
	return props.externalLoading !== null ? props.externalLoading : teamsLoading.value;
});

// State
const showTeamMembersModal = ref(false);
const showCreateTeamModal = ref(false);
const showDeleteTeamModal = ref(false);
const currentEditTeam = ref(null);
const teamForm = ref({
	name: '',
	description: '',
	active: true,
});
const isEditing = ref(false);
const submittingTeam = ref(false);
const deletingTeam = ref(false);

const dropdownItems = (team) => {
	// Only show management actions if user has appropriate role
	if (!hasTeamManagementAccess.value) {
		return [];
	}

	return [
		[
			{
				label: 'Edit Team',
				icon: 'i-heroicons-pencil-square',
				click: () => editTeam(team),
			},
			{
				label: 'Delete Team',
				icon: 'i-heroicons-trash',
				color: 'red',
				click: () => confirmDeleteTeam(team),
			},
		],
	];
};

// Emit events
const emit = defineEmits(['team-created', 'team-updated', 'team-deleted', 'team-selected']);

// Computed permissions
const hasTeamManagementAccess = computed(() => {
	// Check if user has the required role for team management
	return hasAdminAccess(currentUser.value);
});

// Helper methods for team relationships
const refreshTeams = async () => {
	if (effectiveOrgId.value) {
		await fetchTeams(effectiveOrgId.value);
	}
};

// Avatar and name utilities
const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown User';
	return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User';
};

// Team CRUD operations
const editTeam = (team) => {
	// Check if user has permission to edit teams
	if (!hasTeamManagementAccess.value) {
		toast.add({
			title: 'Permission Denied',
			description: 'You do not have permission to edit teams',
			color: 'red',
		});
		return;
	}

	currentEditTeam.value = team;
	teamForm.value.name = team.name;
	teamForm.value.description = team.description || '';
	teamForm.value.active = team.active !== false;
	isEditing.value = true;
	showCreateTeamModal.value = true;
};

const cancelTeamForm = () => {
	teamForm.value = { name: '', description: '', active: true };
	isEditing.value = false;
	currentEditTeam.value = null;
	showCreateTeamModal.value = false;
};

const submitTeamForm = async () => {
	if (!teamForm.value.name) return;

	// Validate permission
	if (!hasTeamManagementAccess.value) {
		toast.add({
			title: 'Permission Denied',
			description: 'You do not have permission to create or edit teams',
			color: 'red',
		});
		return;
	}

	submittingTeam.value = true;
	try {
		if (isEditing.value && currentEditTeam.value) {
			await updateTeamAction(currentEditTeam.value.id, teamForm.value, effectiveOrgId.value);
			toast.add({
				title: 'Success',
				description: 'Team updated successfully',
				color: 'green',
			});
			emit('team-updated', currentEditTeam.value.id);
		} else {
			const newTeam = await createTeamAction(effectiveOrgId.value, teamForm.value);
			toast.add({
				title: 'Success',
				description: 'Team created successfully',
				color: 'green',
			});
			emit('team-created', newTeam);
		}

		// Reset form and close modal
		cancelTeamForm();
		await refreshTeams();
	} catch (error) {
		toast.add({
			title: 'Error',
			description: isEditing.value ? 'Failed to update team' : 'Failed to create team',
			color: 'red',
		});
	} finally {
		submittingTeam.value = false;
	}
};

const confirmDeleteTeam = (team) => {
	// Check if user has permission to delete teams
	if (!hasTeamManagementAccess.value) {
		toast.add({
			title: 'Permission Denied',
			description: 'You do not have permission to delete teams',
			color: 'red',
		});
		return;
	}

	currentEditTeam.value = team;
	showDeleteTeamModal.value = true;
};

const deleteTeam = async () => {
	if (!currentEditTeam.value) return;

	// Final permission check before deletion
	if (!hasTeamManagementAccess.value) {
		toast.add({
			title: 'Permission Denied',
			description: 'You do not have permission to delete teams',
			color: 'red',
		});
		showDeleteTeamModal.value = false;
		return;
	}

	deletingTeam.value = true;
	try {
		await deleteTeamAction(currentEditTeam.value.id, effectiveOrgId.value);

		toast.add({
			title: 'Success',
			description: 'Team deleted successfully',
			color: 'green',
		});

		emit('team-deleted', currentEditTeam.value.id);

		// Close modal and refresh
		showDeleteTeamModal.value = false;
		currentEditTeam.value = null;
		await refreshTeams();
	} catch (error) {
		toast.add({
			title: 'Error',
			description: 'Failed to delete team',
			color: 'red',
		});
	} finally {
		deletingTeam.value = false;
	}
};

const manageTeamMembers = (team) => {
	currentEditTeam.value = team;
	showTeamMembersModal.value = true;
};

// Watch for organization changes from the global state or props
watch(
	() => effectiveOrgId.value,
	async (newOrgId) => {
		if (newOrgId) {
			if (selectedTeam.value) {
				clearTeam(); // Reset team selection when organization changes
			}
			await fetchTeams(newOrgId);
		} else {
			await refreshTeams();
		}
	},
	{ immediate: true },
);
</script>

<template>
	<div class="space-y-4">
		<!-- Current Team Members -->
		<div>
			<h4 class="text-md font-medium mb-3">Current Team Members</h4>

			<div v-if="loading" class="flex justify-center py-4">
				<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" />
			</div>

			<div v-else-if="teamMembers.length === 0" class="text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
				<p class="text-gray-500">No team members yet</p>
			</div>

			<ul v-else class="divide-y dark:divide-gray-700">
				<li v-for="member in teamMembers" :key="member.id" class="py-3 flex items-center justify-between">
					<div class="flex items-center">
						<UAvatar
							:src="getAvatarUrl(member.directus_users_id)"
							:alt="getUserFullName(member.directus_users_id)"
							size="sm"
						/>
						<div class="ml-3">
							<p class="font-medium">{{ getUserFullName(member.directus_users_id) }}</p>
							<p class="text-xs text-gray-500">{{ member.directus_users_id.email }}</p>
						</div>
					</div>

					<div class="flex items-center gap-2">
						<UBadge v-if="member.is_manager" color="green" class="text-[9px]">Manager</UBadge>
						<UButton
							color="red"
							variant="ghost"
							size="xs"
							icon="i-heroicons-user-minus"
							@click="confirmRemoveMember(member)"
						/>
						<UButton
							color="blue"
							variant="ghost"
							size="xs"
							:icon="member.is_manager ? 'i-heroicons-star' : 'i-heroicons-star-outline'"
							@click="toggleManager(member)"
						/>
					</div>
				</li>
			</ul>
		</div>

		<UDivider />

		<!-- Add New Members -->
		<div>
			<h4 class="text-md font-medium mb-3">Add Team Members</h4>

			<div v-if="loadingAvailableUsers" class="flex justify-center py-4">
				<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" />
			</div>

			<div v-else-if="availableUsers.length === 0" class="text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
				<p class="text-gray-500">No other users available in this organization</p>
			</div>

			<div v-else>
				<USelectMenu
					v-model="selectedUser"
					:options="availableUsers"
					searchable
					placeholder="Select user to add"
					option-attribute="label"
					value-attribute="id"
				>
					<template #option="{ option: user }">
						<div class="flex items-center gap-2 py-1">
							<UAvatar :src="user.avatar" :alt="user.label" size="sm" />
							<div class="flex flex-col">
								<span class="font-medium">{{ user.label }}</span>
								<span class="text-xs text-gray-500">{{ user.email }}</span>
							</div>
						</div>
					</template>
				</USelectMenu>

				<div class="mt-2 flex items-center gap-3">
					<UCheckbox v-model="addAsManager" label="Add as team manager" />
					<UButton size="sm" color="primary" :disabled="!selectedUser" :loading="addingMember" @click="addMember">
						Add to Team
					</UButton>
				</div>
			</div>
		</div>

		<!-- Confirmation Modal -->
		<UModal v-model="showConfirmModal">
			<UCard>
				<template #header>
					<h3 class="text-lg font-semibold">Confirm Action</h3>
				</template>

				<p>{{ confirmMessage }}</p>

				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton color="gray" variant="ghost" @click="showConfirmModal = false">Cancel</UButton>
						<UButton
							:color="confirmAction === 'remove' ? 'red' : 'blue'"
							:loading="confirmLoading"
							@click="handleConfirm"
						>
							{{ confirmAction === 'remove' ? 'Remove' : 'Update' }}
						</UButton>
					</div>
				</template>
			</UCard>
		</UModal>
	</div>
</template>

<script setup>
import { useFilteredUsers } from '~/composables/useFilteredUsers';

const props = defineProps({
	teamId: {
		type: String,
		required: true,
	},
	teamName: {
		type: String,
		required: true,
	},
	organizationId: {
		type: String,
		required: true,
	},
});

const emit = defineEmits(['update']);

const { isTeamManager, hasAdminAccess, removeUserFromTeam, addUsersToTeam } = useTeams();

// Get the filtered users functionality
const { getAvailableTeamUsers } = useFilteredUsers();

const { user: currentUser } = useDirectusAuth();
const toast = useToast();

// State
const teamMembers = ref([]);
const availableUsers = ref([]);
const loading = ref(true);
const loadingAvailableUsers = ref(true);
const selectedUser = ref(null);
const addAsManager = ref(false);
const addingMember = ref(false);
const showConfirmModal = ref(false);
const confirmMessage = ref('');
const confirmAction = ref('');
const confirmMember = ref(null);
const confirmLoading = ref(false);

// Get the team details with members
const fetchTeamMembers = async () => {
	try {
		loading.value = true;

		// This would typically use your API, but for simplicity:
		const { readItems } = useDirectusItems();
		const team = await readItems('teams', {
			filter: { id: { _eq: props.teamId } },
			fields: [
				'id',
				'name',
				'users.id',
				'users.is_manager',
				'users.directus_users_id.id',
				'users.directus_users_id.first_name',
				'users.directus_users_id.last_name',
				'users.directus_users_id.email',
				'users.directus_users_id.avatar',
			],
		});

		if (team && team.length > 0) {
			teamMembers.value = team[0].users || [];
		}
	} catch (error) {
		console.error('Error fetching team members:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to load team members',
			color: 'red',
		});
	} finally {
		loading.value = false;
	}
};

// Fetch available users (not yet in the team)
const fetchAvailableUsers = async () => {
	try {
		loadingAvailableUsers.value = true;

		// Get users from the organization who aren't in this team yet
		const users = await getAvailableTeamUsers(props.organizationId, props.teamId);

		availableUsers.value = users.map((user) => ({
			id: user.id,
			label: `${user.first_name} ${user.last_name}`.trim() || user.email,
			email: user.email,
			avatar: user.avatar ? `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small` : null,
		}));
	} catch (error) {
		console.error('Error fetching available users:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to load available users',
			color: 'red',
		});
	} finally {
		loadingAvailableUsers.value = false;
	}
};

// Utility functions
const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown User';
	return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User';
};

// Action handlers
const confirmRemoveMember = (member) => {
	confirmMember.value = member;
	confirmAction.value = 'remove';
	confirmMessage.value = `Are you sure you want to remove ${getUserFullName(member.directus_users_id)} from the team?`;
	showConfirmModal.value = true;
};

const toggleManager = (member) => {
	confirmMember.value = member;
	confirmAction.value = 'toggleManager';
	const action = member.is_manager ? 'remove as manager' : 'make a manager';
	confirmMessage.value = `Are you sure you want to ${action} ${getUserFullName(member.directus_users_id)}?`;
	showConfirmModal.value = true;
};

const handleConfirm = async () => {
	if (!confirmMember.value) return;

	confirmLoading.value = true;
	try {
		if (confirmAction.value === 'remove') {
			await removeUserFromTeam(props.teamId, confirmMember.value.directus_users_id.id, props.organizationId);
			toast.add({
				title: 'Success',
				description: 'User removed from team',
				color: 'green',
			});
		} else if (confirmAction.value === 'toggleManager') {
			// This would typically update the junction record's is_manager field
			// For simplicity in this example, we'll use a mock update
			const { updateItem } = useDirectusItems();
			await updateItem('junction_directus_users_teams', confirmMember.value.id, {
				is_manager: !confirmMember.value.is_manager,
			});

			toast.add({
				title: 'Success',
				description: `User ${confirmMember.value.is_manager ? 'removed as' : 'set as'} manager`,
				color: 'green',
			});
		}

		// Refresh data
		await fetchTeamMembers();
		await fetchAvailableUsers();
		emit('update');
	} catch (error) {
		console.error('Error performing action:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to perform action',
			color: 'red',
		});
	} finally {
		confirmLoading.value = false;
		showConfirmModal.value = false;
		confirmMember.value = null;
	}
};

const addMember = async () => {
	if (!selectedUser.value) return;

	addingMember.value = true;
	try {
		await addUsersToTeam(props.teamId, [selectedUser.value], props.organizationId, addAsManager.value);

		toast.add({
			title: 'Success',
			description: 'User added to team',
			color: 'green',
		});

		// Reset form
		selectedUser.value = null;
		addAsManager.value = false;

		// Refresh data
		await fetchTeamMembers();
		await fetchAvailableUsers();
		emit('update');
	} catch (error) {
		console.error('Error adding team member:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to add user to team',
			color: 'red',
		});
	} finally {
		addingMember.value = false;
	}
};

// Initialize
onMounted(async () => {
	await fetchTeamMembers();
	await fetchAvailableUsers();
});
</script>

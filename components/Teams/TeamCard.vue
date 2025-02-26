# components/TeamCard.vue
<template>
	<UCard class="mb-4">
		<template #header>
			<div class="flex items-center justify-between">
				<div>
					<h4 class="text-lg font-medium">{{ team.name }}</h4>
					<p v-if="team.description" class="text-sm text-gray-500">
						{{ team.description }}
					</p>
				</div>
				<UButton
					v-if="canManageTeam"
					color="gray"
					variant="ghost"
					icon="i-heroicons-ellipsis-horizontal"
					@click="showMenu = true"
				/>
			</div>
		</template>

		<div class="mb-4">
			<h4 class="text-sm font-medium mb-2">Team Members</h4>
			<div class="flex flex-wrap gap-2">
				<div
					v-for="(member, index) in team.users"
					:key="index"
					class="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-full px-3 py-1"
				>
					<UAvatar
						:src="getAvatarUrl(member.directus_users_id)"
						:alt="getUserFullName(member.directus_users_id)"
						size="sm"
					/>
					<span class="text-sm">
						{{ getUserFullName(member.directus_users_id) }}
					</span>
					<UButton
						v-if="canManageTeam"
						size="xs"
						color="gray"
						variant="ghost"
						icon="i-heroicons-x-mark"
						@click="removeMember(member.directus_users_id.id)"
						:loading="removeLoading === member.directus_users_id.id"
					/>
				</div>
			</div>
		</div>

		<UButton
			v-if="canManageTeam"
			size="sm"
			variant="outline"
			icon="i-heroicons-user-plus"
			@click="showAddMember = true"
		>
			Add Member
		</UButton>

		<!-- Add Member Modal -->
		<UModal v-model="showAddMember">
			<UCard>
				<template #header>
					<h4 class="text-lg font-medium">Add Team Member</h4>
				</template>

				<div class="py-4">
					<USelect
						v-model="selectedUser"
						:options="availableUsersFormatted"
						option-attribute="email"
						value-attribute="id"
						searchable
						:loading="loading"
						placeholder="Select a user to add..."
					>
						<template #option="{ option }">
							<div class="flex items-center gap-2 py-1">
								<UAvatar :src="getAvatarUrl(option)" :alt="getUserFullName(option)" size="sm" />
								<div>
									<div class="font-medium">{{ getUserFullName(option) }}</div>
									<div class="text-sm text-gray-500">{{ option.email }}</div>
								</div>
							</div>
						</template>
					</USelect>
				</div>

				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton color="gray" variant="ghost" @click="closeAddMemberModal">Cancel</UButton>
						<UButton color="primary" :loading="addLoading" @click="addMember" :disabled="!selectedUser || addLoading">
							Add Member
						</UButton>
					</div>
				</template>
			</UCard>
		</UModal>
	</UCard>
</template>

<script setup>
const props = defineProps({
	team: {
		type: Object,
		required: true,
	},
	canManageTeam: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['updated']);

// Composables
const { addUsersToTeam, removeUserFromTeam } = useTeams();
const { filteredUsers, fetchFilteredUsers, loading } = useFilteredUsers();
const toast = useToast();

// State
const showAddMember = ref(false);
const selectedUser = ref(null);
const addLoading = ref(false);
const removeLoading = ref(null);

// Computed
const availableUsersFormatted = computed(() => {
	// Filter out users who are already team members
	const teamUserIds = props.team.users.map((u) => u.directus_users_id.id);
	return filteredUsers.value.filter((user) => !teamUserIds.includes(user.id));
});

// Helper functions
const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}`;
};

const getUserFullName = (user) => {
	if (!user) return '';
	return `${user.first_name} ${user.last_name}`;
};

// Load available users when modal opens
watch(showAddMember, async (isOpen) => {
	if (isOpen) {
		try {
			// Fetch users for the current organization
			await fetchFilteredUsers(props.team.organization);
			console.log('Available users loaded:', filteredUsers.value);
		} catch (error) {
			console.error('Error fetching available users:', error);
			toast.add({
				title: 'Error',
				description: 'Failed to load available users',
				color: 'red',
			});
		}
	} else {
		selectedUser.value = null;
	}
});

// Add member
const addMember = async () => {
	if (!selectedUser.value) {
		console.log('No user selected');
		return;
	}

	console.log('Adding member:', selectedUser.value);
	console.log('Team ID:', props.team.id);
	console.log('Organization:', props.team.organization);

	addLoading.value = true;
	try {
		// First, add the user to the team
		console.log('Attempting to add user to team...');
		await addUsersToTeam(props.team.id, [selectedUser.value.id], props.team.organization);
		console.log('User added to team successfully');

		// Then refresh the filtered users
		console.log('Refreshing filtered users...');
		await fetchFilteredUsers(props.team.organization);
		console.log('Filtered users refreshed');

		closeAddMemberModal();
		emit('updated');
		toast.add({
			title: 'Success',
			description: 'Team member added successfully',
			color: 'green',
		});
	} catch (error) {
		console.error('Error adding team member:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to add team member',
			color: 'red',
		});
	} finally {
		addLoading.value = false;
	}
};

// Remove member
const removeMember = async (userId) => {
	console.log('Removing member:', userId);
	console.log('Team ID:', props.team.id);
	console.log('Organization:', props.team.organization);

	removeLoading.value = userId;
	try {
		console.log('Attempting to remove user from team...');
		await removeUserFromTeam(props.team.id, userId, props.team.organization);
		console.log('User removed from team successfully');

		console.log('Refreshing filtered users...');
		await fetchFilteredUsers(props.team.organization);
		console.log('Filtered users refreshed');

		emit('updated');
		toast.add({
			title: 'Success',
			description: 'Team member removed successfully',
			color: 'green',
		});
	} catch (error) {
		console.error('Error removing team member:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to remove team member',
			color: 'red',
		});
	} finally {
		removeLoading.value = null;
	}
};

const closeAddMemberModal = () => {
	showAddMember.value = false;
	selectedUser.value = null;
};
</script>

<template>
	<UModal :model-value="isOpen" @update:model-value="$emit('update:isOpen', $event)">
		<UCard>
			<template #header>
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-medium">Manage Assignments</h3>
					<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="handleCancel" />
				</div>
			</template>

			<div class="py-2">
				<!-- Current Assignments -->
				<div class="mb-4">
					<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Currently Assigned</h4>
					<div class="flex flex-wrap gap-2" v-if="selectedUsers.length">
						<UBadge
							v-for="userId in selectedUsers"
							:key="userId"
							color="gray"
							class="flex items-center gap-2"
							:class="isCurrentUserBadge(userId) ? 'border border-cyan-300' : ''"
						>
							<UAvatar
								:src="getAvatarUrl(getUserById(userId))"
								:alt="getUserFullName(getUserById(userId))"
								size="2xs"
							/>
							{{ getUserFullName(getUserById(userId)) }}
							<UButton
								color="white"
								variant="ghost"
								icon="i-heroicons-x-mark-20-solid"
								size="2xs"
								class="-mr-1"
								:ui="{ rounded: 'rounded-full' }"
								@click="removeUser(userId)"
							/>
						</UBadge>
					</div>
					<div v-else class="text-sm text-gray-500 italic">No users assigned</div>
				</div>

				<!-- User Selector -->
				<div>
					<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assign Users</h4>
					<USelectMenu
						v-model="selectedUser"
						:options="availableUsers"
						placeholder="Select users to assign..."
						searchable
						:loading="loadingUsers"
						@update:modelValue="handleUserSelect"
					>
						<template #option="{ option: user }">
							<div class="flex items-center gap-2 py-1">
								<UAvatar :src="getAvatarUrl(user)" :alt="user.label" size="sm" />
								<div class="flex flex-col">
									<span class="font-medium">{{ user.label }}</span>
									<span class="text-xs text-gray-500">{{ user.email }}</span>
								</div>
							</div>
						</template>
					</USelectMenu>
				</div>
			</div>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton variant="soft" color="gray" @click="handleCancel">Cancel</UButton>
					<UButton color="primary" @click="handleSave" :loading="isLoading">Save Assignments</UButton>
				</div>
			</template>
		</UCard>
	</UModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useFilteredUsers } from '~/composables/useFilteredUsers';

const props = defineProps({
	isOpen: {
		type: Boolean,
		default: false,
	},
	ticket: {
		type: Object,
		required: true,
	},
});

const emit = defineEmits(['update:isOpen', 'update']);

// Composables
const ticketsDirectusUsersItems = useDirectusItems('tickets_directus_users');
const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();
const toast = useToast();

// State
const isLoading = ref(false);
const selectedUser = ref(null);
const selectedUsers = ref([]);
const originalUsers = ref([]);

// Initialize from ticket
const initializeUsers = () => {
	// Get currently assigned users
	const assignedUsers = props.ticket.assigned_to?.map((a) => a.directus_users_id.id) || [];
	selectedUsers.value = [...assignedUsers];
	originalUsers.value = [...assignedUsers];
};

// Reset when modal opens
watch(
	() => props.isOpen,
	(isOpen) => {
		if (isOpen) {
			initializeUsers();
			// Fetch filtered users based on ticket organization and team
			if (props.ticket.organization?.id) {
				fetchFilteredUsers(props.ticket.organization.id, props.ticket.team?.id);
			}
		}
	},
);

// Get available users (not already selected)
const availableUsers = computed(() => {
	return filteredUsers.value
		.filter((user) => !selectedUsers.value.includes(user.id))
		.map((user) => ({
			id: user.id,
			label: `${user.first_name} ${user.last_name}`,
			email: user.email,
			avatar: user.avatar,
		}));
});

// User selection handler
const handleUserSelect = (user) => {
	if (user?.id && !selectedUsers.value.includes(user.id)) {
		selectedUsers.value.push(user.id);
		selectedUser.value = null; // Reset the selection
	}
};

// Remove user from selection
const removeUser = (userId) => {
	selectedUsers.value = selectedUsers.value.filter((id) => id !== userId);
};

// Helper functions
const getUserById = (userId) => {
	return filteredUsers.value.find((u) => u.id === userId);
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
	if (user.id === currentUser.value?.id) return 'You';
	return `${user.first_name} ${user.last_name}`.trim() || user.email || 'Unknown';
};

const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const isCurrentUserBadge = (userId) => {
	return userId === currentUser.value?.id;
};

// Save changes and close modal
const handleSave = async () => {
	try {
		isLoading.value = true;

		// Find assignments to remove
		const assignmentsToRemove = originalUsers.value.filter((id) => !selectedUsers.value.includes(id));

		// Find assignments to add
		const assignmentsToAdd = selectedUsers.value.filter((id) => !originalUsers.value.includes(id));

		// Delete removed assignments
		if (assignmentsToRemove.length > 0) {
			await ticketsDirectusUsersItems.remove({
				filter: {
					tickets_id: { _eq: props.ticket.id },
					directus_users_id: { _in: assignmentsToRemove },
				},
			});
		}

		// Add new assignments
		for (const userId of assignmentsToAdd) {
			await ticketsDirectusUsersItems.create({
				tickets_id: props.ticket.id,
				directus_users_id: userId,
			});
		}

		// Notify parent component
		emit('update', selectedUsers.value);

		// Success message
		toast.add({
			title: 'Success',
			description: 'Assignments updated successfully',
			color: 'green',
		});

		// Close modal
		emit('update:isOpen', false);
	} catch (error) {
		console.error('Error updating assignments:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to update assignments',
			color: 'red',
		});
	} finally {
		isLoading.value = false;
	}
};

// Cancel and close modal
const handleCancel = () => {
	emit('update:isOpen', false);
};
</script>

<template>
	<div class="grid grid-cols-1">
		<!-- User Selection Input -->
		<UFormGroup label="Assign To">
			<div v-if="loadingUsers" class="flex justify-center my-2">
				<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" />
			</div>

			<USelectMenu
				v-else
				v-model="selectedUser"
				:options="availableUserOptions"
				placeholder="Select users..."
				searchable
				@update:modelValue="handleUserSelect"
			>
				<template #label>
					<div class="flex items-center gap-2">
						<UIcon name="i-heroicons-user-plus" class="w-4 h-4 text-gray-500" />
						<span class="text-gray-500">{{ selectedUser ? selectedUser.label : 'Add user...' }}</span>
					</div>
				</template>

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

			<!-- Debug output in development only -->
			<div v-if="isDevelopment" class="text-[9px] mt-1 text-gray-500 uppercase">
				Available users: {{ availableUserOptions.length }}
			</div>
		</UFormGroup>

		<!-- Selected Users List -->
		<div v-if="assignedUsers.length" class="flex flex-wrap flex-row gap-2 mt-2">
			<!-- <UBadge
				v-for="userId in assignedUsers"
				:key="userId"
				color="gray"
				:class="isCurrentUserBadge(userId) ? 'border border-cyan-300' : ''"
				class="flex items-center gap-2"
			>
				<UAvatar
					v-if="userId"
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
			</UBadge> -->
			<UBadge
				v-for="userId in assignedUsers"
				:key="userId"
				color="gray"
				:class="isCurrentUserBadge(userId) ? 'border border-cyan-300' : ''"
				class="flex items-center gap-2"
			>
				<!-- Display avatar if user data is available -->
				<template v-if="getUserById(userId)">
					<UAvatar :src="getAvatarUrl(getUserById(userId))" :alt="getUserFullName(getUserById(userId))" size="2xs" />
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
				</template>

				<!-- Fallback if user not found -->
				<template v-else>
					<span class="text-xs">User ID: {{ userId }}</span>
					<UButton
						color="white"
						variant="ghost"
						icon="i-heroicons-x-mark-20-solid"
						size="2xs"
						class="-mr-1"
						:ui="{ rounded: 'rounded-full' }"
						@click="removeUser(userId)"
					/>
				</template>
			</UBadge>
		</div>

		<!-- Empty State -->
		<div v-else-if="!loadingUsers" class="text-xs text-gray-500 mt-6">No users assigned yet</div>
	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useFilteredUsers } from '~/composables/useFilteredUsers';

const props = defineProps({
	organizationId: {
		type: String,
		required: true,
	},
	teamId: {
		type: [String, null], // Allow both String and null values
		default: null,
	},
	assignedUsers: {
		type: Array,
		default: () => [],
	},
	disabled: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['update:assignedUsers', 'user-removed', 'user-added']);
const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();
const selectedUser = ref(null);

// For conditional debug information
const isDevelopment = computed(() => process.env.NODE_ENV === 'development');

// Create formatted user options for the select menu
const availableUserOptions = computed(() => {
	// First filter out users that are already assigned
	const filteredOptions = filteredUsers.value.filter((user) => !props.assignedUsers.includes(user.id));

	// Log available users count for debugging
	if (isDevelopment.value) {
		console.log(`Available users for selection: ${filteredOptions.length}`);
	}

	return filteredOptions;
});

// Initialize users data
const initUsers = async () => {
	console.log('Initializing users with:', {
		organizationId: props.organizationId,
		teamId: props.teamId,
	});

	if (props.organizationId) {
		await fetchFilteredUsers(props.organizationId, props.teamId);
	}
};

// Handle user selection
const handleUserSelect = (user) => {
	if (!user?.id) return;

	if (!props.assignedUsers.includes(user.id)) {
		const newAssignedUsers = [...props.assignedUsers, user.id];
		emit('update:assignedUsers', newAssignedUsers);
		emit('user-added', user.id);

		// Log the operation
		console.log(`Added user: ${user.label} (${user.id})`);

		// Reset selection
		selectedUser.value = null;
	}
};

// Remove user from assigned list
const removeUser = (userId) => {
	const newAssignedUsers = props.assignedUsers.filter((id) => id !== userId);
	emit('update:assignedUsers', newAssignedUsers);
	emit('user-removed', userId);

	// Log the operation
	console.log(`Removed user: ${userId}`);
};

// Helper functions
const getUserById = (userId) => {
	return filteredUsers.value.find((u) => u.id === userId);
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
	if (user.id === currentUser.value?.id) return 'You';

	return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown';
};

const getAvatarUrl = (user) => {
	if (!user) return null;

	if (!user.avatar) {
		// Generate placeholder avatar
		const name = encodeURIComponent(`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'U');
		return `https://ui-avatars.com/api/?name=${name}&background=eeeeee&color=00bfff`;
	}

	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const isCurrentUserBadge = (userId) => {
	return currentUser.value && userId === currentUser.value.id;
};

// Watch for organization or team changes
watch(
	[() => props.organizationId, () => props.teamId],
	async ([newOrgId, newTeamId], [oldOrgId, oldTeamId]) => {
		if (newOrgId !== oldOrgId || newTeamId !== oldTeamId) {
			console.log('Organization or team changed, refreshing users');

			if (newOrgId && newTeamId) {
				await fetchFilteredUsers(newOrgId, newTeamId);
			}
		}
	},
	{ immediate: true },
);

// Initialize on component mount
onMounted(() => {
	console.log('TicketsDetailsAssignment component mounted');
	initUsers();
});

// Expose methods to parent component
defineExpose({
	initUsers,
});
</script>

<template>
	<div class="grid grid-cols-2 gap-4">
		<UFormGroup label="Assign To">
			<USelectMenu
				v-model="selectedUser"
				:options="availableUsers"
				placeholder="Select users..."
				searchable
				:loading="loadingUsers"
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
		</UFormGroup>
		<div v-if="assignedUsers.length" class="flex flex-wrap flex-row gap-2 mt-6">
			<UBadge
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
			</UBadge>
		</div>
	</div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useFilteredUsers } from '~/composables/useFilteredUsers';

const props = defineProps({
	organizationId: {
		type: String,
		required: true,
	},
	teamId: {
		type: String,
		required: true,
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
const { user: currentUser } = useDirectusAuth();
const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();
const selectedUser = ref(null);

// Initialize filtered users
const initUsers = async () => {
	if (props.organizationId && props.teamId) {
		await fetchFilteredUsers(props.organizationId, props.teamId);
	}
};

// Call initUsers immediately
initUsers();

// Watch for changes in organizationId or teamId
watch(
	[() => props.organizationId, () => props.teamId],
	async ([newOrgId, newTeamId]) => {
		if (newOrgId && newTeamId) {
			await fetchFilteredUsers(newOrgId, newTeamId);
		}
	},
	{ immediate: true },
);

// Computed for available users
const availableUsers = computed(() => {
	return filteredUsers.value.filter((user) => !props.assignedUsers.includes(user.id));
});

// User selection handler
const handleUserSelect = (user) => {
	if (user?.id && !props.assignedUsers.includes(user.id)) {
		const newAssignedUsers = [...props.assignedUsers, user.id];
		emit('update:assignedUsers', newAssignedUsers);
		emit('user-added', user.id);
		selectedUser.value = null; // Reset the selection
	}
};

// Remove user handler
const removeUser = (userId) => {
	const newAssignedUsers = props.assignedUsers.filter((id) => id !== userId);
	emit('update:assignedUsers', newAssignedUsers);
	emit('user-removed', userId);
};

// Utility functions
const getUserById = (userId) => {
	return filteredUsers.value.find((u) => u.id === userId);
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
	if (user.id === currentUser.value.id) return 'You';
	return `${user.first_name} ${user.last_name}`.trim() || user.label || 'Unknown';
};

const getAvatarUrl = (user) => {
	if (!user?.avatar)
		return `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.first_name || '')}%20${encodeURIComponent(user?.last_name || '')}&background=eeeeee&color=00bfff`;

	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const isCurrentUserBadge = (userId) => {
	return currentUser.value && userId === currentUser.value.id;
};

// Expose methods to parent component
defineExpose({
	initUsers,
});
</script>

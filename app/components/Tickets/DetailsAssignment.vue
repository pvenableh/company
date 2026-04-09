<template>
	<UFormGroup label="Assigned To">
		<div class="space-y-2">
			<!-- Currently assigned users -->
			<div v-if="assignedUsers.length" class="flex flex-wrap gap-1.5">
				<UBadge
					v-for="userId in assignedUsers"
					:key="userId"
					color="gray"
					class="flex items-center gap-1.5"
				>
					<UAvatar
						:src="getAvatarUrl(getUserById(userId))"
						:alt="getUserFullName(getUserById(userId))"
						size="2xs"
					/>
					<span class="text-xs">{{ getUserFullName(getUserById(userId)) }}</span>
					<button
						class="ml-0.5 text-muted-foreground hover:text-foreground"
						@click="removeUser(userId)"
					>
						<UIcon name="i-heroicons-x-mark" class="h-3 w-3" />
					</button>
				</UBadge>
			</div>

			<!-- User selector -->
			<USelectMenu
				v-model="selectedUser"
				:options="availableUsers"
				placeholder="Add user..."
				searchable
				:loading="loadingUsers"
				@update:modelValue="handleUserSelect"
			>
				<template #option="{ option: user }">
					<div class="flex items-center gap-2 py-0.5">
						<UAvatar :src="getAvatarUrl(user)" :alt="user.label" size="2xs" />
						<span class="text-sm">{{ user.label }}</span>
					</div>
				</template>
			</USelectMenu>
		</div>
	</UFormGroup>
</template>

<script setup>
import { useFilteredUsers } from '~/composables/useFilteredUsers';

const props = defineProps({
	organizationId: {
		type: String,
		default: null,
	},
	teamId: {
		type: String,
		default: null,
	},
	assignedUsers: {
		type: Array,
		default: () => [],
	},
});

const emit = defineEmits(['update:assignedUsers', 'user-removed', 'user-added']);

const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();
const selectedUser = ref(null);

// Fetch users when org/team changes
watch(
	[() => props.organizationId, () => props.teamId],
	([orgId, teamId]) => {
		if (orgId) {
			fetchFilteredUsers(orgId, teamId);
		}
	},
	{ immediate: true },
);

const availableUsers = computed(() => {
	return filteredUsers.value
		.filter((user) => !props.assignedUsers.includes(user.id))
		.map((user) => ({
			id: user.id,
			label: `${user.first_name} ${user.last_name}`.trim() || user.email,
			email: user.email,
			avatar: user.avatar,
		}));
});

const handleUserSelect = (user) => {
	if (user?.id && !props.assignedUsers.includes(user.id)) {
		const updated = [...props.assignedUsers, user.id];
		emit('update:assignedUsers', updated);
		emit('user-added', user.id);
		selectedUser.value = null;
	}
};

const removeUser = (userId) => {
	const updated = props.assignedUsers.filter((id) => id !== userId);
	emit('update:assignedUsers', updated);
	emit('user-removed', userId);
};

const getUserById = (userId) => {
	return filteredUsers.value.find((u) => u.id === userId);
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
	return `${user.first_name} ${user.last_name}`.trim() || user.email || 'Unknown';
};

const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};
</script>

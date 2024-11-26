<template>
	<div class="space-y-2">
		<!-- Selected Users Display -->
		<div v-if="assignedUsers.length" class="flex flex-wrap gap-2 mb-2">
			<UBadge
				v-for="userId in assignedUsers"
				:key="userId"
				:color="isCurrentUserBadge(userId) ? 'primary' : 'gray'"
				class="flex items-center gap-2"
			>
				<UAvatar :src="getAvatarUrl(getUserById(userId))" :alt="getUserFullName(getUserById(userId))" size="2xs" />
				{{ getUserFullName(getUserById(userId)) }}
				<UButton
					color="white"
					variant="ghost"
					icon="i-heroicons-x-mark-20-solid"
					size="2xs"
					class="-mr-1"
					@click="removeUser(userId)"
				/>
			</UBadge>
		</div>

		<!-- User Select Menu -->
		<USelectMenu
			v-model="selectedUser"
			:options="availableUsers"
			placeholder="Assign user..."
			searchable
			:loading="isLoading"
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
</template>

<script setup>
const props = defineProps({
	task: {
		type: Object,
		required: true,
	},
});

const emit = defineEmits(['update']);
const { readUsers } = useDirectusUsers();
const { user: currentUser } = useDirectusAuth();
const { createItem, deleteItem } = useDirectusItems();
const { notify } = useNotifications();
const toast = useToast();

const isLoading = ref(false);
const userOptions = ref([]);
const selectedUser = ref(null);
const assignedUsers = ref([]);

// Fetch and format available users
const fetchUsers = async () => {
	try {
		const users = await readUsers({
			fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
		});

		userOptions.value = users.map((user) => ({
			id: user.id,
			label: `${user.first_name} ${user.last_name}`,
			email: user.email,
			avatar: user.avatar,
			first_name: user.first_name,
			last_name: user.last_name,
		}));

		// Initialize assigned users from task
		if (props.task.assigned_to) {
			assignedUsers.value = props.task.assigned_to.map((assignment) => assignment.directus_users_id.id);
		}
	} catch (error) {
		console.error('Error fetching users:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to load users',
			color: 'red',
		});
	}
};

// Computed property for available users (not already assigned)
const availableUsers = computed(() => {
	return userOptions.value.filter((user) => !assignedUsers.value.includes(user.id));
});

// Handle user selection
const handleUserSelect = async (user) => {
	if (!user?.id || assignedUsers.value.includes(user.id)) return;

	isLoading.value = true;
	try {
		// Create the assignment
		await createItem('tasks_directus_users', {
			tasks_id: props.task.id,
			directus_users_id: user.id,
		});

		// Update local state
		assignedUsers.value.push(user.id);

		// Notify the assigned user
		if (user.id !== currentUser.value?.id) {
			await notify({
				recipient: user.id,
				subject: 'New task assignment',
				message: `You have been assigned to the task: ${props.task.title}`,
				collection: 'tasks',
				item: props.task.id,
			});
		}

		toast.add({
			title: 'Success',
			description: 'User assigned successfully',
			color: 'green',
		});

		// Reset selection
		selectedUser.value = null;

		// Emit update event
		emit('update');
	} catch (error) {
		console.error('Error assigning user:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to assign user',
			color: 'red',
		});
	} finally {
		isLoading.value = false;
	}
};

// Remove user from task
const removeUser = async (userId) => {
	isLoading.value = true;
	try {
		// Find the junction record for this assignment
		const assignmentRecord = props.task.assigned_to.find((assignment) => assignment.directus_users_id.id === userId);

		if (assignmentRecord) {
			// Delete the assignment
			await deleteItem('tasks_directus_users', assignmentRecord.id);

			// Update local state
			assignedUsers.value = assignedUsers.value.filter((id) => id !== userId);

			// Notify the removed user
			if (userId !== currentUser.value?.id) {
				await notify({
					recipient: userId,
					subject: 'Removed from task',
					message: `You have been removed from the task: ${props.task.title}`,
					collection: 'tasks',
					item: props.task.id,
				});
			}

			toast.add({
				title: 'Success',
				description: 'User removed successfully',
				color: 'green',
			});

			// Emit update event
			emit('update');
		}
	} catch (error) {
		console.error('Error removing user assignment:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to remove user',
			color: 'red',
		});
	} finally {
		isLoading.value = false;
	}
};

// Utility functions
const getUserById = (userId) => {
	return userOptions.value.find((u) => u.id === userId);
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
	return `${user.first_name} ${user.last_name}`.trim() || user.label || 'Unknown';
};

const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const isCurrentUserBadge = (userId) => {
	return currentUser.value && userId === currentUser.value.id;
};

// Initialize component
onMounted(() => {
	fetchUsers();
});

// Watch for changes in task assignments
watch(
	() => props.task.assigned_to,
	(newAssignments) => {
		if (newAssignments) {
			assignedUsers.value = newAssignments.map((assignment) => assignment.directus_users_id.id);
		}
	},
	{ deep: true },
);
</script>

<template>
	<div class="w-full">
		<div class="flex items-start justify-between flex-col lg:flex-row flex-wrap">
			<!-- Form -->
			<form @submit.prevent="updateTicket" class="w-full lg:w-1/2 space-y-6">
				<UFormGroup label="Title" required>
					<UInput v-model="form.title" placeholder="Enter ticket title" :loading="isLoading" />
				</UFormGroup>

				<!-- Status and Priority Grid -->
				<div class="grid grid-cols-2 gap-4">
					<UFormGroup label="Status">
						<USelect
							v-model="form.status"
							:options="columns"
							option-attribute="name"
							value-attribute="id"
							:loading="isLoading"
						/>
					</UFormGroup>

					<UFormGroup label="Priority">
						<USelect v-model="form.priority" :options="priorities" :loading="isLoading" />
					</UFormGroup>
				</div>

				<!-- <UFormGroup label="Category">
					<UInput v-model="form.category" placeholder="Enter categories (comma-separated)" :loading="isLoading" />
				</UFormGroup> -->

				<!-- User Assignment -->
				<UFormGroup label="Assign To">
					<div class="space-y-2">
						<!-- Selected Users Display -->
						<div v-if="form.assigned_to.length" class="flex flex-wrap gap-2 mb-2">
							<UBadge
								v-for="userId in form.assigned_to"
								:key="userId"
								:color="isCurrentUserBadge(userId) ? 'primary' : 'gray'"
								class="flex items-center gap-2"
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
									@click="removeUser(userId)"
								/>
							</UBadge>
						</div>

						<!-- User Select Menu -->
						<USelectMenu
							v-model="selectedUser"
							:options="availableUsers"
							placeholder="Select users..."
							searchable
							:loading="isLoading"
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
					</div>
				</UFormGroup>

				<!-- Description -->
				<UFormGroup label="Description" required>
					<FormTiptap
						v-model="form.description"
						placeholder="Enter ticket description"
						:editor-props="{
							content: form.description,
						}"
					/>
				</UFormGroup>

				<div class="w-full flex flex-row items-center justify-between">
					<UButton
						variant="ghost"
						color="red"
						icon="i-heroicons-archive-box"
						:loading="isLoading"
						@click="confirmDelete"
						class="inline-block"
					/>

					<UButton type="submit" color="primary" :loading="isLoading" class="inline-block">Save Changes</UButton>
				</div>
				<div class="w-full lg:pb-20">
					<CommentsSystem :item-id="element.id" collection="tickets" />
				</div>
			</form>
			<div class="w-full lg:w-[500px] lg:border lg:shadow-lg lg:p-6 lg:sticky lg:top-20">
				<h4 class="uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider">Tasks</h4>
				<TicketsTasks :ticket-id="element.id" class="mt-4 pb-12" />
			</div>

			<!-- Comments and Tasks -->

			<!-- Delete Confirmation Modal -->
			<UModal v-model="showDeleteModal">
				<UCard>
					<template #header>
						<div class="flex items-center justify-between">
							<h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">Delete Ticket</h3>
						</div>
					</template>

					<p class="text-sm text-gray-500">
						Are you sure you want to delete this ticket? This action cannot be undone.
					</p>

					<template #footer>
						<div class="flex justify-end space-x-2">
							<UButton variant="soft" color="gray" @click="showDeleteModal = false">Cancel</UButton>
							<UButton color="red" :loading="isLoading" @click="deleteTicket">Delete</UButton>
						</div>
					</template>
				</UCard>
			</UModal>
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	element: {
		type: Object,
		required: true,
	},
	columns: {
		type: Array,
		required: true,
	},
	isLoading: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['close', 'deleted']);
const { createItem, deleteItems, deleteItem, updateItem } = useDirectusItems();
const { notify } = useNotifications();
const { readUsers } = useDirectusUsers();
const { user: currentUser } = useDirectusAuth();
const showDeleteModal = ref(false);
const userOptions = ref([]);
const selectedUser = ref(null);
const isLoading = ref(false);
const toast = useToast();

// Initialize form with element data
const form = ref({
	title: props.element.title,
	description: props.element.description,
	status: props.element.status,
	priority: props.element.priority,
	category: props.element.category,
	assigned_to: props.element.assigned_to?.map((assignment) => assignment.directus_users_id.id) || [],
});

const priorities = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
	{ value: 'urgent', label: 'Urgent' },
];

// Fetch users
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
	} catch (error) {
		console.error('Error fetching users:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to load users',
			color: 'red',
		});
	}
};

// Available users computed property
const availableUsers = computed(() => {
	return userOptions.value.filter((user) => !form.value.assigned_to.includes(user.id));
});

// Update ticket handler
const updateTicket = async () => {
	try {
		isLoading.value = true;
		const { assigned_to, ...ticketData } = form.value;

		// Update main ticket data
		await updateItem('tickets', props.element.id, {
			...ticketData,
			date_updated: new Date(),
		});

		// Get current assignments for comparison
		const currentAssignments = props.element.assigned_to?.map((a) => a.directus_users_id.id) || [];
		const newAssignments = assigned_to;

		// Find assignments to add
		const assignmentsToAdd = newAssignments.filter((id) => !currentAssignments.includes(id));

		// Add new assignments and notify users
		for (const userId of assignmentsToAdd) {
			await createItem('tickets_directus_users', {
				tickets_id: props.element.id,
				directus_users_id: userId,
			});
			await notifyUserAssignment(userId);
		}

		toast.add({
			title: 'Success',
			description: 'Ticket updated successfully',
			color: 'green',
		});
	} catch (error) {
		console.error('Error updating ticket:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to update ticket',
			color: 'red',
		});
		// Reload the original assignments on error
		form.value.assigned_to = props.element.assigned_to?.map((a) => a.directus_users_id.id) || [];
	} finally {
		isLoading.value = false;
	}
};
// Delete handlers
const confirmDelete = () => {
	showDeleteModal.value = true;
};

const deleteTicket = async () => {
	try {
		isLoading.value = true;
		await deleteItem('tickets', props.element.id);
		toast.add({
			title: 'Success',
			description: 'Ticket deleted successfully',
			color: 'green',
		});
		emit('deleted');
		emit('close');
	} catch (error) {
		console.error('Error deleting ticket:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to delete ticket',
			color: 'red',
		});
	} finally {
		showDeleteModal.value = false;
		isLoading.value = false;
	}
};

const notifyUserAssignment = async (userId) => {
	try {
		const assignedUser = getUserById(userId);
		if (!assignedUser || assignedUser.id === currentUser.value?.id) return;

		await notify({
			recipient: userId,
			subject: 'New ticket assignment',
			message: `You have been assigned to the ticket: ${props.element.title}`,
			collection: 'tickets',
			item: props.element.id,
		});
	} catch (error) {
		console.error('Error sending assignment notification:', error);
	}
};

// User selection handlers
const handleUserSelect = (user) => {
	if (user?.id && !form.value.assigned_to.includes(user.id)) {
		form.value.assigned_to.push(user.id);
		selectedUser.value = null;
	}
};

const removeUser = async (userId) => {
	try {
		// Find the junction record ID for this user assignment
		const assignmentRecord = props.element.assigned_to.find((assignment) => assignment.directus_users_id.id === userId);

		if (assignmentRecord) {
			// Delete the assignment
			await deleteItem('tickets_directus_users', assignmentRecord.id);

			// Update local state
			form.value.assigned_to = form.value.assigned_to.filter((id) => id !== userId);

			// Send notification if it's not the current user
			if (userId !== currentUser.value?.id) {
				await notify({
					recipient: userId,
					subject: 'Removed from ticket',
					message: `You have been removed from the ticket: ${props.element.title}`,
					collection: 'tickets',
					item: props.element.id,
				});
			}

			toast.add({
				title: 'Success',
				description: 'User removed successfully',
				color: 'green',
			});
		}
	} catch (error) {
		console.error('Error removing user assignment:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to remove user assignment',
			color: 'red',
		});
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

// Initialize users on mount
onMounted(fetchUsers);
</script>

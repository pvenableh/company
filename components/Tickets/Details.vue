<template>
	<div class="w-full">
		<div class="flex items-start justify-around flex-col lg:flex-row flex-wrap">
			<!-- Form -->
			<form @submit.prevent="updateTicket" class="w-full lg:w-1/2 space-y-6 relative">
				<div class="absolute -top-8 left-0 flex items-center justify-around">
					<div class="flex flex-col items-start mb-8">
						<p class="text-xs text-gray-500 uppercase">
							<span class="opacity-50 mr-1">Ticket #:</span>
							{{ element?.id }}
						</p>
						<p v-if="element?.organization" class="text-xs text-gray-500 uppercase">
							<span class="opacity-50 mr-1">Client:</span>
							{{ element?.organization.name }}
							<span v-if="element?.project" class="pl-4 text-xs">
								<span class="opacity-50 mr-1">Project:</span>
								{{ element?.project.title }}
							</span>
						</p>
					</div>
				</div>
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

				<div class="grid grid-cols-2 gap-4">
					<UFormGroup label="Due Date">
						<div class="grid grid-cols-2 gap-4">
							<UPopover>
								<UInput
									:model-value="formatDisplayDate(form.due_date)"
									:readonly="true"
									:placeholder="formatDisplayDate(new Date())"
									icon="i-heroicons-calendar"
								/>
								<template #panel>
									<VCalendar :attributes="calendarAttrs" is-expanded v-model="selectedDate" @dayclick="updateDueDate" />
								</template>
							</UPopover>

							<USelect
								v-model="selectedTime"
								:options="timeOptions"
								placeholder="Select time"
								@update:model-value="updateDateTime"
							/>
						</div>
					</UFormGroup>
				</div>
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
						@mention="handleMention"
						:editor-props="{
							content: form.description,
						}"
					/>
				</UFormGroup>

				<div class="w-full flex flex-row items-center justify-between space-x-8">
					<div class="flex items-center flex-row">
						<UButton
							type="submit"
							color="primary"
							:variant="isDirty ? 'solid' : 'outline'"
							:loading="isLoading"
							:icon="isDirty ? 'i-material-symbols-save-outline' : 'i-material-symbols-save'"
							class="flex items-center justify-center w-12 h-12 transition-all"
							:class="{ 'ring-2 ring-primary-500 ring-offset-2 animate-pulse': isDirty }"
							:ui="{ rounded: 'rounded-full' }"
						/>
						<Share
							class="ml-4"
							:url="'https://huestudios.company/tickets/' + element.id"
							:title="'Hue Ticket #' + element.id"
							:description="element.title"
							@share="handleShare"
						/>
					</div>
					<UButton
						variant="outline"
						color="red"
						icon="i-material-symbols-delete-outline"
						:ui="{ rounded: 'rounded-full' }"
						:loading="isLoading"
						class="iflex items-center justify-center w-12 h-12"
						@click="confirmDelete"
					/>
				</div>

				<div class="w-full lg:pb-20">
					<CommentsSystem :item-id="element.id" collection="tickets" />
				</div>
			</form>
			<div class="w-full lg:w-[500px] lg:border lg:shadow-lg lg:p-6 lg:sticky lg:top-20 mt-12 lg:mt-12 ticket__tasks">
				<h4 class="w-full uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider">Tasks</h4>
				<TicketsTasks :ticket-id="element.id" class="mt-4 pb-12" />
			</div>

			<!-- Comments and Tasks -->

			<!-- Delete Confirmation Modal -->
			<UModal v-model="showDeleteModal">
				<UCard>
					<div class="flex items-center justify-between mb-8">
						<h3 class="text-2xl leading-5 font-thin uppercase tracking-wide">
							Delete
							<br />
							Ticket
						</h3>
					</div>
					<p class="text-sm text-gray-500">
						Are you sure you want to delete this ticket? This action cannot be undone.
					</p>
					<div class="flex justify-end space-x-2 mt-8">
						<UButton variant="soft" color="gray" @click="showDeleteModal = false">Cancel</UButton>
						<UButton color="red" :loading="isLoading" @click="deleteTicket">Delete</UButton>
					</div>
				</UCard>
			</UModal>

			<UModal v-model="showUnsavedModal">
				<UCard>
					<div class="flex items-center justify-between mb-8">
						<h3 class="text-2xl leading-5 font-thin uppercase tracking-wide">Unsaved Changes</h3>
					</div>
					<p class="text-sm text-gray-500">You have unsaved changes. Would you like to save them before leaving?</p>
					<div class="flex justify-end space-x-2 mt-8">
						<UButton variant="soft" color="gray" @click="handleDiscard">Discard</UButton>
						<UButton color="primary" :loading="isLoading" @click="handleSave">Save</UButton>
					</div>
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
const handleShare = (method) => {
	console.log(`Shared via ${method}`);
};
const emit = defineEmits(['close', 'deleted', 'preventClose']);
const { createItem, deleteItems, deleteItem, updateItem } = useDirectusItems();
const { notify } = useNotifications();
const { readUsers } = useDirectusUsers();
const { user: currentUser } = useDirectusAuth();
const showDeleteModal = ref(false);
const userOptions = ref([]);
const selectedUser = ref(null);
const isLoading = ref(false);
const initialFormState = ref({});
const isDirty = ref(false);
const showUnsavedModal = ref(false);
const toast = useToast();
const mentionedUsers = ref(new Set());
const calendarAttrs = [
	{
		key: 'today',
		dot: true,
		dates: new Date(),
	},
];

// Track form changes
const trackChanges = () => {
	const currentState = {
		title: form.value.title,
		description: form.value.description,
		status: form.value.status,
		priority: form.value.priority,
		category: form.value.category,
		assigned_to: [...form.value.assigned_to],
		due_date: form.value.due_date,
	};

	isDirty.value = JSON.stringify(currentState) !== JSON.stringify(initialFormState.value);
};

// Initialize form with element data
const form = ref({
	title: props.element.title,
	description: props.element.description,
	status: props.element.status,
	priority: props.element.priority,
	category: props.element.category,
	assigned_to: props.element.assigned_to?.map((assignment) => assignment.directus_users_id.id) || [],
	due_date: props.element.due_date,
});

const priorities = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
	{ value: 'urgent', label: 'Urgent' },
];

watch(
	() => ({ ...form.value }),
	() => {
		trackChanges();
		emit('preventClose', isDirty.value);
	},
	{ deep: true },
);

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

const selectedDate = ref(props.element.due_date ? new Date(props.element.due_date) : new Date());
const selectedTime = ref(props.element.due_date ? props.element.due_date.slice(11, 16) : '17:00');

const timeOptions = Array.from({ length: 48 }, (_, i) => {
	const hour = Math.floor(i / 2);
	const minute = (i % 2) * 30;
	const time = new Date();
	time.setHours(hour, minute);
	return {
		label: time.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: true,
		}),
		value: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
	};
});

const formatDisplayDate = (date) => {
	if (!date) return '';
	// Create date in local timezone
	const localDate = new Date(date);
	return localDate.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, // Use user's local timezone
	});
};

const updateDueDate = (day) => {
	// Create a new date object in local timezone
	selectedDate.value = new Date(day.date);
	updateDateTime();
};

const updateDateTime = () => {
	if (selectedDate.value && selectedTime.value) {
		// Get the user's timezone
		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

		// Parse hours and minutes
		const [hours, minutes] = selectedTime.value.split(':');

		// Create date in local timezone
		const dateTime = new Date(selectedDate.value);

		// Set hours and minutes in local timezone
		dateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

		// Convert to ISO string while preserving timezone offset
		const offset = dateTime.getTimezoneOffset();
		const localISOTime = new Date(dateTime.getTime() - offset * 60 * 1000).toISOString();

		form.value.due_date = localISOTime;

		console.log({
			localDateTime: dateTime.toString(),
			timezone: userTimezone,
			isoString: form.value.due_date,
			offset: offset,
		});
	}
};
const handleMention = (mentionData) => {
	mentionedUsers.value.add(mentionData.id);
};

async function notifyMentionedUsers(commentText, collection, itemId) {
	for (const userId of mentionedUsers.value) {
		await notify({
			recipient: userId,
			subject: 'You were mentioned in a ticket',
			message: `${currentUser.value.first_name} ${currentUser.value.last_name} mentioned you in a ticket: ${commentText}`,
			collection,
			item: itemId,
		});
	}
}
// Update ticket handler
const updateTicket = async () => {
	try {
		isLoading.value = true;
		const { assigned_to, ...ticketData } = form.value;

		if (mentionedUsers.value.size > 0) {
			const result = await notifyMentionedUsers(form.value.title, 'tickets', props.element?.id);
			console.log(result);
		}

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
		isDirty.value = false;
		initialFormState.value = {
			title: form.value.title,
			description: form.value.description,
			status: form.value.status,
			priority: form.value.priority,
			category: form.value.category,
			assigned_to: [...form.value.assigned_to],
		};

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
onMounted(() => {
	fetchUsers();
	initialFormState.value = {
		title: props.element.title,
		description: props.element.description,
		status: props.element.status,
		priority: props.element.priority,
		category: props.element.category,
		assigned_to: [...form.value.assigned_to],
	};
});

// Handle navigation protection
const router = useRouter();
const handleBeforeUnload = (e) => {
	if (isDirty.value) {
		e.preventDefault();
		e.returnValue = '';
	}
};

// Router navigation guard
const routerGuard = router.beforeEach((to, from, next) => {
	if (isDirty.value) {
		showUnsavedModal.value = true;
		next(false);
	} else {
		next();
	}
});

// Add cleanup
onBeforeUnmount(() => {
	window.removeEventListener('beforeunload', handleBeforeUnload);
	routerGuard();
});

// Add save/discard handlers
const handleSave = async () => {
	await updateTicket();
	if (!isLoading.value) {
		showUnsavedModal.value = false;
		isDirty.value = false;
		emit('close');
	}
};

const handleDiscard = () => {
	showUnsavedModal.value = false;
	isDirty.value = false;
	emit('close');
};
</script>
<style>
.ticket {
	&__tasks {
		.tiptap-container {
			font-size: 12px;
		}
	}
}
</style>

<template>
	<div class="w-full mx-auto">
		<LayoutUserPresenceIndicator v-if="currentUser" />
		<TicketsStatusTimeline :currentStatus="form.status" class="mb-4" />
		<div class="flex items-start justify-between flex-col lg:flex-row flex-wrap">
			<!-- Form -->

			<form @submit.prevent="updateTicket" class="w-full lg:w-1/2 space-y-6 relative">
				<div class="w-full flex flex-col items-start mt-4">
					<p class="text-[9px] text-gray-500 uppercase">
						<span class="opacity-50 mr-1">Ticket #:</span>
						{{ element?.id }}
					</p>

					<p v-if="element?.organization" class="text-[9px] text-gray-500 uppercase">
						<span class="opacity-50 mr-1">Client:</span>
						{{ element?.organization.name }}
						<span v-if="element?.project" class="pl-4">
							<span class="opacity-50 mr-1">Project:</span>
							{{ element?.project.title }}
						</span>
					</p>
					<p v-if="element?.user_created" class="text-[9px] text-gray-500 uppercase">
						<span class="opacity-50 mr-1">Created by:</span>
						{{ element?.user_created.first_name }} {{ element?.user_created.last_name }}
					</p>
				</div>
				<div class="relative w-1/3">
					<UFormGroup label="Priority:">
						<URange v-model="priorityValue" :max="rangeMax" :step="1" :color="color" />
						<!-- <p class="uppercase text-[10px]">{{ priorities.find((p) => p.value === form.priority).label }}</p> -->
						<div class="absolute -top-[27px] left-[80px]">
							<p class="uppercase text-[12px] inline-block tracking-wide font-bold" :style="{ color: color }">
								{{ priorities[priorityValue].label }}
							</p>
							<!-- <span class="inline-block -mb-4 ml-1">{{ priorities[priorityValue].icon }}</span> -->
						</div>
					</UFormGroup>
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
					<UFormGroup v-if="form.organization" label="Project">
						<USelectMenu
							searchable
							v-model="form.project"
							:options="projectOptions"
							option-attribute="title"
							value-attribute="id"
							placeholder="Select project"
							:loading="loadingProjects"
							class="relative"
						/>
					</UFormGroup>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<!-- <UFormGroup label="Priority">
						<USelect v-model="form.priority" :options="priorities" :loading="isLoading" />
					</UFormGroup> -->

					<UFormGroup label="Due Date">
						<UPopover>
							<UInput
								:model-value="formatDisplayDate(form.due_date)"
								:readonly="true"
								:placeholder="formatDisplayDate(new Date())"
								icon="i-heroicons-calendar"
								class="w-full"
							/>
							<template #panel>
								<VCalendar :attributes="calendarAttrs" is-expanded v-model="selectedDate" @dayclick="updateDueDate" />
							</template>
						</UPopover>
					</UFormGroup>

					<UFormGroup label="Due Time">
						<USelect
							v-model="selectedTime"
							:options="timeOptions"
							placeholder="Select time"
							@update:model-value="updateDateTime"
						/>
					</UFormGroup>
				</div>
				<!-- User Assignment -->
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
					<div v-if="form.assigned_to.length" class="flex flex-wrap flex-row gap-2 mt-6">
						<UBadge
							v-for="userId in form.assigned_to"
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
				<!-- Description -->
				<UFormGroup label="Description" required>
					<FormTiptap
						v-model="form.description"
						placeholder="Enter ticket description"
						@mention="handleMention"
						:editor-props="{
							content: form.description,
						}"
						:organization-id="element.organization.id"
						:context="{
							collection: 'tickets',
							itemId: element.id,
						}"
					/>
				</UFormGroup>

				<div class="flex flex-row items-center justify-between space-x-2">
					<Share
						class="ml-4"
						:url="'https://huestudios.company/tickets/' + element.id"
						:title="'Hue Ticket #' + element.id"
						:description="element.title"
						@share="handleShare"
					/>
					<div class="space-x-2">
						<UButton variant="soft" color="red" :loading="isLoading" @click="confirmDelete">Delete</UButton>
						<UButton
							:disabled="!hasAccess"
							type="submit"
							color="primary"
							:loading="isLoading"
							:variant="isDirty ? 'solid' : 'outline'"
							class="transition-all"
							:class="{ ' animate-pulse': isDirty }"
						>
							Save
						</UButton>
					</div>
				</div>

				<div class="w-full lg:pb-20">
					<CommentsSystem :item-id="element.id" collection="tickets" />
				</div>
			</form>
			<div
				class="w-full lg:w-[500px] border-gray-50 lg:border lg:shadow lg:p-6 lg:sticky lg:top-20 mt-12 lg:mt-12 ticket__tasks"
			>
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

const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();
const handleShare = (method) => {
	console.log(`Shared via ${method}`);
};
const config = useRuntimeConfig();
const adminRole = config.public.adminRole;
const emit = defineEmits(['close', 'deleted', 'preventClose']);
const { createItem, deleteItem, updateItem, readItems } = useDirectusItems();
const { notify } = useNotifications();
const { user: currentUser } = useDirectusAuth();
const showDeleteModal = ref(false);
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
const { hasMultipleOrgs, orgOptions, selectedOrg } = useOrganization();

watch(
	() => props.element?.status,
	(newStatus) => {
		form.value.status = newStatus;
	},
);

// Track form changes
const trackChanges = () => {
	const currentState = {
		title: form.value.title,
		description: form.value.description,
		status: form.value.status,
		organization: form.value.organization,
		project: form.value.project,
		priority: form.value.priority,
		category: form.value.category,
		assigned_to: [...form.value.assigned_to],
		due_date: form.value.due_date,
	};

	const isDifferent = JSON.stringify(currentState) !== JSON.stringify(initialFormState.value);

	if (isDirty.value !== isDifferent) {
		isDirty.value = isDifferent;
		emit('preventClose', isDifferent);
	}
};

// Initialize form with element data
const form = ref({
	title: props.element.title,
	description: props.element.description,
	status: props.element.status,
	priority: props.element.priority,
	category: props.element.category,
	project: props.element.project,
	organization: props.element.organization.id,
	assigned_to: props.element.assigned_to?.map((assignment) => assignment.directus_users_id.id) || [],
	due_date: props.element.due_date,
});

const priorities = [
	{ value: 'low', label: 'Low', icon: '😎👍' },
	{ value: 'medium', label: 'Medium', icon: '👀💪' },
	{ value: 'high', label: 'High', icon: '🙀❗️' },
];

const priorityLevels = ['Low', 'Medium', 'High'];

const priorityValue = computed({
	get() {
		// Find the index of the *capitalized* version in priorityLevels
		const capitalizedPriority = priorities.find((p) => p.value === form.value.priority)?.label || 'Low'; // Default to Low if not found
		return priorityLevels.indexOf(capitalizedPriority);
	},
	set(newValue) {
		// Get the lowercase value from the priorities array
		form.value.priority = priorities[newValue].value;
	},
});

const color = computed(() => {
	switch (
		priorityLevels[priorityValue.value] // Use priorityLevels here
	) {
		case 'Low':
			return 'gray';
		case 'Medium':
			return 'orange';
		case 'High':
			return 'red';
		default:
			return 'gray';
	}
});

const rangeMax = priorityLevels.length - 1;

watch(
	() => ({
		title: form.value.title,
		description: form.value.description,
		status: form.value.status,
		priority: form.value.priority,
		project: form.value.project,
		organization: form.value.organization,
		category: form.value.category,
		assigned_to: [...form.value.assigned_to],
		due_date: form.value.due_date,
	}),
	() => {
		trackChanges();
	},
	{ deep: true },
);

const resetFormState = () => {
	initialFormState.value = {
		title: form.value.title,
		description: form.value.description,
		status: form.value.status,
		priority: form.value.priority,
		project: form.value.project,
		organization: form.value.organization,
		category: form.value.category,
		assigned_to: [...form.value.assigned_to],
		due_date: form.value.due_date,
	};
	projectOptions.value = [];
	loadingProjects.value = false;
	isDirty.value = false;
	emit('preventClose', false);
};

const projectOptions = ref([]);
const loadingProjects = ref(false);

const fetchProjects = async (orgId) => {
	console.log(orgId);
	if (!orgId) {
		projectOptions.value = [];
		form.value.project = null;
		return;
	}

	loadingProjects.value = true;
	try {
		const projects = await readItems('projects', {
			fields: ['id', 'title'],
			filter: {
				organization: { _eq: orgId },
			},
		});
		console.log(projects);
		projectOptions.value = [{ id: null, title: 'None' }, ...projects];
	} catch (error) {
		console.error('Error fetching projects:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to load projects',
			color: 'red',
		});
		projectOptions.value = [];
	} finally {
		loadingProjects.value = false;
	}
};

const hasDeleteAccess = computed(() => {
	const isCreator = currentUser.value.id === props.element.user_created.id;
	const isAdmin = currentUser.value.role === adminRole;

	return isAdmin || isCreator;
});

const hasAccess = computed(() => {
	const isCreator = currentUser.value.id === props.element.user_created.id;
	const isAdmin = currentUser.value.role === adminRole;
	const isAssigned = props.element.assigned_to?.some(
		(assignment) => assignment.directus_users_id.id === currentUser.value.id,
	);

	return isAdmin || isCreator || isAssigned;
});

const availableUsers = computed(() => {
	return filteredUsers.value.filter((user) => !form.value.assigned_to.includes(user.id));
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

const sendTicketNotification = async (userId, type, message) => {
	// Skip notification if it's the current user
	if (userId === currentUser.value?.id) return;

	try {
		await notify({
			recipient: userId,
			subject: `Ticket ${type}`,
			message: `${message}`,
			collection: 'tickets',
			item: props.element.id,
			sender: currentUser.value.id,
		});
	} catch (error) {
		console.error(`Error sending ${type} notification:`, error);
	}
};
// Update ticket handler
// Update ticket handler with consolidated notifications
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

		// Process new assignments and mentions in a single batch
		const notificationPromises = [];

		// Handle new assignments
		for (const userId of assignmentsToAdd) {
			// Create the assignment record
			await createItem('tickets_directus_users', {
				tickets_id: props.element.id,
				directus_users_id: userId,
			});

			// Queue assignment notification
			notificationPromises.push(
				sendTicketNotification(
					userId,
					'Assignment',
					`You have been assigned to the ticket:  <br/><a class="text-[var(--cyan)] font-bold" href='https://huestudios.company/tickets/${props.element.id}'>${props.element.title}</a>`,
				),
			);
		}

		// Handle mentions (if any)
		if (mentionedUsers.value.size > 0) {
			for (const userId of mentionedUsers.value) {
				notificationPromises.push(
					sendTicketNotification(
						userId,
						'Mention',
						`${currentUser.value.first_name} ${currentUser.value.last_name} mentioned you in the ticket: <br/><a class="text-[var(--cyan)] font-bold" href='https://huestudios.company/tickets/${props.element.id}'>${props.element.title}</a>`,
					),
				);
			}
		}

		// Send all notifications in parallel
		await Promise.all(notificationPromises);

		resetFormState();
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
	if (!hasDeleteAccess.value) {
		toast.add({
			title: 'Warning',
			description: "You don't have access to delete this ticket.",
			color: 'red',
		});
	} else {
		showDeleteModal.value = true;
	}
};

const deleteTicket = async () => {
	try {
		isLoading.value = true;
		if (currentUser.value.role === adminRole) {
			console.log('yes should delete');
			await deleteItem('tickets', props.element.id);
		} else {
			console.log('yes should archive');
			await updateItem('tickets', props.element.id, {
				status: 'archived',
			});
		}
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
		router.push('/tickets');
		showDeleteModal.value = false;
		isLoading.value = false;
	}
};

// User selection handlers

const handleUserSelect = (user) => {
	if (user?.id && !form.value.assigned_to.includes(user.id)) {
		form.value.assigned_to.push(user.id);
		selectedUser.value = null; // Reset the selection
		console.log(form.value.assigned_to);
	}
};

const removeUser = async (userId) => {
	try {
		// Update local state
		form.value.assigned_to = form.value.assigned_to.filter((id) => id !== userId);

		// Find the junction record ID for this user assignment
		const assignmentRecord = props.element.assigned_to.find((assignment) => assignment.directus_users_id.id === userId);

		if (assignmentRecord) {
			// Delete the assignment
			await deleteItem('tickets_directus_users', assignmentRecord.id);

			// Send removal notification
			await sendTicketNotification(
				userId,
				'Removal',
				`You have been removed from the ticket:  <br/><a style="text-[var(--cyan)] font-bold" href='https://huestudios.company/tickets/${props.element.id}'>${props.element.title}</a>`,
			);

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
	return filteredUsers.value.find((u) => u.id === userId);
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
	if (user.id === currentUser.value.id) return 'You';
	return `${user.first_name} ${user.last_name}`.trim() || user.label || 'Unknown';
};

const getAvatarUrl = (user) => {
	if (!user?.avatar)
		return `https://ui-avatars.com/api/?name=${user?.first_name}%20${user?.last_name}&background=eeeeee&color=00bfff`;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const isCurrentUserBadge = (userId) => {
	return currentUser.value && userId === currentUser.value.id;
};

// Initialize users on mount
onMounted(() => {
	fetchFilteredUsers(); // Fetch filtered users when the component mounts
	resetFormState(); // Initialize form state
	fetchProjects(props.element.organization?.id);
	if (!form.value.priority) {
		form.value.priority = 'Low'; // Or your default priority
	}
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
	if (routerGuard) {
		routerGuard();
	}
});

// Add save/discard handlers
const handleSave = async () => {
	await updateTicket();
	if (!isLoading.value) {
		showUnsavedModal.value = false;
		resetFormState();
		emit('close');
	}
};

const handleDiscard = () => {
	// Reset form back to initial values
	form.value = {
		title: initialFormState.value.title,
		description: initialFormState.value.description,
		status: initialFormState.value.status,
		priority: initialFormState.value.priority,
		category: initialFormState.value.category,
		assigned_to: [...initialFormState.value.assigned_to], // Spread operator for array
		due_date: initialFormState.value.due_date,
	};

	showUnsavedModal.value = false;
	isDirty.value = false;
	emit('preventClose', false);
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

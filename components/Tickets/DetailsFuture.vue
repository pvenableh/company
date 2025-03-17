<template>
	<div class="w-full mx-auto">
		<LayoutUserPresenceIndicator v-if="currentUser" />

		<!-- Main Content with Tabs -->
		<div class="mb-4 border-b border-gray-200">
			<div class="flex flex-wrap -mb-px">
				<button
					v-for="tab in tabs"
					:key="tab.id"
					class="inline-block p-4 border-b-2 rounded-t-lg text-sm uppercase tracking-wide font-medium"
					:class="
						activeTab === tab.id
							? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
							: 'border-transparent hover:border-gray-300'
					"
					@click="activeTab = tab.id"
				>
					<UIcon :name="tab.icon" class="w-5 h-5 mr-2 inline-block" />
					{{ tab.name }}
					<span
						v-if="tab.id === 'comments' && commentCount > 0"
						class="ml-2 px-2 py-0.5 text-xs rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-800 dark:text-cyan-100"
					>
						{{ commentCount }}
					</span>
					<span
						v-if="tab.id === 'tasks' && taskCount > 0"
						class="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"
					>
						{{ taskCount }}
					</span>
				</button>
			</div>
		</div>

		<!-- Ticket Header - Always Visible -->
		<div class="flex flex-col lg:flex-row justify-between items-start mb-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
			<!-- Left side: Title and status -->
			<div class="flex-grow">
				<h2 class="text-xl font-bold">{{ element.title }}</h2>
				<div class="flex flex-wrap gap-2 mt-2">
					<UBadge :color="getStatusColor(element.status)" size="md">{{ element.status }}</UBadge>
					<UBadge :color="getPriorityColor(element.priority)" size="md">{{ element.priority }}</UBadge>

					<div class="flex items-center text-xs text-gray-500 ml-2" v-if="element.due_date">
						<UIcon name="i-heroicons-calendar" class="mr-1" />
						{{ formatDate(element.due_date) }}
					</div>
				</div>
			</div>

			<!-- Right side: Actions -->
			<div class="flex gap-2 mt-4 lg:mt-0">
				<UButton
					v-if="!isMetadataExpanded"
					size="sm"
					variant="ghost"
					icon="i-heroicons-information-circle"
					@click="isMetadataExpanded = true"
				>
					Details
				</UButton>
				<UButton
					size="sm"
					variant="soft"
					:color="isEditing ? 'primary' : 'gray'"
					icon="i-heroicons-pencil-square"
					@click="toggleEditing"
				>
					{{ isEditing ? 'Done Editing' : 'Edit' }}
				</UButton>
				<UButton icon="i-heroicons-ellipsis-horizontal" size="sm" variant="soft" color="gray">
					<UDropdown :items="actionItems"></UDropdown>
				</UButton>
			</div>
		</div>

		<!-- Collapsible Metadata Section -->
		<div
			v-if="isMetadataExpanded"
			class="mb-6 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg transition-all duration-300 ease-in-out"
		>
			<div class="flex justify-between items-center mb-4">
				<h3 class="text-sm font-medium uppercase tracking-wide">Ticket Details</h3>
				<UButton size="xs" variant="ghost" icon="i-heroicons-x-mark" @click="isMetadataExpanded = false" />
			</div>

			<div class="grid md:grid-cols-3 gap-4">
				<!-- Column 1: Basic Info -->
				<div class="space-y-2">
					<div>
						<div class="text-xs text-gray-500 uppercase">Ticket ID</div>
						<div class="text-sm font-medium">{{ element.id }}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500 uppercase">Created By</div>
						<div class="text-sm font-medium">
							{{ element.user_created?.first_name }} {{ element.user_created?.last_name }}
						</div>
					</div>
					<div>
						<div class="text-xs text-gray-500 uppercase">Created Date</div>
						<div class="text-sm font-medium">{{ formatDate(element.date_created, true) }}</div>
					</div>
				</div>

				<!-- Column 2: Organization Info -->
				<div class="space-y-2">
					<div>
						<div class="text-xs text-gray-500 uppercase">Organization</div>
						<div class="text-sm font-medium">{{ element.organization?.name || 'None' }}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500 uppercase">Team</div>
						<div class="text-sm font-medium">{{ element.team?.name || 'None' }}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500 uppercase">Project</div>
						<div class="text-sm font-medium">{{ element.project?.title || 'None' }}</div>
					</div>
				</div>

				<!-- Column 3: Assignment -->
				<div>
					<div class="text-xs text-gray-500 uppercase mb-2">Assigned To</div>
					<div class="flex flex-wrap gap-2">
						<UAvatar
							v-for="assignment in element.assigned_to"
							:key="assignment.directus_users_id.id"
							:src="getAvatarUrl(assignment.directus_users_id)"
							:alt="getUserFullName(assignment.directus_users_id)"
							size="sm"
						>
							<UTooltip :text="getUserFullName(assignment.directus_users_id)" />
						</UAvatar>
						<UButton
							v-if="isEditing"
							size="xs"
							variant="soft"
							icon="i-heroicons-user-plus"
							@click="openAssignmentModal"
						/>
					</div>
				</div>
			</div>

			<!-- Description Section -->
			<div class="mt-4">
				<div class="flex justify-between items-center">
					<div class="text-xs text-gray-500 uppercase mb-2">Description</div>
					<UButton
						v-if="isEditing"
						size="xs"
						color="gray"
						variant="ghost"
						icon="i-heroicons-pencil-square"
						@click="editDescription"
					/>
				</div>
				<div
					v-if="!isEditingDescription"
					class="prose prose-sm max-w-none dark:prose-invert p-3 bg-white dark:bg-gray-900 rounded-lg"
					v-html="element.description"
				></div>
				<FormTiptap
					v-else
					v-model="form.description"
					:organization-id="element.organization?.id"
					@mention="handleMention"
					class="bg-white rounded-lg"
				/>
			</div>
		</div>

		<!-- Tab Content -->
		<div class="mt-4">
			<!-- Comments Tab -->
			<div v-show="activeTab === 'comments'" class="animate-fadein">
				<CommentsSystem :item-id="element.id" collection="tickets" @update:commentCount="handleCommentCountUpdate" />
			</div>

			<!-- Tasks Tab -->
			<div v-show="activeTab === 'tasks'" class="animate-fadein">
				<TicketsTasks :ticket-id="element.id" @task-count-update="handleTaskCountUpdate" />
			</div>

			<!-- Edit Tab -->
			<div v-show="activeTab === 'edit'" class="animate-fadein">
				<TicketsDetailsForm
					ref="formRef"
					:ticket="element"
					:columns="columns"
					:is-loading="isLoading"
					@update="updateTicket"
					@delete-click="showDeleteModal = true"
					@comment-count-update="handleCommentCountUpdate"
					@share="handleShare"
					@change="handleFormChange"
					@dirty-state-change="handleDirtyStateChange"
					class="w-full"
				/>
			</div>

			<!-- Activity Tab -->
			<div v-show="activeTab === 'activity'" class="animate-fadein">
				<TicketsActivityLog :ticket-id="element.id" />
			</div>
		</div>

		<!-- Modals -->
		<TicketsModalDelete
			v-model:is-open="showDeleteModal"
			:is-loading="isLoading"
			@delete="deleteTicket"
			@cancel="showDeleteModal = false"
		/>

		<TicketsModalUnsaved
			v-model:is-open="showUnsavedModal"
			:is-loading="isLoading"
			@save="handleSave"
			@discard="handleDiscard"
		/>

		<TicketsAssignmentModal
			v-if="showAssignmentModal"
			v-model:is-open="showAssignmentModal"
			:ticket="element"
			@update="handleAssignmentUpdate"
		/>
	</div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useNotifications } from '~/composables/useNotifications';
import { useNotificationHelper } from '~/composables/useNotificationHelper';

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

const emit = defineEmits(['close', 'deleted', 'preventClose', 'commentCountUpdated']);

// Composables
const { user: currentUser } = useDirectusAuth();
const { deleteItem, updateItem } = useDirectusItems();
const { notify } = useNotifications();
const toast = useToast();
const router = useRouter();
const { notifyTicketStatusChange, notifyTicketAssignment, notifyTicketUpdate, notifyMentions } =
	useNotificationHelper();

// Refs
const formRef = ref(null);
const showDeleteModal = ref(false);
const showUnsavedModal = ref(false);
const isLoading = ref(false);
const pendingChanges = ref(new Set());
const activeTab = ref('comments');
const isMetadataExpanded = ref(false);
const isEditing = ref(false);
const isEditingDescription = ref(false);
const showAssignmentModal = ref(false);
const commentCount = ref(0);
const taskCount = ref(0);

// Tab configuration
const tabs = [
	{ id: 'comments', name: 'Comments', icon: 'i-heroicons-chat-bubble-left-right' },
	{ id: 'tasks', name: 'Tasks', icon: 'i-heroicons-check-circle' },
	{ id: 'activity', name: 'Activity', icon: 'i-heroicons-clock' },
	{ id: 'edit', name: 'Edit Ticket', icon: 'i-heroicons-pencil-square' },
];

// Form data for direct edits
const form = ref({
	description: props.element.description || '',
	status: props.element.status || '',
	priority: props.element.priority || 'low',
	assigned_to: props.element.assigned_to?.map((a) => a.directus_users_id.id) || [],
});

// Dropdown menu items
const actionItems = [
	{ label: 'Share Ticket', icon: 'i-heroicons-share', click: () => handleShare('default') },
	{ label: 'Print', icon: 'i-heroicons-printer', click: () => window.print() },
	[
		{ label: 'Change Priority', icon: 'i-heroicons-exclamation-triangle' },
		{ label: 'Set to High', click: () => updatePriority('high') },
		{ label: 'Set to Medium', click: () => updatePriority('medium') },
		{ label: 'Set to Low', click: () => updatePriority('low') },
	],
	{ label: 'Delete Ticket', icon: 'i-heroicons-trash', click: () => (showDeleteModal.value = true) },
];

// Methods
const formatDate = (dateString, includeTime = false) => {
	if (!dateString) return '';
	const date = new Date(dateString);

	if (includeTime) {
		return date.toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
};

const getStatusColor = (status) => {
	switch (status) {
		case 'Pending':
			return 'blue';
		case 'Scheduled':
			return 'cyan';
		case 'In Progress':
			return 'yellow';
		case 'Completed':
			return 'green';
		default:
			return 'gray';
	}
};

const getPriorityColor = (priority) => {
	switch (priority) {
		case 'high':
			return 'red';
		case 'medium':
			return 'yellow';
		case 'low':
			return 'gray';
		default:
			return 'gray';
	}
};

const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
	if (user.id === currentUser.value?.id) return 'You';
	return `${user.first_name} ${user.last_name}`.trim() || 'Unknown';
};

const handleCommentCountUpdate = (count) => {
	commentCount.value = count;
	emit('commentCountUpdated', count);
};

const handleTaskCountUpdate = (count) => {
	taskCount.value = count;
};

const toggleEditing = () => {
	isEditing.value = !isEditing.value;
	if (isEditing.value) {
		activeTab.value = 'edit';
	} else {
		activeTab.value = 'comments';
		// If there were unsaved changes, prompt the user
		if (formRef.value?.isDirty) {
			showUnsavedModal.value = true;
		}
	}
};

const editDescription = () => {
	isEditingDescription.value = true;
	form.value.description = props.element.description || '';
};

const saveDescription = async () => {
	try {
		isLoading.value = true;
		await updateItem('tickets', props.element.id, {
			description: form.value.description,
			date_updated: new Date(),
		});

		isEditingDescription.value = false;
		toast.add({
			title: 'Success',
			description: 'Description updated successfully',
			color: 'green',
		});
	} catch (error) {
		console.error('Error updating description:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to update description',
			color: 'red',
		});
	} finally {
		isLoading.value = false;
	}
};

const updatePriority = async (priority) => {
	try {
		isLoading.value = true;
		await updateItem('tickets', props.element.id, {
			priority,
			date_updated: new Date(),
		});

		toast.add({
			title: 'Success',
			description: `Priority updated to ${priority}`,
			color: 'green',
		});
	} catch (error) {
		console.error('Error updating priority:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to update priority',
			color: 'red',
		});
	} finally {
		isLoading.value = false;
	}
};

const openAssignmentModal = () => {
	showAssignmentModal.value = true;
};

const handleAssignmentUpdate = async (assignedUsers) => {
	try {
		// Update form value
		form.value.assigned_to = assignedUsers;

		// Send notifications for newly assigned users
		const currentAssignments = props.element.assigned_to?.map((a) => a.directus_users_id.id) || [];
		const newAssignments = assignedUsers.filter((id) => !currentAssignments.includes(id));

		if (newAssignments.length > 0) {
			await notifyTicketAssignment(props.element, newAssignments, currentAssignments);
		}

		toast.add({
			title: 'Success',
			description: 'Assignments updated successfully',
			color: 'green',
		});
	} catch (error) {
		console.error('Error handling assignments:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to update assignments',
			color: 'red',
		});
	}
};

const handleMention = (mentionData) => {
	emit('change', { type: 'mention', userId: mentionData.id });
};

const handleShare = (method) => {
	emit('share', method);
};

const handleFormChange = (change) => {
	pendingChanges.value.add(change);
};

const handleDirtyStateChange = (isDirty) => {
	emit('preventClose', isDirty);
};

// Update ticket logic from existing component
const updateTicket = async (formData) => {
	try {
		isLoading.value = true;
		const { assigned_to, mentioned_users, ...ticketData } = formData;

		// Create a record of current state for notifications
		const oldStatus = props.element.status;
		const oldTeam = props.element.team?.id;
		const currentAssignments = props.element.assigned_to?.map((a) => a.directus_users_id.id) || [];
		const updatedFields = [];

		// Check which fields are changed to notify about
		if (ticketData.status !== oldStatus) updatedFields.push('status');
		if (ticketData.title !== props.element.title) updatedFields.push('title');
		if (ticketData.priority !== props.element.priority) updatedFields.push('priority');
		if (ticketData.due_date !== props.element.due_date) updatedFields.push('due date');

		// Update the main ticket data
		await updateItem('tickets', props.element.id, {
			...ticketData,
			date_updated: new Date(),
		});

		// Find assignments to add (new assignments not in current)
		const assignmentsToAdd = assigned_to.filter((id) => !currentAssignments.includes(id));

		// Process new assignments
		for (const userId of assignmentsToAdd) {
			await createItem('tickets_directus_users', {
				tickets_id: props.element.id,
				directus_users_id: userId,
			});
		}

		// Send notifications in parallel
		const notificationPromises = [];

		// 1. Status change notification
		if (ticketData.status !== oldStatus) {
			notificationPromises.push(notifyTicketStatusChange(props.element, ticketData.status, oldStatus));
		}

		// 2. New assignments notifications
		if (assignmentsToAdd.length > 0) {
			notificationPromises.push(notifyTicketAssignment(props.element, assignmentsToAdd, currentAssignments));
		}

		// 3. Team change notification
		if (ticketData.team !== oldTeam) {
			// This would be handled by a more specific helper function if needed
		}

		// 4. General update notification for other fields
		if (updatedFields.length > 0) {
			notificationPromises.push(notifyTicketUpdate(props.element, updatedFields));
		}

		// 5. Mention notifications
		if (mentioned_users && mentioned_users.length > 0) {
			notificationPromises.push(notifyMentions(mentioned_users, props.element.id, props.element.title, 'tickets'));
		}

		// Send all notifications in parallel
		await Promise.all(notificationPromises);

		// Reset form state and show success message
		formRef.value?.resetFormState();
		pendingChanges.value.clear();

		// Set editing mode off and switch to comments tab
		isEditing.value = false;
		activeTab.value = 'comments';

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
	} finally {
		isLoading.value = false;
	}
};

// Delete ticket logic
const deleteTicket = async () => {
	try {
		isLoading.value = true;

		// Check if admin (can permanently delete) or just archive
		if (currentUser.value.role === useRuntimeConfig().public.adminRole) {
			await deleteItem('tickets', props.element.id);
		} else {
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
		router.push('/tickets');
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

// Navigation protection handlers
const handleSave = async () => {
	if (formRef.value) {
		await updateTicket(formRef.value.form);
		if (!isLoading.value) {
			showUnsavedModal.value = false;
			emit('close');
		}
	}
};

const handleDiscard = () => {
	formRef.value?.resetFormState();
	showUnsavedModal.value = false;
	emit('preventClose', false);
	emit('close');
};

// Save description when in inline editing mode
watch(isEditingDescription, (newValue, oldValue) => {
	if (oldValue === true && newValue === false) {
		// User exited editing mode, save changes
		if (form.value.description !== props.element.description) {
			saveDescription();
		}
	}
});

// Router navigation guard
let routerGuard = null;

onMounted(() => {
	// Set up navigation guard
	routerGuard = router.beforeEach((to, from, next) => {
		if (formRef.value?.isDirty || isEditingDescription.value) {
			showUnsavedModal.value = true;
			next(false);
		} else {
			next();
		}
	});

	// Set up beforeunload handler
	window.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
	// Clean up
	if (routerGuard) {
		routerGuard();
	}
	window.removeEventListener('beforeunload', handleBeforeUnload);
});

const handleBeforeUnload = (e) => {
	if (formRef.value?.isDirty || isEditingDescription.value) {
		e.preventDefault();
		e.returnValue = '';
	}
};
</script>

<style>
.animate-fadein {
	animation: fadein 0.3s ease-in-out;
}

@keyframes fadein {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

/* Print styles */
@media print {
	.tabs,
	button,
	.u-button {
		display: none !important;
	}

	.isMetadataExpanded {
		display: block !important;
	}
}
</style>

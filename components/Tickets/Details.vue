<template>
	<div class="w-full mx-auto">
		<LayoutUserPresenceIndicator v-if="currentUser" />

		<TicketsStatusTimeline :currentStatus="formRef?.form?.status" class="mb-4" />
		<div class="flex items-start justify-between flex-col lg:flex-row flex-wrap">
			<div class="w-full lg:w-1/2">
				<!-- Main Form Section -->
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
				/>
				<!-- Comments -->

				<CommentsSystem
					:item-id="element.id"
					collection="tickets"
					class="w-full lg:pb-20"
					@update:commentCount="handleCommentCountUpdate"
				/>
			</div>

			<!-- Tasks Section -->
			<div
				class="w-full lg:w-[500px] border-gray-50 lg:border lg:shadow lg:p-6 lg:sticky lg:top-20 mt-12 lg:mt-12 ticket__tasks"
			>
				<h4 class="w-full uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider">Tasks</h4>
				<TicketsTasks :ticket-id="element.id" class="mt-4 pb-12" />
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

const emit = defineEmits(['close', 'deleted', 'preventClose', 'commentCountUpdated']);

// Composables
const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const ticketItems = useDirectusItems('tickets');
const ticketsDirectusUsersItems = useDirectusItems('tickets_directus_users');
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

// Event handlers
const handleCommentCountUpdate = (count) => {
	emit('commentCountUpdated', count);
};

const handleShare = (method) => {
	console.log(`Shared via ${method}`);
};

const handleFormChange = (change) => {
	pendingChanges.value.add(change);
};

const handleDirtyStateChange = (isDirty) => {
	emit('preventClose', isDirty);
};

// Update ticket logic
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

		// Sync team with global state before saving (using exposed method)
		if (formRef.value?.syncTeamWithGlobalState) {
			formRef.value.syncTeamWithGlobalState();
		}

		// Update the main ticket data
		await ticketItems.update(props.element.id, {
			...ticketData,
			date_updated: new Date(),
		});

		// Find assignments to add (new assignments not in current)
		const assignmentsToAdd = assigned_to.filter((id) => !currentAssignments.includes(id));

		// Process new assignments
		for (const userId of assignmentsToAdd) {
			await ticketsDirectusUsersItems.create({
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
		if (useRole().isAdmin(currentUser.value)) {
			await ticketItems.remove(props.element.id);
		} else {
			await ticketItems.update(props.element.id, {
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

// Router navigation guard
let routerGuard = null;

onMounted(() => {
	// Set up navigation guard
	routerGuard = router.beforeEach((to, from, next) => {
		if (formRef.value?.isDirty) {
			showUnsavedModal.value = true;
			next(false);
		} else {
			next();
		}
	});
	if (import.meta.client) {
		// Set up beforeunload handler
		window.addEventListener('beforeunload', handleBeforeUnload);
	}
});

onBeforeUnmount(() => {
	// Clean up
	if (routerGuard) {
		routerGuard();
	}
	if (import.meta.client) {
		window.removeEventListener('beforeunload', handleBeforeUnload);
	}
});

const handleBeforeUnload = (e) => {
	if (formRef.value?.isDirty) {
		e.preventDefault();
		e.returnValue = '';
	}
};
</script>

<style>
.ticket__tasks {
	.tiptap-container {
		font-size: 12px;
	}
}
</style>

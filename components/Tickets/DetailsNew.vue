<template>
	<div class="w-full mx-auto">
		<LayoutUserPresenceIndicator v-if="currentUser" />

		<div class="w-full flex items-center">
			<FormStatusTimeline
				v-model:currentStatus="currentStatus"
				:statuses="columns"
				collection="tickets"
				:itemId="localElement.id"
				:loading="isUpdatingStatus"
				@status-change="handleStatusChange"
				class="mb-4"
			/>
		</div>
		<div class="flex flex-row justify-between items-start my-4">
			<div class="flex-grow">
				<div class="flex items-center justify-between">
					<h2 class="mt-6 mb-2 text-[22px] leading-5 lg:text-[32px] lg:mb-4 font-bold">{{ localElement.title }}</h2>
				</div>
				<div class="text-xs uppercase" v-if="localElement.due_date">
					<span class="opacity-50 inline-block mr-2">Due date:</span>

					{{ formatDate(localElement.due_date) }}
				</div>
				<div class="flex flex-wrap gap-2 mt-2">
					<UBadge size="sm" class="uppercase !text-[10px] font-bold" :class="getStatusColor(currentStatus)">
						{{ currentStatus }}
					</UBadge>
					<UBadge :class="getPriorityColor(currentPriority)" size="sm" class="uppercase !text-[10px] font-bold">
						{{ currentPriority }}
					</UBadge>

					<!-- Show share button on mobile -->
					<Share :url="shareUrl" :title="shareTitle" :description="shareDescription" @share="handleShare" />
				</div>
			</div>

			<!-- Right side: Actions -->
			<div class="flex gap-2 mt-4">
				<TicketsDetailsMetadata :ticket="localElement" />
			</div>
		</div>

		<!-- Priority slider in header -->

		<div class="mb-4 border-b border-border">
			<div class="flex flex-wrap -mb-px">
				<button
					v-for="tab in tabs"
					:key="tab.id"
					class="flex items-center justify-center p-4 border-t-2 border-x-gray-100 border-x text-sm uppercase tracking-wide font-medium w-1/3 md:w-auto md:px-12 shadow-inner"
					:class="
						activeTab === tab.id
							? 'border-[var(--cyan)] text-[var(--cyan)] dark:text-[var(--cyan)] bg-white shadow-sm transition'
							: 'border-transparent hover:border-gray-300 bg-gray-50'
					"
					@click="setActiveTab(tab.id)"
				>
					<UIcon :name="tab.icon" class="w-5 h-5 mr-2 inline-block" />
					<span class="inline-block text-[10px]">{{ tab.name }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="activeTab === 'work'"
			class="flex items-start justify-between flex-col lg:flex-row flex-wrap animate-fadein"
		>
			<div v-if="displayDescription" class="w-full py-4 mb-10">
				<h5
					class="w-full uppercase block font-medium text-muted-foreground tracking-wider text-[12px] leading-3 mb-1"
				>
					Description:
				</h5>
				<div v-html="displayDescription" class="text-sm w-full lg:pr-20 ticket__description" />
			</div>
			<div class="flex items-start justify-between flex-col lg:flex-row flex-wrap w-full">
				<div class="w-full lg:w-1/2 lg:sticky lg:top-20">
					<CommentsSystem
						ref="commentsSystemRef"
						:item-id="localElement.id"
						collection="tickets"
						class="w-full lg:pb-20"
						@update:commentCount="handleCommentCountUpdate"
					/>
				</div>
				<div
					class="w-full lg:w-[500px] border-gray-50 lg:border lg:shadow py-6 lg:p-6 lg:sticky lg:top-20 mt-12 lg:mt-0 ticket__tasks"
				>
					<h4 class="w-full uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider">Tasks</h4>
					<TicketsTasks ref="tasksRef" :ticket-id="localElement.id" class="mt-4 pb-12" />
				</div>
			</div>
		</div>
		<div v-else-if="activeTab === 'activity'" class="animate-fadein">
			<TicketsActivity ref="activityRef" :ticket-id="localElement.id" :debug-mode="true" />
		</div>
		<div v-else-if="activeTab === 'edit'" class="animate-fadein">
			<TicketsDetailsForm
				ref="formRef"
				:ticket="localElement"
				:columns="columns"
				:is-loading="isLoading"
				@update="updateTicket"
				@delete-click="showDeleteModal = true"
				@comment-count-update="handleCommentCountUpdate"
				@share="handleShare"
				@change="handleFormChange"
				@dirty-state-change="handleDirtyStateChange"
				class="w-full mt-4 lg:mt-8"
			/>
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

const emit = defineEmits(['close', 'deleted', 'preventClose', 'commentCountUpdated', 'updated']);

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
const config = useRuntimeConfig();

// Refs
const formRef = ref(null);
const commentsSystemRef = ref(null);
const tasksRef = ref(null);
const activityRef = ref(null);
const showDeleteModal = ref(false);
const showUnsavedModal = ref(false);
const isLoading = ref(false);
const pendingChanges = ref(new Set());
const previousTab = ref(null);
const pendingTabChange = ref(null);
const currentStatus = ref(props.element.status);
const currentPriority = ref(props.element.priority);
const isUpdatingStatus = ref(false);

const shareUrl = computed(() => {
	// For demo, use the site URL + tickets + ID
	const baseUrl = config.public.appUrl || 'https://huestudios.company';
	return `${baseUrl}/tickets/${props.element.id}`;
});

const shareTitle = computed(() => {
	return `Ticket #${props.element.id}: ${props.element.title}`;
});

const shareDescription = computed(() => {
	const description = props.element.description || '';
	if (import.meta.client) {
		// Only run this on the client-side
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = description;
		const plainText = tempDiv.textContent || tempDiv.innerText || '';
		return plainText.length > 150 ? plainText.substring(0, 147) + '...' : plainText;
	} else {
		// Provide a server-safe fallback (e.g., the raw description or a truncated version without DOM manipulation)
		return description.length > 150 ? description.substring(0, 147) + '...' : description;
	}
});

const processDescription = (description) => {
	if (!import.meta.client || !description) return description;

	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = description;
	return tempDiv.textContent || tempDiv.innerText || '';
};

const displayDescription = computed(() => {
	const rawDescription = props.element.description || '';
	return import.meta.client ? processDescription(rawDescription) : rawDescription;
});
const displayTitle = computed(() => props.element.title || '');
const displayDueDate = computed(() => props.element.due_date || '');

const localElement = ref({ ...props.element });

// Add this with your methods
async function handleStatusChange(event) {
	if (isUpdatingStatus.value || isLoading.value) return;

	try {
		isUpdatingStatus.value = true;

		// Create a record of the old status for notifications
		const oldStatus = event.oldStatus;
		const newStatus = event.newStatus; // Define newStatus before using it

		// Update the local reactive state immediately for UI
		currentStatus.value = newStatus;

		// Also update our local element copy
		localElement.value = {
			...localElement.value,
			status: newStatus,
		};

		// Update the ticket status
		await ticketItems.update(props.element.id, {
			status: newStatus,
			date_updated: new Date(),
		});

		// Send notification to assigned users about status change
		await notifyTicketStatusChange(props.element, newStatus, oldStatus);

		// Show success message
		toast.add({
			title: 'Success',
			description: `Ticket status updated to ${newStatus}`,
			color: 'green',
		});

		// Create a shallow copy of the element to update the parent component
		const updatedElement = { ...props.element, status: newStatus };
		emit('updated', updatedElement);
	} catch (error) {
		console.error('Error updating ticket status:', error);

		// Revert the status in the UI
		currentStatus.value = event.oldStatus;
		localElement.value.status = event.oldStatus;

		toast.add({
			title: 'Error',
			description: 'Failed to update ticket status',
			color: 'red',
		});
	} finally {
		isUpdatingStatus.value = false;
	}
}

const updateFormWithLatestData = () => {
	if (!import.meta.client || !formRef.value || !formRef.value.updateFormData) {
		console.warn('FormRef or updateFormData method not available');
		return;
	}

	console.log('Explicitly updating form with latest data');
	formRef.value.updateFormData(localElement.value);
};

const updateDescriptionInDOM = (newDescription) => {
	if (!newDescription || !import.meta.client) return;

	nextTick(() => {
		// Query for the description element in the DOM
		const descriptionEl = document.querySelector('.ticket__description');
		if (descriptionEl) {
			// Update its content with the new description
			descriptionEl.innerHTML = newDescription;
			console.log('Description updated in DOM');
		}
	});
};
const activeTab = ref('work');
// Tab configuration
const tabs = [
	{ id: 'work', name: 'Work', icon: 'i-heroicons-sparkles' },
	{ id: 'activity', name: 'Activity', icon: 'i-heroicons-clock' },
	{ id: 'edit', name: 'Edit', icon: 'i-heroicons-pencil-square' },
];

// Tab management
const setActiveTab = (tabId) => {
	// Store previous tab
	previousTab.value = activeTab.value;

	// Set new active tab
	activeTab.value = tabId;

	// If switching to edit tab, make sure the form has the latest data
	if (tabId === 'edit') {
		nextTick(() => {
			updateFormWithLatestData();
		});
	}

	// If switching to the work tab, ensure description is up to date
	if (tabId === 'work' && localElement.value.description && import.meta.client) {
		nextTick(() => {
			updateDescriptionInDOM(localElement.value.description);
		});
	}

	// Schedule refresh of components after tab switch is complete
	nextTick(() => {
		refreshTabContent(tabId);
	});
};

// Refresh content when switching tabs
const refreshTabContent = (tabId) => {
	// Handle different tab refreshes
	if (tabId === 'work') {
		// Refresh comments and tasks
		if (commentsSystemRef.value && commentsSystemRef.value.refresh) {
			commentsSystemRef.value.refresh();
		}
		if (tasksRef.value && tasksRef.value.refresh) {
			tasksRef.value.refresh();
		}
	} else if (tabId === 'activity') {
		// Refresh activity log if component has refresh method
		if (activityRef.value && activityRef.value.refresh) {
			activityRef.value.refresh();
		}
	}
};

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
			return 'bg-[var(--cyan)]';
		case 'Scheduled':
			return 'bg-[var(--cyan2)]';
		case 'In Progress':
			return 'bg-[var(--green2)]';
		case 'Completed':
			return 'bg-[var(--green)]';
		default:
			return 'bg-[var(--cyan)]';
	}
};

const getPriorityColor = (priority) => {
	switch (priority) {
		case 'high':
			return 'bg-[var(--red)]';
		case 'medium':
			return 'bg-[var(--cyan)]';
		case 'low':
			return 'bg-[var(--lightGrey)]';
		default:
			return 'bg-[var(--cyan)]';
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
		const oldPriority = props.element.priority;
		const oldTeam = props.element.team?.id;
		const currentAssignments = props.element.assigned_to?.map((a) => a.directus_users_id.id) || [];
		const updatedFields = [];

		// Check which fields are changed to notify about
		if (ticketData.status !== oldStatus) updatedFields.push('status');
		if (ticketData.title !== props.element.title) updatedFields.push('title');
		if (ticketData.priority !== oldPriority) updatedFields.push('priority');
		if (ticketData.due_date !== props.element.due_date) updatedFields.push('due date');

		// IMPORTANT: Update the local reactive state BEFORE API calls
		if (ticketData.status) {
			currentStatus.value = ticketData.status;
		}
		if (ticketData.priority) {
			currentPriority.value = ticketData.priority;
		}

		// Handle description reactivity explicitly
		// We need to check if the description has changed before attempting to update it
		if (ticketData.description && ticketData.description !== props.element.description) {
			// Use our helper function to update the description in the DOM
			if (activeTab.value === 'work') {
				updateDescriptionInDOM(ticketData.description);
			}
		}

		// Sync team with global state before saving (using exposed method)
		if (formRef.value?.syncTeamWithGlobalState) {
			formRef.value.syncTeamWithGlobalState();
		}

		// Update the main ticket data
		const updatedTicket = await ticketItems.update(props.element.id, {
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

		// After successful update, refresh the appropriate content
		refreshTabContent(activeTab.value);

		// Important: Create a reactive copy of the element for UI updates
		const updatedElement = { ...props.element };

		// Merge all the updated fields into our local copy
		Object.keys(ticketData).forEach((key) => {
			updatedElement[key] = ticketData[key];
		});

		localElement.value = updatedElement;

		if (activeTab.value === 'edit') {
			updateFormWithLatestData();
		}

		// Emit an event to update the parent component
		emit('updated', updatedElement);

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
	// Initialize currentStatus and currentPriority with the element's values
	currentStatus.value = props.element.status;
	currentPriority.value = props.element.priority;

	// Set up navigation guard
	routerGuard = router.beforeEach((to, from, next) => {
		if (formRef.value?.isDirty) {
			showUnsavedModal.value = true;
			next(false);
		} else {
			next();
		}
	});

	// Set up beforeunload handler
	if (import.meta.client) {
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

// Watch for element changes to update status and priority
watch(
	() => props.element,
	(newElement) => {
		console.log('Element prop changed, updating local copy');

		// Update our local copy with the new element data
		localElement.value = { ...newElement };

		// Also update the individual reactive state vars
		if (newElement.status !== currentStatus.value) {
			console.log(`Status changed from ${currentStatus.value} to ${newElement.status}`);
			currentStatus.value = newElement.status;
		}

		if (newElement.priority !== currentPriority.value) {
			console.log(`Priority changed from ${currentPriority.value} to ${newElement.priority}`);
			currentPriority.value = newElement.priority;
		}

		// Add an explicit refresh check for description to ensure the UI updates
		if (activeTab.value === 'work' && newElement.description && import.meta.client) {
			console.log('Description update detected, updating DOM');
			updateDescriptionInDOM(newElement.description);
		}
	},
	{ deep: true, immediate: true },
);

watch(
	() => displayDescription.value,
	(newDescription) => {
		console.log('Description computed property changed');
		// Only run on client-side
		if (import.meta.client) {
			// Force DOM update when the computed property changes
			updateDescriptionInDOM(newDescription);
		}
	},
);
</script>

<style>
@reference "~/assets/css/tailwind.css";
.ticket__description {
	@apply w-full text-wrap break-words;
	a:link,
	a:visited {
		color: var(--cyan);
		text-decoration: underline;
		@apply mr-0.5;
	}
	a:hover {
		color: var(--green);
	}
}
.ticket__tasks {
	.tiptap-container {
		font-size: 12px;
	}
}

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
</style>

<template>
	<div class="w-full mx-auto">
		<LayoutUserPresenceIndicator v-if="currentUser" />

		<!-- Status Timeline -->
		<div class="w-full flex items-center">
			<FormStatusTimeline
				v-model:currentStatus="currentStatus"
				:statuses="columns"
				collection="tickets"
				:itemId="localElement.id"
				:loading="isUpdatingStatus"
				@status-change="handleStatusChange"
				class="mb-12"
			/>
		</div>

		<!-- Header — standard detail-surface hero: title + status badge, then a
		     shared identity strip carrying priority / links / due date / CSAT and
		     the action row. Mirrors the project & client surfaces. -->
		<div class="flex items-start justify-between mb-3 gap-2">
			<div class="min-w-0">
				<div class="sm:hidden mb-1">
					<UiStatusBadge :status="currentStatus" />
				</div>
				<div class="flex items-center gap-2">
					<h1 class="text-sm sm:text-base font-semibold text-foreground" style="line-height: 1.1">{{ localElement.title }}</h1>
					<div class="hidden sm:block shrink-0">
						<UiStatusBadge :status="currentStatus" />
					</div>
				</div>
			</div>
		</div>

		<AppsWorkTicketIdentityStrip
			:ticket="localElement"
			class="mb-6"
			@update="handleStripUpdate"
		>
			<!-- CSAT sits in the universal rating position (set from the portal
			     when the ticket is resolved), matching project/client surfaces. -->
			<template v-if="localElement.csat_rating" #rating>
				<CsatBadge
					:rating="localElement.csat_rating"
					:comment="localElement.csat_comment"
					:submitted-at="localElement.csat_submitted_at"
				/>
			</template>
			<template #actions>
				<LayoutShareButton :title="shareTitle" :text="shareDescription" />
				<UiActionButton icon="earnest" variant="primary" hide-label="sm" @click="sidebarOpen = true">
					Ask Earnest
				</UiActionButton>
				<UiActionButton icon="lucide:trash-2" variant="destructive" hide-label="sm" @click="showDeleteModal = true">
					Delete
				</UiActionButton>
			</template>
		</AppsWorkTicketIdentityStrip>

		<!-- AI Notices -->
		<ClientOnly>
			<AIProactiveNotices entity-type="ticket" :entity-id="String(localElement.id)" />
		</ClientOnly>

		<!-- Tabs -->
		<UTabs
			v-model="activeTab"
			:items="tabItems"
			class="w-full"
		>
			<!-- Overview Tab -->
			<template #overview>
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6 animate-fadein items-start">
					<!-- Main Content -->
					<div class="lg:col-span-2 space-y-6">
						<!-- Ticket Details Card -->
						<div class="ios-card p-5">
							<div ref="stickyHeaderSentinel" class="h-0" />
							<div
								ref="stickyHeader"
								class="flex items-center justify-between mb-4 sticky top-0 z-10 bg-card py-3 -mx-5 px-5 rounded-t-2xl transition-shadow duration-200"
								:class="{ 'shadow-[0_4px_12px_rgba(0,0,0,0.06)]': isHeaderStuck }"
							>
								<h2 class="font-medium">Ticket Details</h2>
								<!-- Autosave status — changes persist automatically a beat
								     after you stop editing (no manual Save). -->
								<transition name="fade" mode="out-in">
									<span v-if="isLoading" key="saving" class="text-[10px] text-muted-foreground uppercase tracking-wider inline-flex items-center gap-1">
										<Icon name="lucide:loader-2" class="w-3 h-3 animate-spin" /> Saving
									</span>
									<span v-else-if="formRef?.isDirty" key="pending" class="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Editing…</span>
									<span v-else key="saved" class="text-[10px] text-success uppercase tracking-wider inline-flex items-center gap-1">
										<Icon name="lucide:check" class="w-3 h-3" /> Saved
									</span>
								</transition>
							</div>
							<TicketsDetailsForm
								ref="formRef"
								:ticket="localElement"
								:columns="columns"
								:is-loading="isLoading"
								@update="updateTicket"
								@change="handleFormChange"
								@dirty-state-change="handleDirtyStateChange"
							/>

							<!-- Description -->
							<div class="mt-4">
								<UFormGroup label="Description">
									<div class="max-h-64 overflow-y-auto rounded-lg shadow-[inset_0_2px_4px_rgba(0,0,0,0.04),inset_0_-2px_4px_rgba(0,0,0,0.04)] border border-border/40">
										<LazyFormTiptap
											v-if="formRef?.form"
											:modelValue="formRef.form.description"
											@update:modelValue="val => formRef.form.description = val"
											placeholder="Enter ticket description"
											@mention="formRef?.handleMention"
											:editor-props="{
												content: formRef.form.description,
											}"
											:organization-id="localElement.organization?.id"
											:client-id="typeof localElement.client === 'object' ? localElement.client?.id : localElement.client"
											:context="{
												collection: 'tickets',
												itemId: localElement.id,
											}"
										/>
										<div v-else-if="displayDescription" v-html="displayDescription" class="text-sm w-full ticket__description" />
									</div>
								</UFormGroup>
							</div>

							<!-- Comments -->
							<div class="mt-8">
								<CommentsSystem
									ref="commentsSystemRef"
									:item-id="localElement.id"
									collection="tickets"
									class="w-full"
									:client-id="typeof localElement.client === 'object' ? localElement.client?.id : localElement.client"
									@update:commentCount="handleCommentCountUpdate"
								/>
							</div>
						</div>
					</div>

					<!-- Sidebar -->
					<div class="lg:sticky lg:top-0 space-y-4">
						<!-- Tasks Card -->
						<div class="ios-card p-5 relative overflow-hidden">
							<h3 class="font-medium text-sm mb-3 flex items-center gap-2">
								<Icon name="lucide:check-circle" class="w-4 h-4 text-muted-foreground" />
								Tasks
							</h3>
							<TicketsTasks ref="tasksRef" :ticket-id="localElement.id" />
						</div>
					</div>
				</div>
			</template>

			<!-- Activity Tab -->
			<template #activity>
				<div class="pt-6 animate-fadein">
					<TicketsActivity ref="activityRef" :ticket-id="localElement.id" :debug-mode="true" />
				</div>
			</template>

			<!-- Info Tab -->
			<template #info>
				<div class="pt-6 animate-fadein max-w-lg">
					<div class="ios-card p-6">
						<h2 class="font-medium mb-4 flex items-center gap-2">
							<Icon name="lucide:info" class="w-4 h-4 text-muted-foreground" />
							Ticket Info
						</h2>
						<div class="space-y-3 text-sm">
							<div class="flex justify-between">
								<span class="text-muted-foreground">Ticket #</span>
								<span>{{ localElement.id }}</span>
							</div>
							<div v-if="localElement.organization" class="flex justify-between">
								<span class="text-muted-foreground">Organization</span>
								<span>{{ localElement.organization.name }}</span>
							</div>
							<div v-if="teamsEnabled && localElement.team" class="flex justify-between">
								<span class="text-muted-foreground">Team</span>
								<span>{{ localElement.team.name }}</span>
							</div>
							<div v-if="localElement.project" class="flex justify-between">
								<span class="text-muted-foreground">Project</span>
								<span>{{ localElement.project.title }}</span>
							</div>
							<div v-if="localElement.user_created" class="flex justify-between">
								<span class="text-muted-foreground">Created by</span>
								<span>{{ getUserFullName(localElement.user_created) }}</span>
							</div>
							<div v-if="localElement.date_created" class="flex justify-between">
								<span class="text-muted-foreground">Created</span>
								<span>{{ formatDate(localElement.date_created) }}</span>
							</div>
							<div v-if="localElement.date_updated" class="flex justify-between">
								<span class="text-muted-foreground">Updated</span>
								<span>{{ formatDate(localElement.date_updated) }}</span>
							</div>
						</div>
					</div>
				</div>
			</template>
		</UTabs>

		<!-- Modals -->
		<TicketsModalDelete
			v-model:is-open="showDeleteModal"
			:is-loading="isLoading"
			@delete="deleteTicket"
			@cancel="showDeleteModal = false"
		/>

		<!-- Contextual AI Sidebar -->
	</div>
</template>

<script setup>
import { Button } from '~/components/ui/button';

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
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();
// Hide the Team detail row when the org has Teams turned off.
const { teamsEnabled } = useTeamsEnabled();

// Refs
const formRef = ref(null);
const commentsSystemRef = ref(null);
const tasksRef = ref(null);
const activityRef = ref(null);
const showDeleteModal = ref(false);
const isLoading = ref(false);
const pendingChanges = ref(new Set());
const previousTab = ref(null);
const pendingTabChange = ref(null);
const currentStatus = ref(props.element.status);
const currentPriority = ref(props.element.priority);
const isUpdatingStatus = ref(false);
const stickyHeaderSentinel = ref(null);
const stickyHeader = ref(null);
const isHeaderStuck = ref(false);

// Tab configuration
const activeTab = ref('overview');
const tabItems = [
	{ key: 'overview', label: 'Overview', icon: 'i-heroicons-squares-2x2' },
	{ key: 'activity', label: 'Activity', icon: 'i-heroicons-clock' },
	{ key: 'info', label: 'Info', icon: 'i-heroicons-information-circle' },
];

const shareUrl = computed(() => {
	const baseUrl = config.public.appUrl || 'https://app.earnest.guru';
	return `${baseUrl}/tickets/${props.element.id}`;
});

const shareTitle = computed(() => {
	return `Ticket #${props.element.id}: ${props.element.title}`;
});

const stripHtml = (html) => {
	if (!import.meta.client || !html) return html || '';
	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = html;
	const text = tempDiv.textContent || tempDiv.innerText || '';
	tempDiv.textContent = '';
	return text;
};

const shareDescription = computed(() => {
	const plainText = stripHtml(props.element.description);
	return plainText.length > 150 ? plainText.substring(0, 147) + '...' : plainText;
});

const displayDescription = computed(() => {
	return stripHtml(props.element.description);
});

const localElement = ref({ ...props.element });

// Status change handler
async function handleStatusChange(event) {
	if (isUpdatingStatus.value || isLoading.value) return;

	try {
		isUpdatingStatus.value = true;

		const oldStatus = event.oldStatus;
		const newStatus = event.newStatus;

		currentStatus.value = newStatus;

		localElement.value = {
			...localElement.value,
			status: newStatus,
		};

		await ticketItems.update(props.element.id, {
			status: newStatus,
			date_updated: new Date(),
		});

		await notifyTicketStatusChange(props.element, newStatus, oldStatus);

		toast.add({
			title: 'Success',
			description: `Ticket status updated to ${newStatus}`,
			color: 'green',
		});

		const updatedElement = { ...props.element, status: newStatus };
		emit('updated', updatedElement);
	} catch (error) {
		console.error('Error updating ticket status:', error);

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
		return;
	}
	formRef.value.updateFormData(localElement.value);
};

// Sync header/strip priority with form changes in real-time. Mirror into
// localElement too so the identity strip's priority pill reflects live edits.
watch(() => formRef.value?.form?.priority, (newPriority) => {
	if (newPriority) {
		currentPriority.value = newPriority;
		localElement.value = { ...localElement.value, priority: newPriority };
	}
});

// Tab change watcher
watch(activeTab, (tabId) => {
	previousTab.value = activeTab.value;

	if (tabId === 'overview') {
		nextTick(() => {
			updateFormWithLatestData();
		});
	}

	nextTick(() => {
		refreshTabContent(tabId);
	});
});

// Refresh content when switching tabs
const refreshTabContent = (tabId) => {
	if (tabId === 'overview') {
		if (commentsSystemRef.value && commentsSystemRef.value.refresh) {
			commentsSystemRef.value.refresh();
		}
		if (tasksRef.value && tasksRef.value.refresh) {
			tasksRef.value.refresh();
		}
	} else if (tabId === 'activity') {
		if (activityRef.value && activityRef.value.refresh) {
			activityRef.value.refresh();
		}
	}
};

const formatDate = (dateString, includeTime = false) => {
	if (!dateString) return '';
	return includeTime ? formatDateWithTime(dateString) : getFriendlyDateThree(dateString);
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

		const oldStatus = props.element.status;
		const oldPriority = props.element.priority;
		const oldTeam = props.element.team?.id;
		const currentAssignments = props.element.assigned_to?.map((a) => a.directus_users_id.id) || [];
		const updatedFields = [];

		if (ticketData.status !== oldStatus) updatedFields.push('status');
		if (ticketData.title !== props.element.title) updatedFields.push('title');
		if (ticketData.priority !== oldPriority) updatedFields.push('priority');
		if (ticketData.due_date !== props.element.due_date) updatedFields.push('due date');

		if (ticketData.status) {
			currentStatus.value = ticketData.status;
		}
		if (ticketData.priority) {
			currentPriority.value = ticketData.priority;
		}

		if (formRef.value?.syncTeamWithGlobalState) {
			formRef.value.syncTeamWithGlobalState();
		}

		const updatedTicket = await ticketItems.update(props.element.id, {
			...ticketData,
			date_updated: new Date(),
		});

		const assignmentsToAdd = assigned_to.filter((id) => !currentAssignments.includes(id));

		for (const userId of assignmentsToAdd) {
			await ticketsDirectusUsersItems.create({
				tickets_id: props.element.id,
				directus_users_id: userId,
			});
		}

		const notificationPromises = [];

		if (ticketData.status !== oldStatus) {
			notificationPromises.push(notifyTicketStatusChange(props.element, ticketData.status, oldStatus));
		}

		if (assignmentsToAdd.length > 0) {
			notificationPromises.push(notifyTicketAssignment(props.element, assignmentsToAdd, currentAssignments));
		}

		if (updatedFields.length > 0) {
			notificationPromises.push(notifyTicketUpdate(props.element, updatedFields));
		}

		if (mentioned_users && mentioned_users.length > 0) {
			notificationPromises.push(notifyMentions(mentioned_users, props.element.id, props.element.title, 'tickets'));
		}

		await Promise.all(notificationPromises);

		pendingChanges.value.clear();

		refreshTabContent(activeTab.value);

		// Re-fetch the ticket to get clean expanded data (objects, not raw IDs)
		try {
			const freshTicket = await ticketItems.get(props.element.id, {
				fields: [
					'id', 'title', 'description', 'status', 'priority', 'csat_rating', 'csat_comment', 'csat_submitted_at', 'date_created', 'date_updated',
					'user_updated.first_name', 'user_updated.last_name', 'user_updated.id',
					'user_created.first_name', 'user_created.last_name', 'user_created.id',
					'due_date', 'organization.id', 'organization.name', 'organization.logo',
					'project.id', 'project.title', 'project.url',
					'assigned_to.id', 'assigned_to.directus_users_id.id', 'assigned_to.directus_users_id.first_name',
					'assigned_to.directus_users_id.last_name', 'assigned_to.directus_users_id.avatar',
					'assigned_to.directus_users_id.email', 'tasks', 'team.*', 'client.id', 'client.name',
				],
			});
			localElement.value = freshTicket;
		} catch (e) {
			// Fallback: merge locally if re-fetch fails
			const updatedElement = { ...props.element };
			Object.keys(ticketData).forEach((key) => {
				updatedElement[key] = ticketData[key];
			});
			localElement.value = updatedElement;
		}

		// The ticket watcher in DetailsForm will pick up the new localElement and reset form state

		emit('updated', localElement.value);
		// No success toast — autosave fires on every edit; the inline "Saved"
		// indicator in the card header is the confirmation. Errors still toast.
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

// Inline quick-edits from the identity strip (currently the due date). Saves
// straight through and mirrors the change into localElement so the strip and
// form stay in sync without a full refetch.
const handleStripUpdate = async (fields) => {
	try {
		await ticketItems.update(props.element.id, { ...fields, date_updated: new Date() });
		localElement.value = { ...localElement.value, ...fields };
		if ('due_date' in fields) {
			notifyTicketUpdate(props.element, ['due date']).catch(() => {});
		}
		toast.add({ title: 'Ticket updated', color: 'green' });
	} catch (error) {
		console.error('Error updating ticket from identity strip:', error);
		toast.add({ title: 'Error', description: 'Failed to update ticket', color: 'red' });
	}
};

// Delete ticket logic
const deleteTicket = async () => {
	try {
		isLoading.value = true;

		if (useOrgRole().isOrgAdminOrAbove.value) {
			await ticketItems.remove(props.element.id);
		} else {
			await ticketItems.update(props.element.id, {
				status: 'Archived',
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

onMounted(() => {
	currentStatus.value = props.element.status;
	currentPriority.value = props.element.priority;

	// Register entity context for AI awareness
	if (props.element?.id) {
		setEntity('ticket', String(props.element.id), props.element.title || 'Ticket');
	}

	// Changes autosave (see DetailsForm) so there's no unsaved-changes nav guard
	// or beforeunload prompt anymore.

	if (import.meta.client) {
		// Observe when the sentinel scrolls out of view to add shadow to sticky header
		if (stickyHeaderSentinel.value) {
			stickyObserver = new IntersectionObserver(
				([entry]) => {
					isHeaderStuck.value = !entry.isIntersecting;
				},
				{ threshold: 0 }
			);
			stickyObserver.observe(stickyHeaderSentinel.value);
		}
	}
});

let stickyObserver = null;

onBeforeUnmount(() => {
	clearEntity();
	if (stickyObserver) {
		stickyObserver.disconnect();
		stickyObserver = null;
	}
	pendingChanges.value.clear();
});

// Watch for element changes
watch(
	[() => props.element?.id, () => props.element?.status, () => props.element?.priority, () => props.element?.description, () => props.element?.date_updated],
	() => {
		const newElement = props.element;
		if (!newElement) return;

		localElement.value = { ...newElement };

		if (newElement.status !== currentStatus.value) {
			currentStatus.value = newElement.status;
		}

		if (newElement.priority !== currentPriority.value) {
			currentPriority.value = newElement.priority;
		}
	},
	{ immediate: true },
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

.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>

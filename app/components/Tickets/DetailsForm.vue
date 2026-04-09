<template>
	<form
		@submit.prevent="handleSubmit"
		class="w-full space-y-6 lg:space-y-0 relative flex flex-col lg:flex-row flex-wrap items-start justify-between gap-y-6"
	>
		<transition name="fade">
			<a
				v-if="isDirty"
				@click.prevent="scrollToActions"
				class="text-red-500 absolute -top-4 right-0 uppercase text-[9px] teacking-wide"
			>
				You need to save your edits.
			</a>
		</transition>
		<div class="w-full lg:w-1/2 lg:pr-4 space-y-4">
			<div class="w-full max-w-96 pb-1">
				<TicketsDetailsPriority v-model="form.priority" animationDuration="0.2" />
			</div>
			<div class="w-full pb-1">
				<UFormGroup label="Title" required>
					<UInput v-model="form.title" placeholder="Enter ticket title" :loading="isLoading" />
				</UFormGroup>
			</div>
			<!-- Status and Project Grid -->
			<div class="grid grid-cols-2 xl:grid-cols-3 gap-4">
				<UFormGroup v-if="hasMultipleOrgs" label="Organization">
					<USelectMenu
						searchable
						v-model="form.organization"
						:options="organizationOptions"
						option-attribute="name"
						value-attribute="id"
						placeholder="Select Organization"
						class="relative"
						@update:modelValue="handleOrgChange"
						:disabled="isLoading"
					/>
				</UFormGroup>

				<!-- Only show team UI if we have teams -->
				<UFormGroup
					v-if="(localTeamOptions.length > 0 && !isAdminOrManager) || (localTeamOptions.length > 1 && isAdminOrManager)"
					:label="isAdminOrManager ? 'Team (optional)' : 'Team'"
					:required="!isAdminOrManager"
				>
					<USelect
						v-model="localTeamId"
						:options="localTeamOptions"
						option-attribute="name"
						value-attribute="id"
						placeholder="Select team"
						:loading="teamsLoading"
						:disabled="localTeamOptions.length <= 1 || isLoading"
					/>
				</UFormGroup>
				<!-- Only show project dropdown if we have projects -->
				<UFormGroup v-if="form.organization && projectOptions.length > 1" label="Project">
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
				<UFormGroup v-if="clientOptions.length > 0" label="Client">
					<USelectMenu
						searchable
						v-model="form.client"
						:options="clientOptions"
						option-attribute="label"
						value-attribute="value"
						placeholder="Select client"
						:loading="loadingClients"
						class="relative"
					>
						<template #option="{ option }">
							{{ option.label }}
						</template>
					</USelectMenu>
				</UFormGroup>
			</div>

			<!-- Due Date & Time -->
			<div class="max-w-xs">
				<TicketsDetailsDateTime v-model="form.due_date" />
			</div>

			<!-- User Assignment -->
			<TicketsDetailsAssignment
				:organization-id="form.organization"
				:team-id="localTeamId"
				v-model:assigned-users="form.assigned_to"
				@user-removed="handleUserRemoved"
				@user-added="handleUserAdded"
			/>
		</div>
		<div class="w-full lg:w-1/2 lg:pl-4">
			<!-- Description -->
			<UFormGroup label="Description" required>
				<LazyFormTiptap
					v-model="form.description"
					placeholder="Enter ticket description"
					@mention="handleMention"
					:editor-props="{
						content: form.description,
					}"
					:organization-id="form.organization"
					:client-id="typeof form.client === 'object' ? form.client?.id : form.client"
					:context="{
						collection: 'tickets',
						itemId: ticket.id,
					}"
				/>
			</UFormGroup>
		</div>

		<!-- Action Buttons -->
		<TicketsDetailsActions
			id="actions"
			:ticket-id="ticket.id"
			:ticket-title="form.title"
			:creator-id="ticket.user_created?.id"
			:assigned-user-ids="form.assigned_to"
			:is-loading="isLoading"
			:is-dirty="isDirty"
			@delete-click="handleDeleteClick"
			@share="handleShare"
			class="w-full"
		/>
	</form>
</template>

<script setup>
const props = defineProps({
	ticket: {
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

const emit = defineEmits(['update', 'delete-click', 'comment-count-update', 'share', 'change', 'dirty-state-change']);

// Composables
const projectItems = useDirectusItems('projects');
const { getClientOptions } = useClients();
const { notify } = useNotifications();
const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const toast = useToast();
const { hasMultipleOrgs, organizationOptions } = useOrganization();
const { teams, visibleTeams, loading: teamsLoading, fetchTeams, setTeam } = useTeams();
const { isOrgManagerOrAbove } = useOrgRole();

// Local state for teams - decoupled from global state
const localTeamId = ref(null);
const localTeams = ref([]);
const localTeamOptions = ref([]);
const noTeamSelected = ref(false);

const isAdminOrManager = computed(() => isOrgManagerOrAbove.value);

// Local state for form
const form = ref({
	title: props.ticket.title || '',
	description: props.ticket.description || '',
	status: props.ticket.status || '',
	priority: props.ticket.priority || 'low',
	category: props.ticket.category || '',
	project: props.ticket.project?.id || null,
	organization: props.ticket.organization?.id || null,
	team: props.ticket.team?.id || null, // This will be synced with localTeamId
	assigned_to: props.ticket.assigned_to?.map((a) => a.directus_users_id.id) || [],
	due_date: props.ticket.due_date || new Date().toISOString(),
	client: props.ticket.client?.id || null,
});

const initialFormState = ref({});
const clientOptions = ref([]);
const loadingClients = ref(false);
const isDirty = ref(false);
const projectOptions = ref([]);
const loadingProjects = ref(false);
const mentionedUsers = ref(new Set());

const scrollToActions = () => {
	const actionsElement = document.getElementById('actions');
	if (actionsElement) {
		actionsElement.scrollIntoView({
			behavior: 'smooth',
			block: 'center',
		});
	}
};

// Handle the "No Team" checkbox changes
const handleNoTeamChange = (checked) => {
	if (checked) {
		// If "No Team" is checked, set localTeamId to null
		localTeamId.value = null;
		form.value.team = null;
	} else if (localTeamOptions.value.length > 0) {
		// If unchecked and there are teams available, let user select one but don't auto-select
		localTeamId.value = null;
		form.value.team = null;
	}
};

// Sync localTeamId with form.team
watch(localTeamId, (newTeamId) => {
	if (newTeamId !== null) {
		noTeamSelected.value = false;
	}
	form.value.team = newTeamId;
	emit('change', { type: 'team-changed', teamId: newTeamId });
});

// Initialize form state for dirty checking
const initializeFormState = () => {
	initialFormState.value = {
		title: form.value.title,
		description: form.value.description,
		status: form.value.status,
		priority: form.value.priority,
		project: form.value.project,
		organization: form.value.organization,
		team: form.value.team,
		category: form.value.category,
		assigned_to: [...form.value.assigned_to],
		due_date: form.value.due_date,
		client: form.value.client,
	};
	isDirty.value = false;
	emit('dirty-state-change', false);
};

// Track form changes
const trackChanges = () => {
	const currentState = {
		title: form.value.title,
		description: form.value.description,
		status: form.value.status,
		priority: form.value.priority,
		project: form.value.project,
		organization: form.value.organization,
		team: form.value.team,
		category: form.value.category,
		assigned_to: [...form.value.assigned_to],
		due_date: form.value.due_date,
		client: form.value.client,
	};

	const isDifferent = JSON.stringify(currentState) !== JSON.stringify(initialFormState.value);

	if (isDirty.value !== isDifferent) {
		isDirty.value = isDifferent;
		emit('dirty-state-change', isDifferent);
	}
};

// Load teams for a given organization - maintains local team state
// Load teams for a given organization - maintains local team state
const loadTeamsForOrg = async (orgId) => {
	if (!orgId) {
		localTeams.value = [];
		localTeamOptions.value = [];
		return;
	}

	try {
		// First fetch teams using the composable
		await fetchTeams(orgId, { force: true });

		// Regular users should only see teams they belong to
		// Copy the appropriate teams to our local state based on user role
		if (isAdminOrManager.value) {
			// Admins and managers see all teams
			localTeams.value = [...teams.value];
		} else {
			// Regular users only see teams they're members of
			localTeams.value = [...visibleTeams.value];
		}

		// Prepare options for the dropdown
		let options = localTeams.value.map((team) => ({
			id: team.id,
			name: team.name,
			description: team.description || '',
		}));

		// Special handling for when the ticket already has a team assigned
		// If the ticket has a team that isn't in the filtered list, add it as view-only
		if (form.value.team && !options.some((team) => team.id === form.value.team)) {
			const ticketTeam = teams.value.find((team) => team.id === form.value.team);
			if (ticketTeam) {
				options.push({
					id: ticketTeam.id,
					name: `${ticketTeam.name} (View Only)`,
					description: ticketTeam.description || '',
					viewOnly: true,
				});
			}
		}

		// Add "No Team" option for admin/manager users
		if (isAdminOrManager.value) {
			options.unshift({
				id: null,
				name: 'No Team',
				description: 'This ticket will not be assigned to any team',
			});
		}

		localTeamOptions.value = options;
	} catch (error) {
		console.error('Error loading teams:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to load teams',
			color: 'red',
		});
		localTeams.value = [];
		localTeamOptions.value = [];
	}
};

// Fetch projects for the selected organization
const fetchProjects = async (orgId) => {
	if (!orgId) {
		projectOptions.value = [];
		form.value.project = null;
		return;
	}

	loadingProjects.value = true;
	try {
		const projects = await projectItems.list({
			fields: ['id', 'title'],
			filter: {
				organization: { _eq: orgId },
			},
		});
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

// Handler for organization changes
const handleOrgChange = async (orgId) => {
	form.value.project = null; // Reset project when org changes
	form.value.assigned_to = []; // Clear assigned users when org changes

	// Reset both local and form team state
	localTeamId.value = null;
	form.value.team = null;
	noTeamSelected.value = isAdminOrManager.value; // Set "No Team" by default for admins/managers

	// Load data for the new organization
	await loadTeamsForOrg(orgId);
	await fetchProjects(orgId);
};

// Handler for user removal
const handleUserRemoved = async (userId) => {
	// Emit event so parent can handle junction record deletion if needed
	emit('change', { type: 'user-removed', userId });
};

// Handler for user addition
const handleUserAdded = (userId) => {
	// Emit event so parent can handle notifications if needed
	emit('change', { type: 'user-added', userId });
};

// Handling mentions in the description
const handleMention = (mentionData) => {
	mentionedUsers.value.add(mentionData.id);
	emit('change', { type: 'mention', userId: mentionData.id });
};

// Handle comment count updates
const handleCommentCountUpdate = (count) => {
	emit('comment-count-update', count);
};

// Handle delete click
const handleDeleteClick = () => {
	emit('delete-click');
};

// Handle share
const handleShare = (method) => {
	emit('share', method);
};

// Submit form - sync global team state before submitting
// Submit form - sync global team state before submitting
// Modified to only send changed fields
const handleSubmit = () => {
	// Check if the team field is set (only required for non-admin/manager users)
	if (!isAdminOrManager.value && !form.value.team) {
		toast.add({
			title: 'Error',
			description: 'Please select a team before saving',
			color: 'red',
		});
		return;
	}

	// Sync team with global state only when submitting
	setTeam(form.value.team);

	// Compare current form state with initial state to find changed fields
	const changedFields = {};
	let hasChanges = false;

	// Helper function to check if values are different (handles arrays, dates, etc.)
	const isDifferent = (a, b) => {
		// Handle arrays (like assigned_to)
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return true;

			// Sort arrays to ensure consistent comparison
			const sortedA = [...a].sort();
			const sortedB = [...b].sort();

			return JSON.stringify(sortedA) !== JSON.stringify(sortedB);
		}

		// Handle dates
		if (typeof a === 'string' && typeof b === 'string') {
			// Check if both are date strings
			const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
			if (datePattern.test(a) && datePattern.test(b)) {
				const dateA = new Date(a);
				const dateB = new Date(b);
				return dateA.getTime() !== dateB.getTime();
			}
		}

		// Regular comparison for other types
		return JSON.stringify(a) !== JSON.stringify(b);
	};

	// Check each field for changes
	for (const key in form.value) {
		if (isDifferent(form.value[key], initialFormState.value[key])) {
			changedFields[key] = form.value[key];
			hasChanges = true;
		}
	}

	// Always include assigned_to for proper junction table handling
	changedFields.assigned_to = form.value.assigned_to;

	// Add mentioned users to the data if any
	if (mentionedUsers.value.size > 0) {
		changedFields.mentioned_users = Array.from(mentionedUsers.value);
	}

	if (changedFields.status) {
		form.value.status = changedFields.status;
	}
	if (changedFields.priority) {
		form.value.priority = changedFields.priority;
	}

	// Emit the update event with only the changed fields
	emit('update', changedFields);
};

// Watch for changes to update dirty state
watch(
	() => ({
		title: form.value.title,
		description: form.value.description,
		status: form.value.status,
		priority: form.value.priority,
		project: form.value.project,
		organization: form.value.organization,
		team: form.value.team,
		category: form.value.category,
		assigned_to: [...form.value.assigned_to],
		due_date: form.value.due_date,
	}),
	() => {
		trackChanges();
	},
	{ deep: true },
);

// Watch for changes in the ticket prop
watch(
	() => props.ticket,
	async (newTicket) => {
		// Get ticket team ID before updating form
		const ticketTeamId = newTicket.team?.id || null;

		// Update form values when ticket changes
		form.value = {
			title: newTicket.title || '',
			description: newTicket.description || '',
			status: newTicket.status || '',
			priority: newTicket.priority || 'low',
			category: newTicket.category || '',
			project: newTicket.project?.id || null,
			organization: newTicket.organization?.id || null,
			team: ticketTeamId, // Use original team value without defaulting
			assigned_to: newTicket.assigned_to?.map((a) => a.directus_users_id.id) || [],
			due_date: newTicket.due_date || new Date().toISOString(),
			client: newTicket.client?.id || null,
		};

		// Update local team state and no team checkbox
		localTeamId.value = ticketTeamId;
		noTeamSelected.value = ticketTeamId === null && isAdminOrManager.value;

		// Reset dirty state
		initializeFormState();

		// Fetch data for the new organization
		if (newTicket.organization?.id) {
			// Load teams first - this won't affect local team selection
			await loadTeamsForOrg(newTicket.organization.id);

			// Fetch projects
			await fetchProjects(newTicket.organization.id);
		}
	},
	{ immediate: true, deep: true },
);

// Initialize on mount
onMounted(async () => {
	if (props.ticket.organization?.id) {
		// Load teams for the organization
		await loadTeamsForOrg(props.ticket.organization.id);

		// Set local team ID from ticket - don't set a default if null
		if (props.ticket.team?.id) {
			localTeamId.value = props.ticket.team.id;
			noTeamSelected.value = false;
		} else {
			// If no team is selected, set noTeamSelected to true for admins/managers
			noTeamSelected.value = isAdminOrManager.value;
		}

		await fetchProjects(props.ticket.organization.id);
	}

	// Load client options
	loadingClients.value = true;
	try {
		clientOptions.value = await getClientOptions();
	} catch { clientOptions.value = []; }
	finally { loadingClients.value = false; }

	// Initialize form state
	initializeFormState();
});

const updateFormData = (newData) => {
	if (!newData) return;
	// Update the form with the latest data
	form.value = {
		title: newData.title || '',
		description: newData.description || '',
		status: newData.status || '',
		priority: newData.priority || 'low',
		category: newData.category || '',
		project: newData.project?.id || null,
		organization: newData.organization?.id || null,
		team: newData.team?.id || null,
		assigned_to: newData.assigned_to?.map((a) => a.directus_users_id?.id) || [],
		due_date: newData.due_date || new Date().toISOString(),
		client: newData.client?.id || null,
	};

	// Reset the form's initial state to prevent it from being marked as dirty
	initializeFormState();
};

// Expose form value and isDirty state to parent
defineExpose({
	form,
	isDirty,
	resetFormState: initializeFormState,
	updateFormData,
	// Also expose method to sync team with global state
	syncTeamWithGlobalState: () => {
		if (form.value.team) {
			setTeam(form.value.team);
		}
	},
});
</script>

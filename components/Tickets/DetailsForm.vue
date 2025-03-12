<template>
	<form @submit.prevent="handleSubmit" class="w-full space-y-6 relative">
		<!-- Ticket Header -->
		<TicketsDetailsHeader :ticket="ticket" />

		<!-- Priority Slider -->
		<TicketsDetailsPriority v-model="form.priority" />

		<!-- Title -->
		<UFormGroup label="Title" required>
			<UInput v-model="form.title" placeholder="Enter ticket title" :loading="isLoading" />
		</UFormGroup>

		<!-- Status and Project Grid -->
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
		</div>

		<!-- Organization & Team Grid -->
		<div class="grid grid-cols-2 gap-4">
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
				v-if="localTeamOptions.length > 0 || isAdminOrManager"
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
					:disabled="localTeamOptions.length <= 1 || isLoading || noTeamSelected"
				/>
				<div v-if="isAdminOrManager" class="mt-2">
					<UCheckbox v-model="noTeamSelected" label="No Team" @change="handleNoTeamChange" />
				</div>
			</UFormGroup>
		</div>

		<!-- Due Date & Time -->
		<TicketsDetailsDateTime v-model="form.due_date" />

		<!-- User Assignment -->
		<TicketsDetailsAssignment
			:organization-id="form.organization"
			:team-id="localTeamId"
			v-model:assigned-users="form.assigned_to"
			@user-removed="handleUserRemoved"
			@user-added="handleUserAdded"
		/>

		<!-- Description -->
		<UFormGroup label="Description" required>
			<FormTiptap
				v-model="form.description"
				placeholder="Enter ticket description"
				@mention="handleMention"
				:editor-props="{
					content: form.description,
				}"
				:organization-id="form.organization"
				:context="{
					collection: 'tickets',
					itemId: ticket.id,
				}"
			/>
		</UFormGroup>

		<!-- Action Buttons -->
		<TicketsDetailsActions
			:ticket-id="ticket.id"
			:ticket-title="form.title"
			:creator-id="ticket.user_created?.id"
			:assigned-user-ids="form.assigned_to"
			:is-loading="isLoading"
			:is-dirty="isDirty"
			@delete-click="handleDeleteClick"
			@share="handleShare"
		/>

		<!-- Comments -->
		<div class="w-full lg:pb-20">
			<CommentsSystem :item-id="ticket.id" collection="tickets" @update:commentCount="handleCommentCountUpdate" />
		</div>
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
const { readItems } = useDirectusItems();
const { notify } = useNotifications();
const { user: currentUser } = useDirectusAuth();
const toast = useToast();
const { hasMultipleOrgs, organizationOptions } = useOrganization();
const { teams, loading: teamsLoading, fetchTeams, setTeam, ADMIN_ROLE_ID, CLIENT_MANAGER_ROLE_ID } = useTeams();

// Local state for teams - decoupled from global state
const localTeamId = ref(null);
const localTeams = ref([]);
const localTeamOptions = ref([]);
const noTeamSelected = ref(false);

const isAdminOrManager = computed(() => {
	if (!currentUser.value || !currentUser.value.role) return false;
	return [ADMIN_ROLE_ID, CLIENT_MANAGER_ROLE_ID].includes(currentUser.value.role);
});

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
});

const initialFormState = ref({});
const isDirty = ref(false);
const projectOptions = ref([]);
const loadingProjects = ref(false);
const mentionedUsers = ref(new Set());

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
	};

	const isDifferent = JSON.stringify(currentState) !== JSON.stringify(initialFormState.value);

	if (isDirty.value !== isDifferent) {
		isDirty.value = isDifferent;
		emit('dirty-state-change', isDifferent);
	}
};

// Load teams for a given organization - maintains local team state
const loadTeamsForOrg = async (orgId) => {
	if (!orgId) {
		localTeams.value = [];
		localTeamOptions.value = [];
		return;
	}

	try {
		// First fetch teams using the composable
		await fetchTeams(orgId, { disableTeamRestoration: true });

		// Copy the teams to our local state
		localTeams.value = [...teams.value];

		// Prepare options for the dropdown
		localTeamOptions.value = localTeams.value.map((team) => ({
			id: team.id,
			name: team.name,
			description: team.description || '',
		}));
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
		const projects = await readItems('projects', {
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

	emit('update', {
		...form.value,
		mentioned_users: Array.from(mentionedUsers.value),
	});
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

	// Initialize form state
	initializeFormState();
});

// Expose form value and isDirty state to parent
defineExpose({
	form,
	isDirty,
	resetFormState: initializeFormState,
	// Also expose method to sync team with global state
	syncTeamWithGlobalState: () => {
		if (form.value.team) {
			setTeam(form.value.team);
		}
	},
});
</script>

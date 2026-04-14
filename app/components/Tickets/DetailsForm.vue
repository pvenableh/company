<template>
	<form
		@submit.prevent="handleSubmit"
		class="w-full space-y-4"
	>
		<div class="w-full max-w-96 pb-1">
			<TicketsDetailsPriority v-model="form.priority" animationDuration="0.2" />
		</div>
		<div class="w-full pb-1">
			<UFormGroup label="Title" required>
				<UInput v-model="form.title" placeholder="Enter ticket title" :loading="isLoading" />
			</UFormGroup>
		</div>
		<!-- Fields Grid -->
		<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
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
			<!-- Only show project dropdown if we have projects -->
			<UFormGroup v-if="form.organization && projectOptions.length > 1" label="Project (optional)">
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
			<!-- Due Date & Time -->
			<div class="min-w-0">
				<TicketsDetailsDateTime v-model="form.due_date" />
			</div>
		</div>
		<!-- Team row -->
		<div v-if="(localTeamOptions.length > 0 && !isAdminOrManager) || (localTeamOptions.length > 1 && isAdminOrManager)" class="max-w-xs">
			<UFormGroup
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
		</div>

		<!-- User Assignment -->
		<div class="pt-4 pb-2">
			<TicketsDetailsAssignment
				:organization-id="form.organization"
				:team-id="localTeamId"
				v-model:assigned-users="form.assigned_to"
				@user-removed="handleUserRemoved"
				@user-added="handleUserAdded"
			/>
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
	team: props.ticket.team?.id || null,
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

// Sync localTeamId with form.team
watch(localTeamId, (newTeamId) => {
	if (newTeamId !== null) {
		noTeamSelected.value = false;
	}
	form.value.team = newTeamId;
	emit('change', { type: 'team-changed', teamId: newTeamId });
});

// Re-fetch projects when client changes
watch(() => form.value.client, (newClientId, oldClientId) => {
	if (newClientId !== oldClientId && form.value.organization) {
		form.value.project = null;
		fetchProjects(form.value.organization, newClientId);
	}
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
const loadTeamsForOrg = async (orgId) => {
	if (!orgId) {
		localTeams.value = [];
		localTeamOptions.value = [];
		return;
	}

	try {
		await fetchTeams(orgId, { force: true });

		if (isAdminOrManager.value) {
			localTeams.value = [...teams.value];
		} else {
			localTeams.value = [...visibleTeams.value];
		}

		let options = localTeams.value.map((team) => ({
			id: team.id,
			name: team.name,
			description: team.description || '',
		}));

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

// Fetch projects for the selected organization, optionally filtered by client
const fetchProjects = async (orgId, clientId) => {
	if (!orgId) {
		projectOptions.value = [];
		form.value.project = null;
		return;
	}

	loadingProjects.value = true;
	try {
		const filter = { organization: { _eq: orgId } };
		if (clientId) {
			filter.client = { _eq: clientId };
		}
		const projects = await projectItems.list({
			fields: ['id', 'title'],
			filter,
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

// Handler for user removal
const handleUserRemoved = async (userId) => {
	emit('change', { type: 'user-removed', userId });
};

// Handler for user addition
const handleUserAdded = (userId) => {
	emit('change', { type: 'user-added', userId });
};

// Handling mentions in the description
const handleMention = (mentionData) => {
	mentionedUsers.value.add(mentionData.id);
	emit('change', { type: 'mention', userId: mentionData.id });
};

// Submit form - sync global team state before submitting
const handleSubmit = () => {
	if (!isAdminOrManager.value && !form.value.team) {
		toast.add({
			title: 'Error',
			description: 'Please select a team before saving',
			color: 'red',
		});
		return;
	}

	setTeam(form.value.team);

	const changedFields = {};
	let hasChanges = false;

	const isDifferentVal = (a, b) => {
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return true;
			const sortedA = [...a].sort();
			const sortedB = [...b].sort();
			return JSON.stringify(sortedA) !== JSON.stringify(sortedB);
		}
		if (typeof a === 'string' && typeof b === 'string') {
			const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
			if (datePattern.test(a) && datePattern.test(b)) {
				const dateA = new Date(a);
				const dateB = new Date(b);
				return dateA.getTime() !== dateB.getTime();
			}
		}
		return JSON.stringify(a) !== JSON.stringify(b);
	};

	for (const key in form.value) {
		if (isDifferentVal(form.value[key], initialFormState.value[key])) {
			changedFields[key] = form.value[key];
			hasChanges = true;
		}
	}

	changedFields.assigned_to = form.value.assigned_to;

	if (mentionedUsers.value.size > 0) {
		changedFields.mentioned_users = Array.from(mentionedUsers.value);
	}

	if (changedFields.status) {
		form.value.status = changedFields.status;
	}
	if (changedFields.priority) {
		form.value.priority = changedFields.priority;
	}

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
		client: form.value.client,
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
		const ticketTeamId = typeof newTicket.team === 'object' ? newTicket.team?.id || null : newTicket.team || null;
		const ticketOrgId = typeof newTicket.organization === 'object' ? newTicket.organization?.id || null : newTicket.organization || null;

		form.value = {
			title: newTicket.title || '',
			description: newTicket.description || '',
			status: newTicket.status || '',
			priority: newTicket.priority || 'low',
			category: newTicket.category || '',
			project: typeof newTicket.project === 'object' ? newTicket.project?.id || null : newTicket.project || null,
			organization: ticketOrgId,
			team: ticketTeamId,
			assigned_to: newTicket.assigned_to?.map((a) => typeof a === 'object' ? (a.directus_users_id?.id || a.id) : a) || [],
			due_date: newTicket.due_date || new Date().toISOString(),
			client: typeof newTicket.client === 'object' ? newTicket.client?.id || null : newTicket.client || null,
		};

		localTeamId.value = ticketTeamId;
		noTeamSelected.value = ticketTeamId === null && isAdminOrManager.value;

		initializeFormState();

		if (ticketOrgId) {
			await loadTeamsForOrg(ticketOrgId);
			const clientId = typeof newTicket.client === 'object' ? newTicket.client?.id || null : newTicket.client || null;
			await fetchProjects(ticketOrgId, clientId);
		}
	},
	{ immediate: true, deep: true },
);

// Initialize on mount
onMounted(async () => {
	if (props.ticket.organization?.id) {
		await loadTeamsForOrg(props.ticket.organization.id);

		if (props.ticket.team?.id) {
			localTeamId.value = props.ticket.team.id;
			noTeamSelected.value = false;
		} else {
			noTeamSelected.value = isAdminOrManager.value;
		}

		const initClientId = props.ticket.client?.id || (typeof props.ticket.client === 'string' ? props.ticket.client : null);
		await fetchProjects(props.ticket.organization.id, initClientId);
	}

	loadingClients.value = true;
	try {
		clientOptions.value = await getClientOptions();
	} catch { clientOptions.value = []; }
	finally { loadingClients.value = false; }

	initializeFormState();
});

const updateFormData = (newData) => {
	if (!newData) return;
	form.value = {
		title: newData.title || '',
		description: newData.description || '',
		status: newData.status || '',
		priority: newData.priority || 'low',
		category: newData.category || '',
		project: typeof newData.project === 'object' ? newData.project?.id || null : newData.project || null,
		organization: typeof newData.organization === 'object' ? newData.organization?.id || null : newData.organization || null,
		team: typeof newData.team === 'object' ? newData.team?.id || null : newData.team || null,
		assigned_to: newData.assigned_to?.map((a) => typeof a === 'object' ? (a.directus_users_id?.id || a.id) : a) || [],
		due_date: newData.due_date || new Date().toISOString(),
		client: typeof newData.client === 'object' ? newData.client?.id || null : newData.client || null,
	};

	initializeFormState();
};

// Expose form value and isDirty state to parent
defineExpose({
	form,
	isDirty,
	resetFormState: initializeFormState,
	updateFormData,
	handleSubmit,
	handleMention,
	syncTeamWithGlobalState: () => {
		if (form.value.team) {
			setTeam(form.value.team);
		}
	},
});
</script>

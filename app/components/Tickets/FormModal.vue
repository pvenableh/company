<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Ticket' : 'New Ticket'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!form.title.trim()"
		:statuses="timelineStatuses"
		:current-status="form.status"
		collection="tickets"
		:item-id="ticket?.id ?? null"
		:detail-route="ticket ? `/tickets/${ticket.id}` : null"
		@submit="handleSubmit"
		@delete="handleDelete"
		@status-change="e => form.status = e.newStatus"
	>
		<!-- Priority -->
		<div class="max-w-xs">
			<TicketsDetailsPriority v-model="form.priority" />
		</div>

		<!-- Title -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Title *</label>
			<UInput v-model="form.title" placeholder="Ticket title" />
		</div>

		<!-- Client, Project & Team -->
		<div class="grid grid-cols-3 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Client</label>
				<select
					v-model="form.client"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option :value="null">No client</option>
					<option v-for="c in clients" :key="c.value" :value="c.value">{{ c.label }}</option>
				</select>
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Project (optional)</label>
				<select
					v-model="form.project"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option :value="null">None</option>
					<option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
				</select>
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Team (optional)</label>
				<select
					v-model="form.team"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option :value="null">No team</option>
					<option v-for="t in teamOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
				</select>
			</div>
		</div>

		<!-- Status (for new tickets only) & Due Date -->
		<div class="grid grid-cols-2 gap-4">
			<div v-if="!isEditing" class="space-y-1">
				<label class="t-label text-muted-foreground">Status</label>
				<USelectMenu
					v-model="form.status"
					:options="statusOptions"
					option-attribute="label"
					value-attribute="value"
				/>
			</div>
			<div class="space-y-1 min-w-0">
				<label class="t-label text-muted-foreground">Due Date</label>
				<UInput v-model="form.due_date" type="datetime-local" />
			</div>
		</div>

		<!-- Assigned To -->
		<UiAssignmentPicker
			:modelValue="assignedUserIds"
			@update:modelValue="handleAssignmentChange"
			:users="availableUsers"
			label="Assigned To"
			empty-text="No one assigned"
			:multiple="false"
			@added="handleUserAdded"
			@removed="handleUserRemoved"
		/>
	</FormModal>
</template>

<script setup>
import { useFilteredUsers } from '~/composables/useFilteredUsers';

const props = defineProps({
	ticket: { type: Object, default: null },
	projectId: { type: String, default: null },
	organizationId: { type: String, default: null },
});

const emit = defineEmits(['created', 'updated', 'deleted']);

const isOpen = defineModel({ default: false });
const isEditing = computed(() => !!props.ticket?.id);
const saving = ref(false);

const ticketItems = useDirectusItems('tickets');
const ticketsDirectusUsersItems = useDirectusItems('tickets_directus_users');
const projectItems = useDirectusItems('projects');
const { getClientOptions } = useClients();
const { selectedOrg } = useOrganization();
const { teams, fetchTeams } = useTeams();
const { filteredUsers, fetchFilteredUsers } = useFilteredUsers();
const toast = useToast();

const clients = ref([]);
const projects = ref([]);
const teamOptions = ref([]);

const statusOptions = [
	{ label: 'Pending', value: 'Pending' },
	{ label: 'Scheduled', value: 'Scheduled' },
	{ label: 'In Progress', value: 'In Progress' },
	{ label: 'Completed', value: 'Completed' },
];

const timelineStatuses = statusOptions.map(s => ({ id: s.value, name: s.label }));

const form = reactive({
	title: '',
	priority: 'low',
	status: 'Pending',
	client: null,
	project: null,
	team: null,
	due_date: '',
	assigned_to: null,
});

const initialAssignedUsers = ref([]);

// Merge fetched users with any initially assigned users the picker needs to display
const availableUsers = computed(() => {
	const fetched = filteredUsers.value || [];
	const merged = [...fetched];
	// Ensure initially assigned users are in the list even if not yet fetched
	for (const u of initialAssignedUsers.value) {
		if (u?.id && !merged.some(m => m.id === u.id)) {
			merged.push(u);
		}
	}
	return merged;
});

// AssignmentPicker works with arrays
const assignedUserIds = computed(() => form.assigned_to ? [form.assigned_to] : []);

function handleAssignmentChange(ids) {
	form.assigned_to = ids.length > 0 ? ids[0] : null;
}

function handleUserAdded(userId) {
	form.assigned_to = userId;
}

function handleUserRemoved() {
	form.assigned_to = null;
}

function populateForm() {
	if (props.ticket) {
		form.title = props.ticket.title || '';
		form.priority = props.ticket.priority || 'low';
		form.status = props.ticket.status || 'Pending';
		form.client = typeof props.ticket.client === 'object' ? props.ticket.client?.id : props.ticket.client || null;
		form.project = typeof props.ticket.project === 'object' ? props.ticket.project?.id : props.ticket.project || null;
		form.team = typeof props.ticket.team === 'object' ? props.ticket.team?.id : props.ticket.team || null;
		// Extract assigned user ID and store user objects for the picker
		const assignedUsers = (props.ticket.assigned_to || [])
			.map(a => a?.directus_users_id)
			.filter(Boolean);
		initialAssignedUsers.value = assignedUsers;
		form.assigned_to = assignedUsers[0]?.id || null;

		// Convert due_date to datetime-local format
		if (props.ticket.due_date) {
			try {
				const d = new Date(props.ticket.due_date);
				const pad = (n) => String(n).padStart(2, '0');
				form.due_date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
			} catch { form.due_date = ''; }
		} else {
			form.due_date = '';
		}
	} else {
		form.title = '';
		form.priority = 'low';
		form.status = 'Pending';
		form.client = null;
		form.project = props.projectId || null;
		form.team = null;
		form.due_date = '';
		form.assigned_to = null;
	}
}

// Re-fetch projects when client changes
watch(() => form.client, async (clientId) => {
	const orgId = props.organizationId || selectedOrg.value;
	if (!orgId) return;
	try {
		const filter = { organization: { _eq: orgId } };
		if (clientId) filter.client = { _eq: clientId };
		const data = await projectItems.list({ fields: ['id', 'title'], filter });
		projects.value = data || [];
	} catch { projects.value = []; }
});

watch(isOpen, (val) => {
	if (val) {
		populateForm();
		loadOptions();
	}
});

async function loadOptions() {
	const orgId = props.organizationId || selectedOrg.value;

	try {
		clients.value = await getClientOptions();
	} catch { clients.value = []; }

	if (orgId) {
		try {
			const filter = { organization: { _eq: orgId } };
			if (form.client) filter.client = { _eq: form.client };
			const data = await projectItems.list({ fields: ['id', 'title'], filter });
			projects.value = data || [];
		} catch { projects.value = []; }

		try {
			await fetchTeams(orgId, { force: true });
			teamOptions.value = [{ id: null, name: 'No Team' }, ...teams.value.map(t => ({ id: t.id, name: t.name }))];
		} catch { teamOptions.value = []; }

		try {
			await fetchFilteredUsers(orgId, form.team);
		} catch {}
	}
}

async function handleSubmit() {
	if (!form.title.trim()) return;
	saving.value = true;

	const payload = {
		title: form.title.trim(),
		priority: form.priority,
		status: form.status,
		client: form.client || null,
		project: form.project || null,
		team: form.team || null,
		due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
	};

	if (!isEditing.value && (props.organizationId || selectedOrg.value)) {
		payload.organization = props.organizationId || selectedOrg.value;
	}

	try {
		if (isEditing.value) {
			await ticketItems.update(props.ticket.id, { ...payload, date_updated: new Date() });

			// Handle assignment changes
			if (form.assigned_to) {
				const currentAssignments = props.ticket.assigned_to?.map(a =>
					typeof a === 'object' ? a.directus_users_id?.id || a.id : a
				) || [];
				if (!currentAssignments.includes(form.assigned_to)) {
					await ticketsDirectusUsersItems.create({
						tickets_id: props.ticket.id,
						directus_users_id: form.assigned_to,
					});
				}
			}

			toast.add({ title: 'Ticket updated', color: 'green' });
			emit('updated');
		} else {
			const created = await ticketItems.create(payload);

			// Add assignment if selected
			if (form.assigned_to && created?.id) {
				await ticketsDirectusUsersItems.create({
					tickets_id: created.id,
					directus_users_id: form.assigned_to,
				});
			}

			toast.add({ title: 'Ticket created', color: 'green' });
			emit('created', created);
		}
		isOpen.value = false;
	} catch (err) {
		console.error('Error saving ticket:', err);
		toast.add({ title: 'Failed to save ticket', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value) return;
	if (!confirm('Are you sure you want to delete this ticket? This cannot be undone.')) return;

	saving.value = true;
	try {
		const { isOrgAdminOrAbove } = useOrgRole();
		if (isOrgAdminOrAbove.value) {
			await ticketItems.remove(props.ticket.id);
		} else {
			await ticketItems.update(props.ticket.id, { status: 'Archived' });
		}
		toast.add({ title: 'Ticket deleted', color: 'green' });
		emit('deleted');
		isOpen.value = false;
	} catch (err) {
		console.error('Error deleting ticket:', err);
		toast.add({ title: 'Failed to delete ticket', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

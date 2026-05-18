<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Project' : 'New Project'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!form.title.trim()"
		:statuses="projectStatuses"
		:current-status="currentStatus"
		collection="projects"
		:item-id="project?.id ?? null"
		:detail-route="project ? `/projects/${project.id}` : null"
		@submit="handleSubmit"
		@delete="handleDelete"
		@status-change="e => currentStatus = e.newStatus"
	>
		<!-- Title -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Title *</label>
			<UInput v-model="form.title" placeholder="Project title" />
		</div>

		<!-- Description -->
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Description</label>
			<UTextarea v-model="form.description" placeholder="Project description..." :rows="3" />
		</div>

		<!-- Client & Service -->
		<div class="grid grid-cols-2 gap-4">
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
				<label class="t-label text-muted-foreground">Service</label>
				<select
					v-model="form.service"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option :value="null">No service</option>
					<option v-for="s in services" :key="s.id" :value="s.id">{{ s.name }}</option>
				</select>
			</div>
		</div>

		<!-- Status (create-only, edit-mode uses timeline) & Template -->
		<div class="grid grid-cols-2 gap-4">
			<div v-if="!isEditing" class="space-y-1">
				<label class="t-label text-muted-foreground">Status</label>
				<USelectMenu
					v-model="currentStatus"
					:options="statusOptions"
					option-attribute="label"
					value-attribute="value"
				/>
			</div>
			<div class="space-y-1" :class="{ 'col-span-2': isEditing }">
				<label class="t-label text-muted-foreground">Template</label>
				<USelectMenu
					v-model="form.template"
					:options="templateOptions"
					option-attribute="label"
					value-attribute="value"
				/>
			</div>
		</div>

		<!-- Dates -->
		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Start Date</label>
				<UInput v-model="form.start_date" type="date" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Due Date</label>
				<UInput v-model="form.due_date" type="date" />
			</div>
		</div>

		<!-- Contract Value & URL -->
		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Contract Value</label>
				<UInput v-model="form.contract_value" type="number" placeholder="0.00" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">URL</label>
				<UInput v-model="form.url" placeholder="https://..." />
			</div>
		</div>

		<!-- Billing -->
		<div class="space-y-3 pt-3 border-t border-border/50">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Billing Type</label>
				<select
					v-model="form.billing_type"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option :value="null">Not set</option>
					<option value="fixed_fee">Fixed Fee</option>
					<option value="hourly_retainer">Hourly Retainer</option>
					<option value="time_and_materials">Time &amp; Materials</option>
					<option value="non_billable">Non-billable</option>
				</select>
			</div>

			<template v-if="form.billing_type === 'hourly_retainer'">
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Hours per Period</label>
						<UInput v-model="form.retainer_hours_per_period" type="number" placeholder="20" step="0.5" />
					</div>
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Period</label>
						<select
							v-model="form.retainer_period"
							class="w-full rounded-full border bg-background px-3 py-2 text-sm"
						>
							<option value="monthly">Monthly</option>
							<option value="quarterly">Quarterly</option>
						</select>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Hourly Rate</label>
						<UInput v-model="form.retainer_hourly_rate" type="number" placeholder="150.00" step="0.01" />
					</div>
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Started</label>
						<UInput v-model="form.retainer_started_at" type="date" />
					</div>
				</div>
				<div class="flex items-start gap-2 pt-1">
					<input
						id="show_hours_to_client"
						v-model="form.show_hours_to_client"
						type="checkbox"
						class="mt-0.5"
					/>
					<label for="show_hours_to_client" class="text-xs text-muted-foreground cursor-pointer">
						<span class="text-foreground font-medium">Show hours used to client in portal</span><br>
						Displays the monthly total only. Per-entry detail is never shown.
					</label>
				</div>
			</template>
		</div>

		<!-- Assigned Users (edit mode only) -->
		<div v-if="isEditing" class="space-y-1">
			<label class="t-label text-muted-foreground">Assigned Users</label>
			<div class="flex flex-wrap gap-1.5 mb-1.5">
				<span
					v-for="u in assignedUsers"
					:key="u.id"
					class="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-xs"
				>
					{{ u.first_name }} {{ u.last_name }}
					<button type="button" class="text-muted-foreground/60 hover:text-destructive transition-colors" @click="removeAssignedUser(u.id)">
						<Icon name="lucide:x" class="w-3 h-3" />
					</button>
				</span>
				<span v-if="!assignedUsers.length" class="text-xs text-muted-foreground/60 py-1">No users assigned</span>
			</div>
			<select
				class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				@change="addAssignedUser($event.target.value); $event.target.value = ''"
			>
				<option value="">+ Add user...</option>
				<option v-for="u in availableUsers" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option>
			</select>
		</div>
	</FormModal>
</template>

<script setup>
import { toast } from 'vue-sonner';

const props = defineProps({
	project: { type: Object, default: null },
	defaults: { type: Object, default: null },
});

const emit = defineEmits(['created', 'updated', 'deleted']);

const isOpen = defineModel({ default: false });
const isEditing = computed(() => !!props.project?.id);
const saving = ref(false);

const projectItems = useDirectusItems('projects');
const { getClientOptions } = useClients();
const { selectedOrg } = useOrganization();
const serviceItems = useDirectusItems('services');

const clients = ref([]);
const services = ref([]);
const assignedUsers = ref([]);
const allOrgUsers = ref([]);
const junctionItems = useDirectusItems('projects_directus_users');

const statusOptions = [
	{ label: 'Pending', value: 'Pending' },
	{ label: 'Scheduled', value: 'Scheduled' },
	{ label: 'In Progress', value: 'In Progress' },
	{ label: 'Completed', value: 'completed' },
	{ label: 'Archived', value: 'Archived' },
];

// Timeline stages — map statusOptions to the {id, name} shape FormStatusTimeline expects
const projectStatuses = statusOptions.map(s => ({ id: s.value, name: s.label }));

const templateOptions = [
	{ label: 'Web Project', value: 'web-project' },
	{ label: 'Branding Project', value: 'branding-project' },
];

const currentStatus = ref('Pending');

const form = reactive({
	title: '',
	description: '',
	client: null,
	service: null,
	template: 'web-project',
	start_date: '',
	due_date: '',
	contract_value: null,
	url: '',
	billing_type: null,
	retainer_hours_per_period: null,
	retainer_period: 'monthly',
	retainer_hourly_rate: null,
	retainer_started_at: '',
	show_hours_to_client: false,
});

function populateForm() {
	if (props.project) {
		form.title = props.project.title || '';
		form.description = props.project.description || '';
		form.client = props.project.client?.id || props.project.client || null;
		form.service = props.project.service?.id || props.project.service || null;
		form.template = props.project.template || 'web-project';
		form.start_date = props.project.start_date?.split('T')[0] || '';
		form.due_date = props.project.due_date?.split('T')[0] || '';
		form.contract_value = props.project.contract_value || null;
		form.url = props.project.url || '';
		form.billing_type = props.project.billing_type || null;
		form.retainer_hours_per_period = props.project.retainer_hours_per_period ?? null;
		form.retainer_period = props.project.retainer_period || 'monthly';
		form.retainer_hourly_rate = props.project.retainer_hourly_rate ?? null;
		form.retainer_started_at = props.project.retainer_started_at?.split('T')[0] || '';
		form.show_hours_to_client = !!props.project.show_hours_to_client;
		currentStatus.value = props.project.status || 'Pending';
	} else {
		form.title = '';
		form.description = '';
		form.client = props.defaults?.client || null;
		form.service = props.defaults?.service || null;
		form.template = 'web-project';
		form.start_date = '';
		form.due_date = '';
		form.contract_value = null;
		form.url = '';
		form.billing_type = null;
		form.retainer_hours_per_period = null;
		form.retainer_period = 'monthly';
		form.retainer_hourly_rate = null;
		form.retainer_started_at = '';
		form.show_hours_to_client = false;
		currentStatus.value = 'Pending';
	}
}

watch(isOpen, (val) => {
	if (val) {
		populateForm();
		loadOptions();
	}
});

const availableUsers = computed(() => {
	const assignedIds = new Set(assignedUsers.value.map(u => u.id));
	return allOrgUsers.value.filter(u => !assignedIds.has(u.id));
});

async function loadOptions() {
	try {
		clients.value = await getClientOptions();
	} catch { clients.value = []; }

	try {
		services.value = await serviceItems.list({
			fields: ['id', 'name', 'color'],
			filter: { status: { _eq: 'published' } },
			sort: ['name'],
			limit: -1,
		});
	} catch { services.value = []; }

	// Load assigned users + all org users for the picker
	if (props.project?.id) {
		try {
			const junctions = await junctionItems.list({
				filter: { projects_id: { _eq: props.project.id } },
				fields: ['id', 'directus_users_id.id', 'directus_users_id.first_name', 'directus_users_id.last_name', 'directus_users_id.email'],
				limit: -1,
			});
			assignedUsers.value = junctions.map(j => j.directus_users_id).filter(Boolean);
		} catch { assignedUsers.value = []; }
	}

	if (selectedOrg.value) {
		try {
			const { readUsers } = useDirectusUsers();
			allOrgUsers.value = await readUsers({
				filter: { organizations: { organizations_id: { id: { _eq: selectedOrg.value } } } },
				fields: ['id', 'first_name', 'last_name', 'email'],
				sort: ['first_name'],
			});
		} catch { allOrgUsers.value = []; }
	}
}

async function addAssignedUser(userId) {
	if (!userId || !props.project?.id) return;
	try {
		await junctionItems.create({
			projects_id: props.project.id,
			directus_users_id: userId,
		});
		const user = allOrgUsers.value.find(u => u.id === userId);
		if (user) assignedUsers.value.push(user);
	} catch (err) {
		console.error('Failed to assign user:', err);
	}
}

async function removeAssignedUser(userId) {
	if (!props.project?.id) return;
	try {
		const junctions = await junctionItems.list({
			filter: {
				_and: [
					{ projects_id: { _eq: props.project.id } },
					{ directus_users_id: { _eq: userId } },
				],
			},
			fields: ['id'],
			limit: 1,
		});
		if (junctions.length > 0) {
			await junctionItems.remove(junctions[0].id);
			assignedUsers.value = assignedUsers.value.filter(u => u.id !== userId);
		}
	} catch (err) {
		console.error('Failed to remove user:', err);
	}
}

async function handleSubmit() {
	if (!form.title.trim()) return;
	saving.value = true;

	const isRetainer = form.billing_type === 'hourly_retainer';
	const payload = {
		title: form.title.trim(),
		description: form.description?.trim() || null,
		status: currentStatus.value,
		template: form.template,
		client: form.client || null,
		service: form.service || null,
		start_date: form.start_date || null,
		due_date: form.due_date || null,
		contract_value: form.contract_value === '' || form.contract_value == null ? null : Number(form.contract_value),
		url: form.url?.trim() || null,
		billing_type: form.billing_type || null,
		retainer_hours_per_period: isRetainer && form.retainer_hours_per_period !== '' && form.retainer_hours_per_period != null
			? Number(form.retainer_hours_per_period)
			: null,
		retainer_period: isRetainer ? (form.retainer_period || 'monthly') : null,
		retainer_hourly_rate: isRetainer && form.retainer_hourly_rate !== '' && form.retainer_hourly_rate != null
			? Number(form.retainer_hourly_rate)
			: null,
		retainer_started_at: isRetainer ? (form.retainer_started_at || null) : null,
		show_hours_to_client: isRetainer ? !!form.show_hours_to_client : false,
	};

	if (!isEditing.value && selectedOrg.value) {
		payload.organization = selectedOrg.value;
	}

	try {
		if (isEditing.value) {
			await projectItems.update(props.project.id, payload);
			toast.success('Project updated');
			emit('updated');
		} else {
			const created = await projectItems.create(payload);
			toast.success('Project created');
			emit('created', created);
		}
		isOpen.value = false;
	} catch (err) {
		console.error('Error saving project:', err);
		toast.error('Failed to save project');
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value) return;
	if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;

	saving.value = true;
	try {
		await projectItems.remove(props.project.id);
		toast.success('Project deleted');
		emit('deleted');
		isOpen.value = false;
	} catch (err) {
		console.error('Error deleting project:', err);
		toast.error('Failed to delete project');
	} finally {
		saving.value = false;
	}
}
</script>

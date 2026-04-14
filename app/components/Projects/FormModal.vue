<template>
	<UModal v-model="isOpen" class="sm:max-w-lg">
		<template #header>
			<div class="flex items-center justify-between w-full">
				<h3 class="text-sm font-bold uppercase tracking-wide">{{ isEditing ? 'Edit Project' : 'New Project' }}</h3>
				<Button variant="ghost" size="icon-sm" @click="isOpen = false">
					<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
				</Button>
			</div>
		</template>

		<form @submit.prevent="handleSubmit" class="space-y-4 p-4">
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

			<!-- Status & Template -->
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Status</label>
					<USelectMenu
						v-model="form.status"
						:options="statusOptions"
						option-attribute="label"
						value-attribute="value"
					/>
				</div>
				<div class="space-y-1">
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
		</form>

		<template #footer>
			<div class="flex items-center justify-between w-full">
				<div class="flex items-center gap-1">
					<UTooltip v-if="isEditing" text="Delete">
						<Button
							variant="ghost"
							size="icon-sm"
							class="text-destructive hover:text-destructive hover:bg-destructive/10"
							:disabled="saving"
							@click="handleDelete"
						>
							<Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
						</Button>
					</UTooltip>
					<Button size="sm" :disabled="saving || !form.title.trim()" @click="handleSubmit">
						<Icon v-if="saving" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 animate-spin" />
						<Icon v-else name="lucide:save" class="h-3.5 w-3.5 mr-1" />
						{{ isEditing ? 'Save' : 'Create' }}
					</Button>
				</div>
				<NuxtLink v-if="isEditing && project?.id" :to="`/projects/${project.id}`" class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors">
					Full Details
					<Icon name="lucide:chevron-right" class="w-3 h-3" />
				</NuxtLink>
			</div>
		</template>
	</UModal>
</template>

<script setup>
import { Button } from '~/components/ui/button';
import { toast } from 'vue-sonner';

const props = defineProps({
	project: { type: Object, default: null },
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

const templateOptions = [
	{ label: 'Web Project', value: 'web-project' },
	{ label: 'Branding Project', value: 'branding-project' },
];

const form = reactive({
	title: '',
	description: '',
	client: null,
	service: null,
	status: 'Pending',
	template: 'web-project',
	start_date: '',
	due_date: '',
	contract_value: null,
	url: '',
});

function populateForm() {
	if (props.project) {
		form.title = props.project.title || '';
		form.description = props.project.description || '';
		form.client = props.project.client?.id || props.project.client || null;
		form.service = props.project.service?.id || props.project.service || null;
		form.status = props.project.status || 'Pending';
		form.template = props.project.template || 'web-project';
		form.start_date = props.project.start_date?.split('T')[0] || '';
		form.due_date = props.project.due_date?.split('T')[0] || '';
		form.contract_value = props.project.contract_value || null;
		form.url = props.project.url || '';
	} else {
		form.title = '';
		form.description = '';
		form.client = null;
		form.service = null;
		form.status = 'Pending';
		form.template = 'web-project';
		form.start_date = '';
		form.due_date = '';
		form.contract_value = null;
		form.url = '';
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

	const payload = {
		title: form.title.trim(),
		description: form.description?.trim() || null,
		status: form.status,
		template: form.template,
		client: form.client || null,
		service: form.service || null,
		start_date: form.start_date || null,
		due_date: form.due_date || null,
		contract_value: form.contract_value || null,
		url: form.url?.trim() || null,
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

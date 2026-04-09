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
						class="w-full rounded-md border bg-background px-3 py-2 text-sm"
					>
						<option :value="null">No client</option>
						<option v-for="c in clients" :key="c.value" :value="c.value">{{ c.label }}</option>
					</select>
				</div>
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Service</label>
					<select
						v-model="form.service"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm"
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

			<!-- Contract Value & Billable -->
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
		</form>

		<template #footer>
			<div class="flex items-center justify-between w-full">
				<div>
					<Button
						v-if="isEditing"
						variant="ghost"
						size="sm"
						class="text-destructive hover:text-destructive hover:bg-destructive/10"
						:disabled="saving"
						@click="handleDelete"
					>
						<UIcon name="i-heroicons-trash" class="h-3.5 w-3.5 mr-1" />
						Delete
					</Button>
				</div>
				<div class="flex gap-3">
					<Button variant="outline" size="sm" @click="isOpen = false">Cancel</Button>
					<Button size="sm" :disabled="saving || !form.title.trim()" @click="handleSubmit">
						<UIcon v-if="saving" name="i-heroicons-arrow-path" class="animate-spin h-3 w-3 mr-1" />
						{{ isEditing ? 'Save Changes' : 'Create Project' }}
					</Button>
				</div>
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

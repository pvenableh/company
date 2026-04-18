<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Client' : 'New Client'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!formRef?.hasName"
		:statuses="clientStatuses"
		:current-status="currentStatus"
		collection="clients"
		:item-id="client?.id ?? null"
		:detail-route="client ? `/clients/${client.id}` : null"
		@submit="triggerSave"
		@delete="handleDelete"
		@status-change="e => currentStatus = e.newStatus"
	>
		<ClientsClientForm
			v-if="isOpen"
			:key="client?.id || 'new'"
			ref="formRef"
			:client="client"
			:saving="saving"
			v-model:status="currentStatus"
			@save="onFormSave"
		/>
	</FormModal>
</template>

<script setup lang="ts">
import type { Client } from '~~/shared/directus';

const props = defineProps<{
	client?: Client | null;
}>();

const emit = defineEmits<{
	created: [client: Client];
	updated: [client: Client];
	deleted: [id: string];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.client?.id);
const saving = ref(false);
const currentStatus = ref<string>(props.client?.status || 'active');
const formRef = ref<any>(null);

const toast = useToast();
const { createClient, updateClient, deleteClient } = useClients();

const clientStatuses = [
	{ id: 'active', name: 'Active' },
	{ id: 'prospect', name: 'Prospect' },
	{ id: 'inactive', name: 'Inactive' },
	{ id: 'archived', name: 'Archived' },
];

watch(isOpen, (open) => {
	if (open) {
		currentStatus.value = props.client?.status || 'active';
	}
});

function triggerSave() {
	formRef.value?.triggerSubmit?.();
}

async function onFormSave(payload: Partial<Client>) {
	saving.value = true;
	try {
		if (isEditing.value && props.client?.id) {
			const updated = await updateClient(props.client.id as string, payload);
			toast.add({ title: 'Client updated', color: 'green' });
			emit('updated', updated);
		} else {
			const created = await createClient(payload);
			toast.add({ title: 'Client created', color: 'green' });
			emit('created', created);
		}
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error saving client:', err);
		toast.add({ title: 'Failed to save client', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.client?.id) return;
	if (!confirm(`Are you sure you want to delete ${props.client.name || 'this client'}? This cannot be undone.`)) return;

	saving.value = true;
	try {
		await deleteClient(props.client.id as string);
		toast.add({ title: 'Client deleted', color: 'green' });
		emit('deleted', props.client.id as string);
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error deleting client:', err);
		toast.add({ title: 'Failed to delete client', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

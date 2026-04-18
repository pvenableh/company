<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Invoice' : 'New Invoice'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!formRef?.hasLineItems"
		:statuses="invoiceStatuses"
		:current-status="currentStatus"
		collection="invoices"
		:item-id="invoice?.id ?? null"
		:detail-route="invoice ? `/invoices/detail/${invoice.id}` : null"
		@submit="triggerSave"
		@delete="handleDelete"
		@status-change="e => currentStatus = e.newStatus"
	>
		<InvoicesInvoiceForm
			v-if="isOpen"
			:key="invoice?.id || 'new'"
			ref="formRef"
			:invoice="invoice"
			:saving="saving"
			:defaults="defaults"
			v-model:status="currentStatus"
			@save="onFormSave"
		/>
	</FormModal>
</template>

<script setup lang="ts">
import type { Invoice } from '~~/shared/directus';

const props = defineProps<{
	invoice?: Invoice | null;
	defaults?: { projects?: string[]; bill_to?: string | null; client?: string | null } | null;
}>();

const emit = defineEmits<{
	created: [invoice: Invoice];
	updated: [invoice: Invoice];
	deleted: [id: string];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.invoice?.id);
const saving = ref(false);
const currentStatus = ref<string>(props.invoice?.status || 'pending');
const formRef = ref<any>(null);

const toast = useToast();
const { createInvoice, updateInvoice, deleteInvoice } = useInvoices();

const invoiceStatuses = [
	{ id: 'pending', name: 'Pending' },
	{ id: 'processing', name: 'Processing' },
	{ id: 'paid', name: 'Paid' },
	{ id: 'archived', name: 'Archived' },
];

// Reset status when modal reopens for a (potentially different) invoice
watch(isOpen, (open) => {
	if (open) {
		currentStatus.value = props.invoice?.status || 'pending';
	}
});

function triggerSave() {
	formRef.value?.triggerSubmit?.();
}

async function onFormSave(payload: any) {
	saving.value = true;
	try {
		if (isEditing.value && props.invoice?.id) {
			const updated = await updateInvoice(props.invoice.id, payload);
			toast.add({ title: 'Invoice updated', color: 'green' });
			emit('updated', updated);
		} else {
			const created = await createInvoice(payload);
			toast.add({ title: 'Invoice created', color: 'green' });
			emit('created', created);
		}
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error saving invoice:', err);
		toast.add({ title: 'Failed to save invoice', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.invoice?.id) return;
	if (!confirm('Are you sure you want to delete this invoice? This cannot be undone.')) return;

	saving.value = true;
	try {
		await deleteInvoice(props.invoice.id);
		toast.add({ title: 'Invoice deleted', color: 'green' });
		emit('deleted', props.invoice.id);
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error deleting invoice:', err);
		toast.add({ title: 'Failed to delete invoice', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

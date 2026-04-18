<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Contact' : 'New Contact'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!formRef?.hasRequired"
		collection="contacts"
		:item-id="contact?.id ?? null"
		:detail-route="contact ? `/contacts/${contact.id}` : null"
		@submit="triggerSave"
		@delete="handleDelete"
	>
		<ContactsContactForm
			v-if="isOpen"
			:key="contact?.id || 'new'"
			ref="formRef"
			:contact="contact"
			:saving="saving"
			@submit="onFormSave"
		/>
	</FormModal>
</template>

<script setup lang="ts">
import type { Contact, CreateContactPayload } from '~~/shared/email/contacts';

const props = defineProps<{
	contact?: Contact | null;
}>();

const emit = defineEmits<{
	created: [contact: Contact];
	updated: [contact: Contact];
	deleted: [id: string];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.contact?.id);
const saving = ref(false);
const formRef = ref<any>(null);

const toast = useToast();
const { createContact, updateContact, deleteContact } = useContacts();

function triggerSave() {
	formRef.value?.triggerSubmit?.();
}

async function onFormSave(payload: CreateContactPayload) {
	saving.value = true;
	try {
		if (isEditing.value && props.contact?.id) {
			const updated = await updateContact(props.contact.id, payload as Partial<Contact>);
			toast.add({ title: 'Contact updated', color: 'green' });
			emit('updated', updated);
		} else {
			const created = await createContact(payload);
			toast.add({ title: 'Contact created', color: 'green' });
			emit('created', created);
		}
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error saving contact:', err);
		toast.add({ title: 'Failed to save contact', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.contact?.id) return;
	const name = `${props.contact.first_name || ''} ${props.contact.last_name || ''}`.trim() || 'this contact';
	if (!confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) return;

	saving.value = true;
	try {
		await deleteContact(props.contact.id);
		toast.add({ title: 'Contact deleted', color: 'green' });
		emit('deleted', props.contact.id);
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error deleting contact:', err);
		toast.add({ title: 'Failed to delete contact', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

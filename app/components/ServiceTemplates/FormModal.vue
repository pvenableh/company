<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Service Template' : 'New Service Template'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!formRef?.hasName"
		collection="service_templates"
		:item-id="template?.id ?? null"
		@submit="triggerSave"
		@delete="handleDelete"
	>
		<ServiceTemplatesServiceTemplateForm
			v-if="isOpen"
			:key="template?.id || 'new'"
			ref="formRef"
			:template="template"
			:saving="saving"
			@submit="onFormSave"
		/>
	</FormModal>
</template>

<script setup lang="ts">
import type { ServiceTemplate } from '~/composables/useServiceTemplates';

const props = defineProps<{
	template?: Partial<ServiceTemplate> | null;
}>();

const emit = defineEmits<{
	created: [t: ServiceTemplate];
	updated: [t: ServiceTemplate];
	deleted: [id: string];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.template?.id);
const saving = ref(false);
const formRef = ref<any>(null);
const toast = useToast();
const { create, update, remove } = useServiceTemplates();

function triggerSave() {
	formRef.value?.triggerSubmit?.();
}

async function onFormSave(payload: any) {
	saving.value = true;
	try {
		if (isEditing.value && props.template?.id) {
			const updated = await update(props.template.id, payload);
			toast.add({ title: 'Template updated', color: 'green' });
			emit('updated', updated);
		} else {
			const created = await create(payload);
			toast.add({ title: 'Template created', color: 'green' });
			emit('created', created);
		}
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error saving template:', err);
		toast.add({ title: 'Failed to save template', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.template?.id) return;
	if (!confirm(`Delete "${props.template.name || 'this template'}"? This cannot be undone.`)) return;
	saving.value = true;
	try {
		await remove(props.template.id);
		toast.add({ title: 'Template deleted', color: 'green' });
		emit('deleted', props.template.id);
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error deleting template:', err);
		toast.add({ title: 'Failed to delete template', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

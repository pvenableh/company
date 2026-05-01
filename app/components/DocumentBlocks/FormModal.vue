<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Block' : 'New Block'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!formRef?.hasName"
		collection="document_blocks"
		:item-id="block?.id ?? null"
		@submit="triggerSave"
		@delete="handleDelete"
	>
		<DocumentBlocksDocumentBlockForm
			v-if="isOpen"
			:key="block?.id || 'new'"
			ref="formRef"
			:block="block"
			:saving="saving"
			@submit="onFormSave"
		/>
	</FormModal>
</template>

<script setup lang="ts">
import type { DocumentBlock } from '~/composables/useDocumentBlocks';

const props = defineProps<{
	block?: Partial<DocumentBlock> | null;
}>();

const emit = defineEmits<{
	created: [b: DocumentBlock];
	updated: [b: DocumentBlock];
	deleted: [id: string];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.block?.id);
const saving = ref(false);
const formRef = ref<any>(null);
const toast = useToast();
const { create, update, remove } = useDocumentBlocks();

function triggerSave() { formRef.value?.triggerSubmit?.(); }

async function onFormSave(payload: any) {
	saving.value = true;
	try {
		if (isEditing.value && props.block?.id) {
			const updated = await update(props.block.id, payload);
			toast.add({ title: 'Block updated', color: 'green' });
			emit('updated', updated);
		} else {
			const created = await create(payload);
			toast.add({ title: 'Block created', color: 'green' });
			emit('created', created);
		}
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error saving block:', err);
		toast.add({ title: 'Failed to save block', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.block?.id) return;
	if (!confirm(`Delete "${props.block.name || 'this block'}"? This cannot be undone.`)) return;
	saving.value = true;
	try {
		await remove(props.block.id);
		toast.add({ title: 'Block deleted', color: 'green' });
		emit('deleted', props.block.id);
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error deleting block:', err);
		toast.add({ title: 'Failed to delete block', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

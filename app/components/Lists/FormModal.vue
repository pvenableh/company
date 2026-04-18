<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Mailing List' : 'New Mailing List'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!form.name.trim()"
		collection="mailing_lists"
		:item-id="list?.id ?? null"
		:detail-route="list ? `/lists/${list.id}` : null"
		@submit="handleSubmit"
		@delete="handleDelete"
	>
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Name *</label>
			<UInput v-model="form.name" required placeholder="e.g. Monthly Newsletter" />
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Description</label>
			<UInput v-model="form.description" placeholder="Optional description" />
		</div>

		<div class="flex items-center gap-4 pt-1">
			<label class="flex items-center gap-2 text-sm">
				<input v-model="form.is_default" type="checkbox" class="accent-primary" />
				Default list
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input v-model="form.double_opt_in" type="checkbox" class="accent-primary" />
				Double opt-in
			</label>
		</div>
	</FormModal>
</template>

<script setup lang="ts">
import type { MailingList } from '~~/shared/email/contacts';

const props = defineProps<{
	list?: MailingList | null;
}>();

const emit = defineEmits<{
	created: [list: MailingList];
	updated: [list: MailingList];
	deleted: [id: string];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.list?.id);
const saving = ref(false);

const toast = useToast();
const { createList } = useMailingLists();
const listItems = useDirectusItems('mailing_lists');

const form = reactive({
	name: '',
	slug: '',
	description: '',
	is_default: false,
	double_opt_in: false,
});

function populateForm() {
	if (props.list) {
		form.name = props.list.name || '';
		form.slug = (props.list as any).slug || '';
		form.description = (props.list as any).description || '';
		form.is_default = (props.list as any).is_default || false;
		form.double_opt_in = (props.list as any).double_opt_in || false;
	} else {
		form.name = '';
		form.slug = '';
		form.description = '';
		form.is_default = false;
		form.double_opt_in = false;
	}
}

watch(isOpen, (open) => {
	if (open) populateForm();
});

function generateSlug(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function handleSubmit() {
	if (!form.name.trim()) return;
	saving.value = true;

	const payload = {
		name: form.name.trim(),
		slug: form.slug || generateSlug(form.name),
		description: form.description || null,
		is_default: form.is_default,
		double_opt_in: form.double_opt_in,
	};

	try {
		if (isEditing.value && props.list?.id) {
			const updated = await listItems.update(props.list.id, payload);
			toast.add({ title: 'List updated', color: 'green' });
			emit('updated', updated as MailingList);
		} else {
			const created = await createList(payload as any);
			toast.add({ title: 'List created', color: 'green' });
			emit('created', created as MailingList);
		}
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error saving list:', err);
		toast.add({ title: 'Failed to save list', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.list?.id) return;
	if (!confirm(`Delete mailing list "${props.list.name}"? This cannot be undone.`)) return;

	saving.value = true;
	try {
		await listItems.remove(props.list.id);
		toast.add({ title: 'List deleted', color: 'green' });
		emit('deleted', String(props.list.id));
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error deleting list:', err);
		toast.add({ title: 'Failed to delete list', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

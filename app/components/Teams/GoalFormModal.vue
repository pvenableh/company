<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Goal' : 'New Goal'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!formRef?.hasTitle"
		collection="team_goals"
		:item-id="goal?.id ?? null"
		@submit="triggerSave"
		@delete="handleDelete"
	>
		<TeamsGoalForm
			v-if="isOpen"
			:key="goal?.id || 'new'"
			ref="formRef"
			:goal="goal"
			:saving="saving"
			@save="onFormSave"
		/>
	</FormModal>
</template>

<script setup lang="ts">
const props = defineProps<{
	goal?: any;
	teamId: string;
}>();

const emit = defineEmits<{
	created: [goal: any];
	updated: [goal: any];
	deleted: [id: string];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.goal?.id);
const saving = ref(false);
const formRef = ref<any>(null);

const toast = useToast();
const goalItems = useDirectusItems('team_goals');

function triggerSave() {
	formRef.value?.triggerSubmit?.();
}

async function onFormSave(payload: any) {
	saving.value = true;
	try {
		if (isEditing.value && props.goal?.id) {
			const updated = await goalItems.update(props.goal.id, payload);
			toast.add({ title: 'Goal updated', color: 'green' });
			emit('updated', updated);
		} else {
			const created = await goalItems.create({ ...payload, team: props.teamId });
			toast.add({ title: 'Goal added', color: 'green' });
			emit('created', created);
		}
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error saving goal:', err);
		toast.add({ title: 'Failed to save goal', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.goal?.id) return;
	if (!confirm(`Delete "${props.goal.title}"? This cannot be undone.`)) return;

	saving.value = true;
	try {
		await goalItems.remove(props.goal.id);
		toast.add({ title: 'Goal deleted', color: 'green' });
		emit('deleted', props.goal.id);
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error deleting goal:', err);
		toast.add({ title: 'Failed to delete goal', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<FormModal
		v-model="isOpen"
		:title="isEditing ? 'Edit Proposal' : 'New Proposal'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!formRef?.hasTitle"
		:statuses="proposalStatuses"
		:current-status="currentStatus"
		collection="proposals"
		:item-id="proposal?.id ?? null"
		:detail-route="proposal ? `/proposals/${proposal.id}` : null"
		@submit="triggerSave"
		@delete="handleDelete"
		@status-change="e => currentStatus = e.newStatus"
	>
		<ProposalsProposalForm
			v-if="isOpen"
			:key="proposal?.id || 'new'"
			ref="formRef"
			:proposal="proposal"
			:lead-id="leadId"
			:saving="saving"
			@submit="onFormSave"
		/>
	</FormModal>
</template>

<script setup lang="ts">
import { PROPOSAL_STATUS_LABELS } from '~~/shared/proposals-enhanced';

const props = defineProps<{
	proposal?: any;
	leadId?: number | string | null;
}>();

const emit = defineEmits<{
	created: [proposal: any];
	updated: [proposal: any];
	deleted: [id: string];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.proposal?.id);
const saving = ref(false);
const currentStatus = ref<string>(props.proposal?.proposal_status || 'draft');
const formRef = ref<any>(null);

const toast = useToast();
const { createProposal } = useProposals();
const proposalItems = useDirectusItems('proposals');

const proposalStatuses = Object.entries(PROPOSAL_STATUS_LABELS).map(([id, name]) => ({ id, name }));

watch(isOpen, (open) => {
	if (open) {
		currentStatus.value = props.proposal?.proposal_status || 'draft';
	}
});

function triggerSave() {
	formRef.value?.triggerSubmit?.();
}

async function onFormSave(payload: any) {
	saving.value = true;
	try {
		const fullPayload = {
			...payload,
			proposal_status: currentStatus.value,
			...(payload.lead && { lead: typeof payload.lead === 'string' ? Number(payload.lead) : payload.lead }),
		};

		if (isEditing.value && props.proposal?.id) {
			const updated = await proposalItems.update(props.proposal.id, fullPayload);
			toast.add({ title: 'Proposal updated', color: 'green' });
			emit('updated', updated);
		} else {
			const created = await createProposal(fullPayload);
			toast.add({ title: 'Proposal created', color: 'green' });
			emit('created', created);
		}
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error saving proposal:', err);
		toast.add({ title: 'Failed to save proposal', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.proposal?.id) return;
	if (!confirm(`Are you sure you want to delete ${props.proposal.title || 'this proposal'}? This cannot be undone.`)) return;

	saving.value = true;
	try {
		await proposalItems.remove(props.proposal.id);
		toast.add({ title: 'Proposal deleted', color: 'green' });
		emit('deleted', props.proposal.id);
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error deleting proposal:', err);
		toast.add({ title: 'Failed to delete proposal', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

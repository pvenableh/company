<template>
	<FormModal
		v-model="isOpen"
		:embedded="embedded"
		:title="isEditing ? 'Edit Contract' : 'New Contract'"
		:is-editing="isEditing"
		:saving="saving"
		:submit-disabled="!formRef?.hasTitle"
		:statuses="contractStatuses"
		:current-status="currentStatus"
		collection="contracts"
		:item-id="contract?.id ?? null"
		:detail-route="contract ? `/contracts/${contract.id}` : null"
		@submit="triggerSave"
		@delete="handleDelete"
		@status-change="e => currentStatus = e.newStatus"
	>
		<ContractsContractForm
			v-if="isOpen || embedded"
			:key="contract?.id || 'new'"
			ref="formRef"
			:contract="contract"
			:lead-id="leadId"
			:proposal-id="proposalId"
			:saving="saving"
			@submit="onFormSave"
		/>
	</FormModal>
</template>

<script setup lang="ts">
import { CONTRACT_STATUS_LABELS } from '~~/shared/contracts';

const props = defineProps<{
	contract?: any;
	leadId?: number | string | null;
	proposalId?: string | null;
	// Render inside a stack panel's shell (no own AppSlideOver).
	embedded?: boolean;
}>();

const emit = defineEmits<{
	created: [contract: any];
	updated: [contract: any];
	deleted: [id: string];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.contract?.id);
const saving = ref(false);
const currentStatus = ref<string>(props.contract?.contract_status || 'draft');
const formRef = ref<any>(null);

const toast = useToast();
const route = useRoute();
const { createContract } = useContracts();
const contractItems = useDirectusItems('contracts');
const contractSlide = useAppSlideOver('contract');
const { upload: uploadDirectusFile } = useDirectusFiles();
const { celebrateContract } = useProposalEncouragement();

const contractStatuses = Object.entries(CONTRACT_STATUS_LABELS).map(([id, name]) => ({ id, name }));

watch(isOpen, (open) => {
	if (open) {
		currentStatus.value = props.contract?.contract_status || 'draft';
	}
});

function triggerSave() {
	formRef.value?.triggerSubmit?.();
}

async function onFormSave(payload: any) {
	saving.value = true;
	try {
		const { _logExisting, _file, ...rest } = payload;
		const logExisting = !!_logExisting;

		const fullPayload: Record<string, any> = {
			...rest,
			contract_status: logExisting ? rest.contract_status || 'signed' : currentStatus.value,
			...(rest.lead && { lead: typeof rest.lead === 'string' ? Number(rest.lead) : rest.lead }),
		};

		if (isEditing.value && props.contract?.id) {
			const updated = await contractItems.update(props.contract.id, fullPayload);
			toast.add({ title: 'Contract updated', color: 'green' });
			emit('updated', updated);
		} else {
			const created = await createContract(fullPayload);

			// Attach the signed/executed PDF (log-existing path).
			if (logExisting && _file && created?.id) {
				try {
					const res: any = await uploadDirectusFile(_file, { title: _file.name });
					const fileId = (res?.data || res)?.id;
					if (fileId) await contractItems.update(created.id, { file: fileId } as any);
				} catch (fileErr: any) {
					console.error('Contract PDF upload failed:', fileErr);
					toast.add({ title: 'Contract saved, but the PDF failed to attach', description: fileErr?.data?.message || fileErr?.message, color: 'amber' });
				}
			}

			emit('created', created);
			isOpen.value = false;

			// Logged (historical) contracts skip the composer — open the detail view.
			if (logExisting) {
				celebrateContract({ status: fullPayload.contract_status });
				if (created?.id) {
					if (route.path.startsWith('/apps/')) {
						await contractSlide.open(String(created.id));
					} else {
						await navigateTo(`/contracts/${created.id}`);
					}
				}
				return;
			}

			toast.add({ title: 'Contract created — opening composer', color: 'green' });
			if (created?.id) {
				if (route.path.startsWith('/apps/')) {
					await contractSlide.open(String(created.id), 'edit');
				} else {
					await navigateTo(`/contracts/${created.id}?edit=1`);
				}
				return;
			}
		}
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error saving contract:', err);
		toast.add({ title: 'Failed to save contract', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.contract?.id) return;
	if (!confirm(`Are you sure you want to delete ${props.contract.title || 'this contract'}? This cannot be undone.`)) return;

	saving.value = true;
	try {
		await contractItems.remove(props.contract.id);
		toast.add({ title: 'Contract deleted', color: 'green' });
		emit('deleted', props.contract.id);
		isOpen.value = false;
	} catch (err: any) {
		console.error('Error deleting contract:', err);
		toast.add({ title: 'Failed to delete contract', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

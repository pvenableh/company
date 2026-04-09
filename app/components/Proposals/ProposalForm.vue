<template>
	<form @submit.prevent="handleSubmit" class="space-y-4">
		<div>
			<label class="block text-xs font-medium t-text-secondary mb-1">Title *</label>
			<UInput v-model="form.title" placeholder="Proposal title" required />
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div>
				<label class="block text-xs font-medium t-text-secondary mb-1">Total Value</label>
				<UInput v-model="form.total_value" type="number" step="0.01" placeholder="0.00" icon="i-heroicons-currency-dollar" />
			</div>
			<div>
				<label class="block text-xs font-medium t-text-secondary mb-1">Valid Until</label>
				<UInput v-model="form.valid_until" type="date" />
			</div>
		</div>

		<div>
			<label class="block text-xs font-medium t-text-secondary mb-1">Notes</label>
			<UTextarea v-model="form.notes" :rows="4" placeholder="Proposal details, scope, deliverables..." />
		</div>

		<div class="flex justify-end gap-2 pt-2">
			<UButton variant="ghost" @click="$emit('cancel')">Cancel</UButton>
			<UButton type="submit" :loading="saving">
				{{ proposal ? 'Update' : 'Create' }} Proposal
			</UButton>
		</div>
	</form>
</template>

<script setup lang="ts">
const props = defineProps<{
	proposal?: any;
	leadId?: number | string;
	saving?: boolean;
}>();

const emit = defineEmits<{
	submit: [data: any];
	cancel: [];
}>();

const form = reactive({
	title: props.proposal?.title || '',
	total_value: props.proposal?.total_value || '',
	valid_until: props.proposal?.valid_until || '',
	notes: props.proposal?.notes || '',
	organization: props.proposal?.organization?.id || props.proposal?.organization || null,
	contact: props.proposal?.contact?.id || props.proposal?.contact || null,
	lead: props.proposal?.lead?.id || props.proposal?.lead || props.leadId || null,
});

function handleSubmit() {
	emit('submit', { ...form });
}

// Update form when proposal prop changes
watch(() => props.proposal, (val) => {
	if (val) {
		form.title = val.title || '';
		form.total_value = val.total_value || '';
		form.valid_until = val.valid_until || '';
		form.notes = val.notes || '';
		form.organization = val.organization?.id || val.organization || null;
		form.contact = val.contact?.id || val.contact || null;
		form.lead = val.lead?.id || val.lead || null;
	}
}, { immediate: true });
</script>

<template>
	<form @submit.prevent="handleSubmit" class="space-y-4">
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Title *</label>
			<UInput v-model="form.title" placeholder="Contract title" required />
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Total Value</label>
				<UInput v-model="form.total_value" type="number" step="0.01" placeholder="0.00" icon="i-heroicons-currency-dollar" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Effective Date</label>
				<UInput v-model="form.effective_date" type="date" />
			</div>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Date Sent</label>
				<UInput v-model="form.date_sent" type="date" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Valid Until</label>
				<UInput v-model="form.valid_until" type="date" />
			</div>
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Internal Notes</label>
			<UTextarea v-model="form.notes" :rows="3" placeholder="Notes (not rendered to the client)" />
		</div>
	</form>
</template>

<script setup lang="ts">
const props = defineProps<{
	contract?: any;
	leadId?: number | string | null;
	proposalId?: string | null;
	saving?: boolean;
}>();

const emit = defineEmits<{
	submit: [data: any];
}>();

const form = reactive({
	title: props.contract?.title || '',
	total_value: props.contract?.total_value || '',
	date_sent: props.contract?.date_sent || '',
	valid_until: props.contract?.valid_until || '',
	effective_date: props.contract?.effective_date || '',
	notes: props.contract?.notes || '',
	contact: props.contract?.contact?.id || props.contract?.contact || null,
	lead: props.contract?.lead?.id || props.contract?.lead || props.leadId || null,
	proposal: props.contract?.proposal?.id || props.contract?.proposal || props.proposalId || null,
});

function handleSubmit() {
	emit('submit', {
		...form,
		total_value: form.total_value === '' || form.total_value == null ? null : Number(form.total_value),
		date_sent: form.date_sent || null,
		valid_until: form.valid_until || null,
		effective_date: form.effective_date || null,
	});
}

defineExpose({
	triggerSubmit: handleSubmit,
	hasTitle: computed(() => !!form.title?.trim()),
});
</script>

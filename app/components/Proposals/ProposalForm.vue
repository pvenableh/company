<template>
	<form @submit.prevent="handleSubmit" class="space-y-4">
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Title *</label>
			<UInput v-model="form.title" placeholder="Proposal title" required />
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Total Value</label>
				<UInput v-model="form.total_value" type="number" step="0.01" placeholder="0.00" icon="i-heroicons-currency-dollar" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Valid Until</label>
				<UInput v-model="form.valid_until" type="date" />
			</div>
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Notes</label>
			<UTextarea v-model="form.notes" :rows="4" placeholder="Proposal details, scope, deliverables..." />
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
	emit('submit', {
		...form,
		// Coerce empty strings to null for numeric/date columns — Postgres rejects ""
		total_value: form.total_value === '' || form.total_value == null ? null : Number(form.total_value),
		valid_until: form.valid_until || null,
	});
}

defineExpose({
	triggerSubmit: handleSubmit,
	hasTitle: computed(() => !!form.title?.trim()),
});
</script>

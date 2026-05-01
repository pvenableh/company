<template>
	<form @submit.prevent="handleSubmit" class="space-y-4">
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Name *</label>
			<UInput v-model="form.name" placeholder="e.g. Brand Identity Package" required />
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Category</label>
				<select
					v-model="form.category"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option value="branding">Branding</option>
					<option value="web">Web</option>
					<option value="marketing">Marketing</option>
					<option value="retainer">Retainer</option>
					<option value="other">Other</option>
				</select>
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Status</label>
				<select
					v-model="form.status"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option value="published">Published</option>
					<option value="draft">Draft</option>
					<option value="archived">Archived</option>
				</select>
			</div>
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">One-line description</label>
			<UInput v-model="form.description" placeholder="Shown in the picker" />
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Default total</label>
				<UInput v-model="form.default_total" type="number" step="0.01" placeholder="0.00" icon="i-heroicons-currency-dollar" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Duration (days)</label>
				<UInput v-model="form.default_duration_days" type="number" placeholder="30" />
			</div>
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Default scope</label>
			<UTextarea
				v-model="form.scope_template"
				:rows="8"
				placeholder="Describe the deliverables. The AI will adapt this to each lead's industry and brief when drafting."
			/>
			<p class="text-xs t-text-muted">Plain text or markdown. The AI uses this as a starting point — it tailors phrasing to the lead.</p>
		</div>
	</form>
</template>

<script setup lang="ts">
import type { ServiceTemplate } from '~/composables/useServiceTemplates';

const props = defineProps<{
	template?: Partial<ServiceTemplate> | null;
	saving?: boolean;
}>();

const emit = defineEmits<{
	submit: [data: any];
}>();

const form = reactive({
	name: props.template?.name || '',
	category: props.template?.category || 'other',
	status: props.template?.status || 'published',
	description: props.template?.description || '',
	scope_template: props.template?.scope_template || '',
	default_total: props.template?.default_total ?? '',
	default_duration_days: props.template?.default_duration_days ?? '',
});

function handleSubmit() {
	emit('submit', {
		...form,
		default_total: form.default_total === '' || form.default_total == null ? null : Number(form.default_total),
		default_duration_days: form.default_duration_days === '' || form.default_duration_days == null ? null : Number(form.default_duration_days),
	});
}

defineExpose({
	triggerSubmit: handleSubmit,
	hasName: computed(() => !!form.name?.trim()),
});
</script>

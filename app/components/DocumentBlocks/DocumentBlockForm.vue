<template>
	<form @submit.prevent="handleSubmit" class="space-y-4">
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Name *</label>
			<UInput v-model="form.name" placeholder='e.g. "Studio bio", "Standard NDA terms"' required />
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Category</label>
				<select
					v-model="form.category"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option value="bio">Bio / About</option>
					<option value="references">References</option>
					<option value="case_study">Case Study</option>
					<option value="deliverables">Scope / Deliverables</option>
					<option value="pricing">Pricing</option>
					<option value="timeline">Timeline</option>
					<option value="terms">Terms</option>
					<option value="nda">NDA</option>
					<option value="cover">Cover</option>
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
			<label class="t-label text-muted-foreground">Applies to</label>
			<div class="flex gap-4">
				<label class="inline-flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						:checked="form.applies_to.includes('proposals')"
						@change="toggleApplies('proposals')"
					/>
					Proposals
				</label>
				<label class="inline-flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						:checked="form.applies_to.includes('contracts')"
						@change="toggleApplies('contracts')"
					/>
					Contracts
				</label>
			</div>
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">One-line description</label>
			<UInput v-model="form.description" placeholder="Shown in the picker" />
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Content *</label>
			<UTextarea
				v-model="form.content"
				:rows="10"
				placeholder="The block content. Markdown supported. The user can override per-document without changing this."
			/>
			<p class="text-xs t-text-muted">Markdown. Per-document overrides won't mutate this — your library stays clean.</p>
		</div>
	</form>
</template>

<script setup lang="ts">
import type { DocumentBlock, BlockAppliesTo } from '~/composables/useDocumentBlocks';

const props = defineProps<{
	block?: Partial<DocumentBlock> | null;
	saving?: boolean;
}>();

const emit = defineEmits<{
	submit: [data: any];
}>();

const form = reactive({
	name: props.block?.name || '',
	category: props.block?.category || 'other',
	status: props.block?.status || 'published',
	description: props.block?.description || '',
	content: props.block?.content || '',
	applies_to: (props.block?.applies_to || ['proposals', 'contracts']) as BlockAppliesTo[],
});

function toggleApplies(target: BlockAppliesTo) {
	const idx = form.applies_to.indexOf(target);
	if (idx >= 0) form.applies_to.splice(idx, 1);
	else form.applies_to.push(target);
}

function handleSubmit() {
	emit('submit', { ...form });
}

defineExpose({
	triggerSubmit: handleSubmit,
	hasName: computed(() => !!form.name?.trim()),
});
</script>

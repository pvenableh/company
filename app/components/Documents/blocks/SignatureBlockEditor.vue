<script setup lang="ts">
/**
 * signature_block — one or more sign-off entries (role, name, title, company)
 * each rendering as a ruled signature line with a date. Contracts usually use
 * two columns (Client / Provider); proposals often a single acceptance line.
 */
import type { SignatureBlockPayload, Signatory } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: SignatureBlockPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: SignatureBlockPayload];
}>();

function uid(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const payload = computed<SignatureBlockPayload>(() => ({
	intro: props.modelValue?.intro ?? '',
	columns: props.modelValue?.columns || 2,
	signatories: Array.isArray(props.modelValue?.signatories) ? props.modelValue.signatories : [],
}));

function patch(p: Partial<SignatureBlockPayload>) {
	emit('update:modelValue', { ...payload.value, ...p });
}
function setSignatories(signatories: Signatory[]) {
	patch({ signatories });
}
function addSignatory() {
	setSignatories([...payload.value.signatories, { id: uid(), role_label: '', name: '', title: '', company: '', show_date: true, date_label: 'Date' }]);
}
function removeSignatory(i: number) {
	setSignatories(payload.value.signatories.filter((_, idx) => idx !== i));
}
function updateSignatory(i: number, p: Partial<Signatory>) {
	setSignatories(payload.value.signatories.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
}

const COLUMN_OPTIONS = [1, 2];
</script>

<template>
	<div class="space-y-2">
		<textarea
			:value="payload.intro || ''"
			placeholder="Intro (optional) — e.g. Agreed and accepted by the parties below."
			rows="2"
			class="w-full bg-transparent border-0 outline-none resize-y text-sm leading-relaxed"
			@input="patch({ intro: ($event.target as HTMLTextAreaElement).value })"
		/>

		<div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
			<span>Columns</span>
			<div class="flex gap-1">
				<button
					v-for="c in COLUMN_OPTIONS"
					:key="c"
					class="px-2 py-0.5 rounded border"
					:class="(payload.columns || 2) === c ? 'border-primary text-primary bg-primary/5' : 'border-border'"
					@click="patch({ columns: c as SignatureBlockPayload['columns'] })"
				>
					{{ c }}
				</button>
			</div>
		</div>

		<div v-for="(sig, i) in payload.signatories" :key="sig.id" class="rounded-lg border border-border p-2 space-y-1.5">
			<div class="flex items-center gap-2">
				<input
					:value="sig.role_label || ''"
					placeholder="Role — e.g. Client"
					class="flex-1 bg-transparent border-0 outline-none text-xs uppercase tracking-wider font-semibold text-muted-foreground"
					@input="updateSignatory(i, { role_label: ($event.target as HTMLInputElement).value })"
				/>
				<button class="p-1 rounded hover:bg-destructive/10 text-destructive" title="Remove" @click="removeSignatory(i)">
					<EIcon name="lucide:trash-2" class="w-3.5 h-3.5" />
				</button>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<input
					:value="sig.name || ''"
					placeholder="Name"
					class="bg-transparent border-b border-border outline-none text-sm py-0.5"
					@input="updateSignatory(i, { name: ($event.target as HTMLInputElement).value })"
				/>
				<input
					:value="sig.title || ''"
					placeholder="Title"
					class="bg-transparent border-b border-border outline-none text-sm py-0.5"
					@input="updateSignatory(i, { title: ($event.target as HTMLInputElement).value })"
				/>
				<input
					:value="sig.company || ''"
					placeholder="Company (optional)"
					class="bg-transparent border-b border-border outline-none text-sm py-0.5"
					@input="updateSignatory(i, { company: ($event.target as HTMLInputElement).value })"
				/>
				<label class="text-[11px] inline-flex items-center gap-1 text-muted-foreground self-end">
					<input type="checkbox" :checked="sig.show_date !== false" @change="updateSignatory(i, { show_date: ($event.target as HTMLInputElement).checked })" />
					Show date line
				</label>
			</div>
		</div>

		<button
			class="w-full rounded-lg border-2 border-dashed border-border p-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
			@click="addSignatory"
		>
			<EIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add signatory
		</button>
	</div>
</template>

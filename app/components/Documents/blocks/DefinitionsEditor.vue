<script setup lang="ts">
/**
 * definitions — a term / definition list. Common in contracts ("Defined
 * Terms") and glossary-style proposal sections.
 */
import type { DefinitionsPayload, DefinitionItem } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: DefinitionsPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: DefinitionsPayload];
}>();

function uid(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `def_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const payload = computed<DefinitionsPayload>(() => ({
	heading: props.modelValue?.heading ?? '',
	terms: Array.isArray(props.modelValue?.terms) ? props.modelValue.terms : [],
}));

function patch(p: Partial<DefinitionsPayload>) {
	emit('update:modelValue', { ...payload.value, ...p });
}
function setTerms(terms: DefinitionItem[]) {
	patch({ terms });
}
function addTerm() {
	setTerms([...payload.value.terms, { id: uid(), term: '', definition_markdown: '' }]);
}
function removeTerm(i: number) {
	setTerms(payload.value.terms.filter((_, idx) => idx !== i));
}
function updateTerm(i: number, p: Partial<DefinitionItem>) {
	setTerms(payload.value.terms.map((t, idx) => (idx === i ? { ...t, ...p } : t)));
}
</script>

<template>
	<div class="space-y-2">
		<input
			:value="payload.heading || ''"
			placeholder="Heading (optional) — e.g. Definitions"
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm font-semibold"
			@input="patch({ heading: ($event.target as HTMLInputElement).value })"
		/>

		<div v-for="(term, i) in payload.terms" :key="term.id" class="flex items-start gap-2 group/def">
			<input
				:value="term.term"
				placeholder="Term"
				class="w-1/3 shrink-0 bg-transparent border-b border-border outline-none text-sm font-semibold py-1"
				@input="updateTerm(i, { term: ($event.target as HTMLInputElement).value })"
			/>
			<textarea
				:value="term.definition_markdown"
				placeholder="Definition (markdown supported)"
				rows="2"
				class="flex-1 bg-transparent border-0 outline-none resize-y text-sm leading-relaxed"
				@input="updateTerm(i, { definition_markdown: ($event.target as HTMLTextAreaElement).value })"
			/>
			<button class="p-0.5 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover/def:opacity-100 mt-1" @click="removeTerm(i)">
				<EIcon name="lucide:x" class="w-3.5 h-3.5" />
			</button>
		</div>

		<button class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" @click="addTerm">
			<EIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add term
		</button>
	</div>
</template>

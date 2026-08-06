<script setup lang="ts">
/**
 * footnotes — a small numbered/labelled list of notes. Mirrors the asterisk
 * notes at the bottom of the Hue HUE-605 phases pages.
 */
import type { FootnotesPayload, FootnoteItem } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: FootnotesPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: FootnotesPayload];
}>();

function uid(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const payload = computed<FootnotesPayload>(() => ({
	heading: props.modelValue?.heading ?? '',
	notes: Array.isArray(props.modelValue?.notes) ? props.modelValue.notes : [],
}));

function patch(p: Partial<FootnotesPayload>) {
	emit('update:modelValue', { ...payload.value, ...p });
}
function setNotes(notes: FootnoteItem[]) {
	patch({ notes });
}
function addNote() {
	setNotes([...payload.value.notes, { id: uid(), label: '', text_markdown: '' }]);
}
function removeNote(i: number) {
	setNotes(payload.value.notes.filter((_, idx) => idx !== i));
}
function updateNote(i: number, p: Partial<FootnoteItem>) {
	setNotes(payload.value.notes.map((n, idx) => (idx === i ? { ...n, ...p } : n)));
}
</script>

<template>
	<div class="space-y-2">
		<input
			:value="payload.heading || ''"
			placeholder="Heading (optional) — e.g. Notes"
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm font-semibold"
			@input="patch({ heading: ($event.target as HTMLInputElement).value })"
		/>

		<div v-for="(note, i) in payload.notes" :key="note.id" class="flex items-start gap-1.5 group/note">
			<input
				:value="note.label || ''"
				placeholder="*"
				class="w-8 shrink-0 bg-transparent border-b border-border outline-none text-xs text-center py-1"
				@input="updateNote(i, { label: ($event.target as HTMLInputElement).value })"
			/>
			<textarea
				:value="note.text_markdown"
				placeholder="Note text (markdown supported)"
				rows="2"
				class="flex-1 bg-transparent border-0 outline-none resize-y text-xs leading-relaxed"
				@input="updateNote(i, { text_markdown: ($event.target as HTMLTextAreaElement).value })"
			/>
			<button class="p-0.5 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover/note:opacity-100 mt-1" @click="removeNote(i)">
				<EIcon name="lucide:x" class="w-3.5 h-3.5" />
			</button>
		</div>

		<button
			class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
			@click="addNote"
		>
			<EIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add note
		</button>
	</div>
</template>

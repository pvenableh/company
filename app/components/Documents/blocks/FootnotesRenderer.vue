<script setup lang="ts">
/**
 * footnotes renderer — a small, muted, top-ruled list of notes. Each note's
 * marker defaults to a 1-based index but can be overridden (e.g. *, **, ***)
 * to match the Hue HUE-605 asterisk convention.
 */
import { marked } from 'marked';
import type { FootnotesPayload, FootnoteItem } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: FootnotesPayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

function inline(s: string | null | undefined): string {
	return s ? (marked.parseInline(s) as string) : '';
}

const notes = computed<FootnoteItem[]>(() => (Array.isArray(props.payload?.notes) ? props.payload.notes : []));

function marker(note: FootnoteItem, idx: number): string {
	return note.label?.trim() || String(idx + 1);
}
</script>

<template>
	<div class="footnotes">
		<h2 v-if="payload?.heading" class="footnotes__heading">{{ payload.heading }}</h2>
		<dl class="footnotes__list">
			<div v-for="(note, i) in notes" :key="note.id" class="footnotes__item">
				<dt class="footnotes__marker">{{ marker(note, i) }}</dt>
				<dd class="footnotes__text" v-html="inline(note.text_markdown)" />
			</div>
		</dl>
	</div>
</template>

<style scoped>
.footnotes {
	margin-top: 1rem;
	padding-top: 0.75rem;
	border-top: 1px solid rgba(0, 0, 0, 0.1);
}
.footnotes__heading {
	font-size: 0.75rem;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	font-weight: 600;
	opacity: 0.6;
	margin-bottom: 0.5rem;
}
.footnotes__list {
	margin: 0;
	font-size: 0.72rem;
	line-height: 1.55;
	font-style: italic;
	opacity: 0.7;
}
.footnotes__item {
	display: flex;
	gap: 0.4rem;
	margin: 0.25rem 0;
}
.footnotes__marker {
	flex-shrink: 0;
	font-style: normal;
	min-width: 1.25rem;
}
.footnotes__text { margin: 0; }

:global(.dark .footnotes) { border-top-color: rgba(255, 255, 255, 0.12); }
</style>

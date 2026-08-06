<script setup lang="ts">
/**
 * definitions renderer — a term / definition list. Terms take the document
 * accent; definitions render markdown inline beneath.
 */
import { marked } from 'marked';
import type { DefinitionsPayload, DefinitionItem } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: DefinitionsPayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

function inline(s: string | null | undefined): string {
	return s ? (marked.parseInline(s) as string) : '';
}

const terms = computed<DefinitionItem[]>(() => (Array.isArray(props.payload?.terms) ? props.payload.terms : []));
</script>

<template>
	<div class="definitions">
		<h2 v-if="payload?.heading" class="definitions__heading">{{ payload.heading }}</h2>
		<dl class="definitions__list">
			<div v-for="term in terms" :key="term.id" class="definitions__item">
				<dt class="definitions__term">{{ term.term }}</dt>
				<dd class="definitions__def" v-html="inline(term.definition_markdown)" />
			</div>
		</dl>
	</div>
</template>

<style scoped>
.definitions__heading {
	font-size: 1.3rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin-bottom: 1rem;
}
.definitions__list {
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 0.85rem;
}
.definitions__item {
	break-inside: avoid;
}
.definitions__term {
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	font-size: 0.92rem;
	margin-bottom: 0.15rem;
}
.definitions__def {
	margin: 0;
	font-size: 0.9rem;
	line-height: 1.6;
}

@media print {
	.definitions__item { break-inside: avoid; }
}
</style>

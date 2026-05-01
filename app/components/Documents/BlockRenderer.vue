<script setup lang="ts">
import { marked } from 'marked';
import type { DocumentBlockEntry } from '~/composables/useDocumentBlocks';

const props = defineProps<{
	blocks: DocumentBlockEntry[] | null | undefined;
}>();

marked.setOptions({ gfm: true, breaks: true });

const rendered = computed(() => {
	const list = props.blocks || [];
	return list.map((entry) => ({
		heading: entry.heading || '',
		html: marked.parse(entry.content || '') as string,
		page_break_after: !!entry.page_break_after,
	}));
});
</script>

<template>
	<div class="doc__blocks">
		<section
			v-for="(block, idx) in rendered"
			:key="idx"
			class="doc__block"
			:class="{ 'doc__block--page-break': block.page_break_after }"
		>
			<h2 v-if="block.heading" class="doc__block-heading">{{ block.heading }}</h2>
			<div class="prose prose-sm dark:prose-invert max-w-none" v-html="block.html" />
		</section>
	</div>
</template>

<style scoped>
.doc__block + .doc__block {
	margin-top: 2rem;
}

.doc__block-heading {
	font-size: 0.95rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	margin-bottom: 0.5rem;
}

.doc__block--page-break {
	page-break-after: always;
	break-after: page;
}

@media print {
	.doc__block--page-break {
		page-break-after: always;
		break-after: page;
	}
}
</style>

<script setup lang="ts">
import { marked } from 'marked';
import type { DocumentBlockEntry } from '~/composables/useDocumentBlocks';

interface CoverContext {
	logoUrl?: string | null;
	title?: string | null;
	recipient?: string | null;
	dateSent?: string | null;
	dateLabel?: string | null;
	expiresAt?: string | null;
	expiresLabel?: string | null;
}

const props = defineProps<{
	blocks: DocumentBlockEntry[] | null | undefined;
	cover?: CoverContext | null;
}>();

marked.setOptions({ gfm: true, breaks: true });

function fmtDate(d: string | null | undefined) {
	if (!d) return '';
	const date = new Date(d);
	if (isNaN(date.getTime())) return d;
	return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Detect a cover block: the FIRST entry with `page_break_after: true`. No
// schema flag — heuristic only. If detected, we render that block with a
// special full-page layout that uses the parent's cover context (logo,
// title, recipient, dates) instead of the standard heading + markdown.
const hasCover = computed(() => {
	const list = props.blocks || [];
	return list.length > 0 && !!list[0].page_break_after;
});

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
		<!-- Cover page (first block, when page_break_after is set) -->
		<section
			v-if="hasCover"
			class="doc__cover doc__block--page-break"
		>
			<div class="doc__cover-inner">
				<img
					v-if="cover?.logoUrl"
					:src="cover.logoUrl"
					:alt="cover.title || 'Logo'"
					class="doc__cover-logo"
				/>
				<h1 v-if="cover?.title" class="doc__cover-title">{{ cover.title }}</h1>
				<p v-if="cover?.recipient" class="doc__cover-recipient">
					Prepared for {{ cover.recipient }}
				</p>
				<!-- Optional cover-block content (e.g. tagline, intro paragraph) -->
				<div
					v-if="rendered[0]?.html"
					class="doc__cover-body prose prose-sm dark:prose-invert max-w-none"
					v-html="rendered[0].html"
				/>
			</div>
			<div class="doc__cover-meta">
				<p v-if="cover?.dateSent">
					<span class="opacity-50">{{ cover.dateLabel || 'Sent' }}:</span> {{ fmtDate(cover.dateSent) }}
				</p>
				<p v-if="cover?.expiresAt">
					<span class="opacity-50">{{ cover.expiresLabel || 'Valid until' }}:</span> {{ fmtDate(cover.expiresAt) }}
				</p>
			</div>
		</section>

		<!-- Body blocks (skip first if it was used as the cover) -->
		<section
			v-for="(block, idx) in rendered"
			v-show="!(hasCover && idx === 0)"
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

.doc__cover {
	min-height: 80vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: space-between;
	text-align: center;
	padding: 4rem 1rem 2rem;
	margin: -3rem -1.5rem 2rem;
	border-bottom: 1px dashed rgba(0, 0, 0, 0.08);
}

.doc__cover-inner {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1.25rem;
	flex: 1;
	justify-content: center;
}

.doc__cover-logo {
	height: 4.5rem;
	width: auto;
	object-fit: contain;
}

.doc__cover-title {
	font-size: 2rem;
	font-weight: 700;
	letter-spacing: -0.01em;
	line-height: 1.2;
	max-width: 32rem;
}

.doc__cover-recipient {
	font-size: 0.95rem;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	opacity: 0.7;
}

.doc__cover-body {
	margin-top: 1rem;
	max-width: 28rem;
}

.doc__cover-meta {
	font-size: 0.7rem;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	opacity: 0.7;
	display: flex;
	gap: 1.5rem;
	flex-wrap: wrap;
	justify-content: center;
}

:global(.dark) .doc__cover {
	border-bottom-color: rgba(255, 255, 255, 0.08);
}

@media print {
	.doc__block--page-break {
		page-break-after: always;
		break-after: page;
	}
	.doc__cover {
		min-height: 95vh;
	}
}
</style>

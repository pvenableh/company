<script setup lang="ts">
/**
 * numbered_clauses renderer — auto-numbered clauses with 1-level nesting.
 * Numbering is derived from position per the chosen style:
 *   decimal → 1, 1.1        legal → 1., 1.1.        article → Article 1, (a)
 */
import { marked } from 'marked';
import type { NumberedClausesPayload, ClauseNode } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: NumberedClausesPayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

function block(s: string | null | undefined): string {
	return s ? (marked.parse(s) as string) : '';
}

const clauses = computed<ClauseNode[]>(() => (Array.isArray(props.payload?.clauses) ? props.payload.clauses : []));
const style = computed(() => props.payload?.numbering_style || 'decimal');

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function topLabel(i: number): string {
	if (style.value === 'article') return `Article ${i + 1}`;
	if (style.value === 'legal') return `${i + 1}.`;
	return `${i + 1}`;
}
function childLabel(i: number, ci: number): string {
	if (style.value === 'article') return `(${LETTERS[ci] || ci + 1})`;
	if (style.value === 'legal') return `${i + 1}.${ci + 1}.`;
	return `${i + 1}.${ci + 1}`;
}
</script>

<template>
	<div class="clauses">
		<h2 v-if="payload?.heading" class="clauses__heading">{{ payload.heading }}</h2>
		<ol class="clauses__list">
			<li v-for="(clause, i) in clauses" :key="clause.id" class="clauses__clause">
				<div class="clauses__row">
					<span class="clauses__label">{{ topLabel(i) }}</span>
					<div class="clauses__content">
						<span v-if="clause.title" class="clauses__title">{{ clause.title }}</span>
						<div v-if="clause.body_markdown" class="clauses__body prose prose-sm max-w-none" v-html="block(clause.body_markdown)" />
					</div>
				</div>

				<ol v-if="clause.children?.length" class="clauses__sublist">
					<li v-for="(child, ci) in clause.children" :key="child.id" class="clauses__clause">
						<div class="clauses__row">
							<span class="clauses__label clauses__label--child">{{ childLabel(i, ci) }}</span>
							<div class="clauses__content">
								<span v-if="child.title" class="clauses__title clauses__title--child">{{ child.title }}</span>
								<div v-if="child.body_markdown" class="clauses__body prose prose-sm max-w-none" v-html="block(child.body_markdown)" />
							</div>
						</div>
					</li>
				</ol>
			</li>
		</ol>
	</div>
</template>

<style scoped>
.clauses__heading {
	font-size: 1.3rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin-bottom: 1rem;
}
.clauses__list, .clauses__sublist {
	list-style: none;
	margin: 0;
	padding: 0;
}
.clauses__clause {
	break-inside: avoid;
}
.clauses__list > .clauses__clause + .clauses__clause {
	margin-top: 1rem;
}
.clauses__row {
	display: flex;
	gap: 0.6rem;
	align-items: baseline;
}
.clauses__label {
	flex-shrink: 0;
	min-width: 2.75rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	font-size: 0.9rem;
}
.clauses__label--child {
	min-width: 2.75rem;
	font-weight: 600;
	opacity: 0.85;
}
.clauses__content { flex: 1; }
.clauses__title {
	font-weight: 700;
	display: block;
	margin-bottom: 0.15rem;
}
.clauses__title--child { font-weight: 600; }
.clauses__body {
	font-size: 0.9rem;
	line-height: 1.65;
}
.clauses__sublist {
	margin-top: 0.6rem;
	margin-left: 3.35rem;
	display: flex;
	flex-direction: column;
	gap: 0.6rem;
}

@media print {
	.clauses__clause { break-inside: avoid; }
}
</style>

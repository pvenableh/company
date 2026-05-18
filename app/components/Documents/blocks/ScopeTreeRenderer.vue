<script setup lang="ts">
/**
 * scope_tree renderer.
 *
 * Matches the Hue HUE-605 PDF p7-8 shape: numbered phase headings, intro
 * paragraph, bulleted items, optional closing note. Sub-phases render
 * indented under their parent with a sub-accent.
 *
 * Numbering style is a payload property — proposals + contracts in the
 * same org often want different conventions ("Phase one" vs "1.").
 */
import { marked } from 'marked';
import type { ScopeTreePayload, ScopeTreeNode } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: ScopeTreePayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

const WORD_NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function phaseLabel(idx: number, style: string): string {
	const n = idx + 1;
	if (style === 'phase_number') return `Phase ${n}`;
	if (style === 'decimal') return `${n}.`;
	if (style === 'none') return '';
	const word = WORD_NUMBERS[idx] || String(n);
	return `Phase ${word}`;
}

function inlineMarkdown(s: string | null | undefined): string {
	if (!s) return '';
	return marked.parseInline(s) as string;
}
function blockMarkdown(s: string | null | undefined): string {
	if (!s) return '';
	return marked.parse(s) as string;
}

const phases = computed<ScopeTreeNode[]>(() => Array.isArray(props.payload?.phases) ? props.payload.phases : []);
const numberingStyle = computed(() => props.payload?.numbering_style || 'phase_word');
</script>

<template>
	<div class="scope-tree">
		<section
			v-for="(phase, pIdx) in phases"
			:key="phase.id"
			class="scope-phase"
		>
			<h3 class="scope-phase__heading">
				<span v-if="phaseLabel(pIdx, numberingStyle)" class="scope-phase__label">
					{{ phaseLabel(pIdx, numberingStyle) }}<span v-if="phase.heading">: </span>
				</span>
				<span v-if="phase.heading" v-html="inlineMarkdown(phase.heading)" />
			</h3>

			<div v-if="phase.summary" class="scope-phase__summary prose prose-sm dark:prose-invert max-w-none" v-html="blockMarkdown(phase.summary)" />

			<ul v-if="(phase.bullets || []).length > 0" class="scope-phase__bullets">
				<li v-for="(b, bIdx) in phase.bullets" :key="bIdx" v-html="inlineMarkdown(b)" />
			</ul>

			<div v-if="phase.note" class="scope-phase__note prose prose-sm dark:prose-invert max-w-none" v-html="blockMarkdown(phase.note)" />

			<dl v-if="phase.show_hours || phase.show_fee || (phase.show_deliverables && phase.deliverables?.length)" class="scope-phase__estimate">
				<template v-if="phase.show_hours && phase.hours != null">
					<dt>Hours</dt>
					<dd>{{ phase.hours }}</dd>
				</template>
				<template v-if="phase.show_fee && phase.fee != null">
					<dt>Fee</dt>
					<dd>${{ phase.fee.toLocaleString() }}</dd>
				</template>
				<template v-if="phase.show_deliverables && phase.deliverables?.length">
					<dt>Deliverables</dt>
					<dd>
						<ul class="scope-phase__deliverables">
							<li v-for="(d, dIdx) in phase.deliverables" :key="dIdx" v-html="inlineMarkdown(d)" />
						</ul>
					</dd>
				</template>
			</dl>

			<!-- Sub-phases -->
			<div v-if="(phase.children || []).length > 0" class="scope-phase__children">
				<section
					v-for="(child, cIdx) in phase.children"
					:key="child.id"
					class="scope-phase scope-phase--child"
				>
					<h4 class="scope-phase__heading scope-phase__heading--child">
						<span class="scope-phase__label scope-phase__label--child">Key feature: </span>
						<span v-if="child.heading" v-html="inlineMarkdown(child.heading)" />
					</h4>
					<div v-if="child.summary" class="scope-phase__summary prose prose-sm dark:prose-invert max-w-none" v-html="blockMarkdown(child.summary)" />
					<ul v-if="(child.bullets || []).length > 0" class="scope-phase__bullets">
						<li v-for="(b, bIdx) in child.bullets" :key="bIdx" v-html="inlineMarkdown(b)" />
					</ul>
					<div v-if="child.note" class="scope-phase__note prose prose-sm dark:prose-invert max-w-none" v-html="blockMarkdown(child.note)" />
				</section>
			</div>
		</section>
	</div>
</template>

<style scoped>
.scope-tree {
	display: flex;
	flex-direction: column;
	gap: 2rem;
}

.scope-phase__heading {
	font-size: 1.05rem;
	font-weight: 700;
	letter-spacing: -0.01em;
	margin-bottom: 0.5rem;
	color: var(--doc-accent, hsl(var(--primary)));
}
.scope-phase__heading--child {
	font-size: 0.95rem;
	font-weight: 600;
	color: var(--doc-accent-soft, hsl(var(--primary) / 0.75));
}

.scope-phase__label {
	text-transform: uppercase;
	letter-spacing: 0.06em;
	font-size: 0.75em;
	font-weight: 600;
}
.scope-phase__label--child {
	text-transform: none;
	letter-spacing: 0;
	font-size: 0.85em;
	opacity: 0.75;
}

.scope-phase__summary {
	margin-bottom: 0.5rem;
}

.scope-phase__bullets {
	margin: 0.25rem 0 0.5rem 0;
	padding-left: 1.1rem;
	list-style: disc;
	font-size: 0.9rem;
	line-height: 1.6;
}

.scope-phase__note {
	margin-top: 0.75rem;
	opacity: 0.75;
	font-size: 0.85rem;
	font-style: italic;
}

.scope-phase__estimate {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 0.25rem 1rem;
	margin-top: 0.75rem;
	padding-top: 0.75rem;
	border-top: 1px dashed currentColor;
	border-color: rgba(0, 0, 0, 0.08);
	font-size: 0.8rem;
}
.scope-phase__estimate dt {
	text-transform: uppercase;
	letter-spacing: 0.06em;
	font-size: 0.7rem;
	opacity: 0.6;
	align-self: baseline;
}
.scope-phase__estimate dd { margin: 0; }
.scope-phase__deliverables { list-style: disc; padding-left: 1rem; margin: 0; }

.scope-phase__children {
	margin-top: 1rem;
	padding-left: 1.5rem;
	border-left: 2px solid var(--doc-accent, hsl(var(--primary) / 0.3));
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

:global(.dark) .scope-phase__estimate { border-color: rgba(255, 255, 255, 0.08); }

@media print {
	.scope-phase { break-inside: avoid; }
}
</style>

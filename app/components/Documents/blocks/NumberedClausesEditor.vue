<script setup lang="ts">
/**
 * numbered_clauses — auto-numbered legal clauses with 1-level nesting. The
 * numbering is derived at render time from position, so reordering never
 * leaves stale numbers. Editor manages the tree (title + markdown body).
 */
import type { NumberedClausesPayload, ClauseNode } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: NumberedClausesPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: NumberedClausesPayload];
}>();

function uid(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `cl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function newClause(): ClauseNode {
	return { id: uid(), title: '', body_markdown: '', children: [] };
}

const payload = computed<NumberedClausesPayload>(() => ({
	heading: props.modelValue?.heading ?? '',
	numbering_style: props.modelValue?.numbering_style || 'decimal',
	clauses: Array.isArray(props.modelValue?.clauses) ? props.modelValue.clauses : [],
}));

function patch(p: Partial<NumberedClausesPayload>) {
	emit('update:modelValue', { ...payload.value, ...p });
}
function setClauses(clauses: ClauseNode[]) {
	patch({ clauses });
}
function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

function addClause() {
	setClauses([...payload.value.clauses, newClause()]);
}
function removeClause(ci: number) {
	setClauses(payload.value.clauses.filter((_, i) => i !== ci));
}
function updateClause(ci: number, p: Partial<ClauseNode>) {
	setClauses(payload.value.clauses.map((c, i) => (i === ci ? { ...c, ...p } : c)));
}
function moveClause(ci: number, dir: -1 | 1) {
	const j = ci + dir;
	if (j < 0 || j >= payload.value.clauses.length) return;
	const next = clone(payload.value.clauses);
	[next[ci], next[j]] = [next[j], next[ci]];
	setClauses(next);
}
function addChild(ci: number) {
	const next = clone(payload.value.clauses);
	next[ci].children = next[ci].children || [];
	next[ci].children!.push(newClause());
	setClauses(next);
}
function updateChild(ci: number, chi: number, p: Partial<ClauseNode>) {
	const next = clone(payload.value.clauses);
	next[ci].children![chi] = { ...next[ci].children![chi], ...p };
	setClauses(next);
}
function removeChild(ci: number, chi: number) {
	const next = clone(payload.value.clauses);
	next[ci].children = next[ci].children!.filter((_, i) => i !== chi);
	setClauses(next);
}

const NUMBERING_OPTIONS = [
	{ value: 'decimal', label: '1 / 1.1' },
	{ value: 'legal', label: '1. / 1.1.' },
	{ value: 'article', label: 'Article 1 / (a)' },
];
</script>

<template>
	<div class="space-y-2">
		<input
			:value="payload.heading || ''"
			placeholder="Heading (optional) — e.g. Terms & Conditions"
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm font-semibold"
			@input="patch({ heading: ($event.target as HTMLInputElement).value })"
		/>

		<div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
			<span>Numbering</span>
			<div class="flex gap-1">
				<button
					v-for="opt in NUMBERING_OPTIONS"
					:key="opt.value"
					class="px-2 py-0.5 rounded border"
					:class="payload.numbering_style === opt.value ? 'border-primary text-primary bg-primary/5' : 'border-border'"
					@click="patch({ numbering_style: opt.value as NumberedClausesPayload['numbering_style'] })"
				>
					{{ opt.label }}
				</button>
			</div>
		</div>

		<div v-for="(clause, ci) in payload.clauses" :key="clause.id" class="rounded-lg border border-border border-l-2 border-l-primary/60 p-2 space-y-1.5">
			<div class="flex items-center gap-2">
				<span class="text-xs font-semibold text-muted-foreground w-6">{{ ci + 1 }}.</span>
				<input
					:value="clause.title || ''"
					placeholder="Clause title (optional)"
					class="flex-1 bg-transparent border-0 outline-none text-sm font-semibold"
					@input="updateClause(ci, { title: ($event.target as HTMLInputElement).value })"
				/>
				<div class="flex items-center gap-0.5 text-muted-foreground">
					<button class="p-1 rounded hover:bg-muted disabled:opacity-30" :disabled="ci === 0" title="Move up" @click="moveClause(ci, -1)">
						<EIcon name="lucide:chevron-up" class="w-3.5 h-3.5" />
					</button>
					<button class="p-1 rounded hover:bg-muted disabled:opacity-30" :disabled="ci === payload.clauses.length - 1" title="Move down" @click="moveClause(ci, 1)">
						<EIcon name="lucide:chevron-down" class="w-3.5 h-3.5" />
					</button>
					<button class="p-1 rounded hover:bg-destructive/10 text-destructive" title="Remove" @click="removeClause(ci)">
						<EIcon name="lucide:trash-2" class="w-3.5 h-3.5" />
					</button>
				</div>
			</div>
			<textarea
				:value="clause.body_markdown || ''"
				placeholder="Clause text (markdown supported)"
				rows="2"
				class="w-full bg-transparent border-0 outline-none resize-y text-sm leading-relaxed"
				@input="updateClause(ci, { body_markdown: ($event.target as HTMLTextAreaElement).value })"
			/>

			<div v-if="clause.children?.length" class="ml-6 pl-3 border-l border-border space-y-1.5">
				<div v-for="(child, chi) in clause.children" :key="child.id" class="space-y-1">
					<div class="flex items-center gap-2">
						<span class="text-xs text-muted-foreground w-8">{{ ci + 1 }}.{{ chi + 1 }}</span>
						<input
							:value="child.title || ''"
							placeholder="Sub-clause title (optional)"
							class="flex-1 bg-transparent border-0 outline-none text-sm font-medium"
							@input="updateChild(ci, chi, { title: ($event.target as HTMLInputElement).value })"
						/>
						<button class="p-0.5 rounded hover:bg-destructive/10 text-destructive" @click="removeChild(ci, chi)">
							<EIcon name="lucide:x" class="w-3.5 h-3.5" />
						</button>
					</div>
					<textarea
						:value="child.body_markdown || ''"
						placeholder="Sub-clause text"
						rows="2"
						class="w-full bg-transparent border-0 outline-none resize-y text-sm leading-relaxed"
						@input="updateChild(ci, chi, { body_markdown: ($event.target as HTMLTextAreaElement).value })"
					/>
				</div>
			</div>

			<button class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 ml-6" @click="addChild(ci)">
				<EIcon name="lucide:corner-down-right" class="w-3.5 h-3.5" /> Add sub-clause
			</button>
		</div>

		<button
			class="w-full rounded-lg border-2 border-dashed border-border p-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
			@click="addClause"
		>
			<EIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add clause
		</button>
	</div>
</template>

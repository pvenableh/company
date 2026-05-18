<script setup lang="ts">
/**
 * scope_tree — phased deliverables editor.
 *
 * Stacked cards, one per phase. Inline-editable heading + summary +
 * bulleted items + closing note. Optional hours / fee / deliverables
 * disclosure (each with its own "Show on rendered proposal" toggle so
 * agencies can track internal numbers separately from what the client
 * sees). 2-level nesting max — drag a phase onto another's body to nest,
 * or use the Demote action.
 *
 * Spec: project_proposal_builder_overhaul_kickoff.md (scope_tree editor UX)
 */
import type { ScopeTreePayload, ScopeTreeNode } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: ScopeTreePayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: ScopeTreePayload];
}>();

function nodeId(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `phase_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function newPhase(heading = ''): ScopeTreeNode {
	return {
		id: nodeId(),
		heading,
		summary: '',
		bullets: [],
		note: '',
		hours: null,
		fee: null,
		deliverables: [],
		show_hours: false,
		show_fee: false,
		show_deliverables: false,
		children: [],
	};
}

const payload = computed<ScopeTreePayload>({
	get: () => ({
		numbering_style: props.modelValue?.numbering_style || 'phase_word',
		phases: Array.isArray(props.modelValue?.phases) ? props.modelValue.phases : [],
	}),
	set: (v) => emit('update:modelValue', v),
});

const NUMBERING_OPTIONS = [
	{ value: 'phase_word', label: 'Phase one' },
	{ value: 'phase_number', label: 'Phase 1' },
	{ value: 'decimal', label: '1.' },
	{ value: 'none', label: '(none)' },
];

function setNumbering(v: string) {
	payload.value = { ...payload.value, numbering_style: v as any };
}

// ─── Phase mutations ─────────────────────────────────────────────────────
function setPhases(next: ScopeTreeNode[]) {
	payload.value = { ...payload.value, phases: next };
}

function updateNode(path: number[], patch: Partial<ScopeTreeNode>) {
	const next = clone(payload.value.phases);
	const node = nodeAt(next, path);
	if (!node) return;
	Object.assign(node, patch);
	setPhases(next);
}

function addPhase() {
	setPhases([...payload.value.phases, newPhase('')]);
}

function removeNode(path: number[]) {
	const next = clone(payload.value.phases);
	const parent = parentAt(next, path);
	parent.splice(path[path.length - 1], 1);
	setPhases(next);
}

function duplicateNode(path: number[]) {
	const next = clone(payload.value.phases);
	const parent = parentAt(next, path);
	const idx = path[path.length - 1];
	const copy = clone(parent[idx]);
	reassignIds(copy);
	parent.splice(idx + 1, 0, copy);
	setPhases(next);
}

function reassignIds(n: ScopeTreeNode) {
	n.id = nodeId();
	(n.children || []).forEach(reassignIds);
}

function moveUp(path: number[]) {
	const next = clone(payload.value.phases);
	const parent = parentAt(next, path);
	const idx = path[path.length - 1];
	if (idx === 0) return;
	[parent[idx - 1], parent[idx]] = [parent[idx], parent[idx - 1]];
	setPhases(next);
}

function moveDown(path: number[]) {
	const next = clone(payload.value.phases);
	const parent = parentAt(next, path);
	const idx = path[path.length - 1];
	if (idx >= parent.length - 1) return;
	[parent[idx + 1], parent[idx]] = [parent[idx], parent[idx + 1]];
	setPhases(next);
}

function demoteNode(path: number[]) {
	// Nest under previous sibling. Only allowed at top level (2-level max).
	if (path.length > 1) return;
	const idx = path[0];
	if (idx === 0) return;
	const next = clone(payload.value.phases);
	const node = next.splice(idx, 1)[0];
	const target = next[idx - 1];
	target.children = target.children || [];
	// Flatten any of this node's children — 2-level max.
	if (node.children?.length) {
		target.children.push(...node.children);
		node.children = [];
	}
	target.children.push(node);
	setPhases(next);
}

function promoteNode(path: number[]) {
	// Pull out of parent, insert after parent at top level.
	if (path.length !== 2) return;
	const [parentIdx, childIdx] = path;
	const next = clone(payload.value.phases);
	const parent = next[parentIdx];
	const node = parent.children!.splice(childIdx, 1)[0];
	next.splice(parentIdx + 1, 0, node);
	setPhases(next);
}

// ─── Bullets ─────────────────────────────────────────────────────────────
function addBullet(path: number[]) {
	const node = nodeAt(payload.value.phases, path);
	if (!node) return;
	updateNode(path, { bullets: [...(node.bullets || []), ''] });
}
function updateBullet(path: number[], idx: number, value: string) {
	const node = nodeAt(payload.value.phases, path);
	if (!node) return;
	const next = (node.bullets || []).slice();
	next[idx] = value;
	updateNode(path, { bullets: next });
}
function removeBullet(path: number[], idx: number) {
	const node = nodeAt(payload.value.phases, path);
	if (!node) return;
	updateNode(path, { bullets: (node.bullets || []).filter((_, i) => i !== idx) });
}
function onBulletKeydown(e: KeyboardEvent, path: number[], idx: number) {
	if (e.key === 'Enter') {
		e.preventDefault();
		const node = nodeAt(payload.value.phases, path);
		if (!node) return;
		const bullets = (node.bullets || []).slice();
		bullets.splice(idx + 1, 0, '');
		updateNode(path, { bullets });
		nextTick(() => focusBullet(path, idx + 1));
	} else if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
		e.preventDefault();
		removeBullet(path, idx);
		nextTick(() => focusBullet(path, Math.max(0, idx - 1)));
	}
}

function focusBullet(path: number[], idx: number) {
	const el = document.querySelector<HTMLInputElement>(
		`[data-bullet-path="${path.join('-')}-${idx}"]`,
	);
	el?.focus();
}

// ─── Deliverables (disclosure list) ──────────────────────────────────────
function addDeliverable(path: number[]) {
	const node = nodeAt(payload.value.phases, path);
	if (!node) return;
	updateNode(path, { deliverables: [...(node.deliverables || []), ''] });
}
function updateDeliverable(path: number[], idx: number, value: string) {
	const node = nodeAt(payload.value.phases, path);
	if (!node) return;
	const next = (node.deliverables || []).slice();
	next[idx] = value;
	updateNode(path, { deliverables: next });
}
function removeDeliverable(path: number[], idx: number) {
	const node = nodeAt(payload.value.phases, path);
	if (!node) return;
	updateNode(path, { deliverables: (node.deliverables || []).filter((_, i) => i !== idx) });
}

// ─── Drag and drop (HTML5) ───────────────────────────────────────────────
const dragPath = ref<number[] | null>(null);

function onDragStart(e: DragEvent, path: number[]) {
	dragPath.value = path;
	e.dataTransfer?.setData('text/plain', path.join('-'));
	e.dataTransfer!.effectAllowed = 'move';
}
function onDragOver(e: DragEvent) {
	e.preventDefault();
	e.dataTransfer!.dropEffect = 'move';
}
function onDrop(e: DragEvent, targetPath: number[], asChild = false) {
	e.preventDefault();
	const src = dragPath.value;
	dragPath.value = null;
	if (!src || pathEq(src, targetPath)) return;
	if (pathStartsWith(targetPath, src)) return; // can't drop into self
	if (asChild && targetPath.length > 1) return; // 2-level max
	if (asChild && src.length > 1) return; // can't nest already-nested
	const next = clone(payload.value.phases);
	const srcParent = parentAt(next, src);
	const node = srcParent.splice(src[src.length - 1], 1)[0];
	if (asChild) {
		const target = nodeAt(next, targetPath);
		if (!target) return setPhases(payload.value.phases); // shouldn't happen
		target.children = target.children || [];
		// Flatten our own children — 2-level max
		if (node.children?.length) node.children = [];
		target.children.push(node);
	} else {
		// Adjust target path if needed (removed src might shift indices)
		const adjusted = adjustPath(targetPath, src);
		const tParent = parentAt(next, adjusted);
		const tIdx = adjusted[adjusted.length - 1];
		// Insert AFTER the target
		tParent.splice(tIdx + 1, 0, node);
	}
	setPhases(next);
}

function adjustPath(target: number[], removed: number[]): number[] {
	// If `removed` was a sibling earlier in the same parent as `target`,
	// the target's last-index needs to be decremented.
	if (removed.length === target.length) {
		const sameParent = removed.slice(0, -1).every((v, i) => v === target[i]);
		if (sameParent && removed[removed.length - 1] < target[target.length - 1]) {
			const next = target.slice();
			next[next.length - 1] -= 1;
			return next;
		}
	}
	return target;
}

// ─── Tree helpers ────────────────────────────────────────────────────────
function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

function nodeAt(phases: ScopeTreeNode[], path: number[]): ScopeTreeNode | null {
	let arr: ScopeTreeNode[] | undefined = phases;
	let node: ScopeTreeNode | null = null;
	for (const idx of path) {
		if (!arr) return null;
		node = arr[idx] || null;
		if (!node) return null;
		arr = node.children;
	}
	return node;
}

function parentAt(phases: ScopeTreeNode[], path: number[]): ScopeTreeNode[] {
	if (path.length === 1) return phases;
	let arr = phases;
	for (let i = 0; i < path.length - 1; i++) {
		const node = arr[path[i]];
		arr = node.children = node.children || [];
	}
	return arr;
}

function pathEq(a: number[], b: number[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}
function pathStartsWith(a: number[], b: number[]): boolean {
	if (a.length < b.length) return false;
	return b.every((v, i) => v === a[i]);
}

// ─── Render-only-when-flagged disclosure state ───────────────────────────
const expandedPath = ref<string | null>(null);
function isExpanded(path: number[]): boolean { return expandedPath.value === path.join('-'); }
function toggleExpanded(path: number[]) {
	const key = path.join('-');
	expandedPath.value = expandedPath.value === key ? null : key;
}
</script>

<template>
	<div class="space-y-2">
		<!-- Numbering style -->
		<div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground -mb-1">
			<span>Numbering</span>
			<div class="flex gap-1">
				<button
					v-for="opt in NUMBERING_OPTIONS"
					:key="opt.value"
					class="px-2 py-0.5 rounded border"
					:class="payload.numbering_style === opt.value ? 'border-primary text-primary bg-primary/5' : 'border-border'"
					@click="setNumbering(opt.value)"
				>
					{{ opt.label }}
				</button>
			</div>
		</div>

		<!-- Empty state -->
		<div v-if="payload.phases.length === 0" class="ios-card p-6 text-center border-dashed">
			<UIcon name="lucide:layout-template" class="w-7 h-7 mx-auto text-muted-foreground/40 mb-2" />
			<p class="text-sm text-muted-foreground mb-3">No phases yet. Add the first one to start mapping the scope.</p>
			<button
				class="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground"
				@click="addPhase"
			>+ Add first phase</button>
		</div>

		<!-- Phase cards -->
		<div
			v-for="(phase, pIdx) in payload.phases"
			:key="phase.id"
			class="scope-card"
			:draggable="true"
			@dragstart="onDragStart($event, [pIdx])"
			@dragover="onDragOver"
			@drop="onDrop($event, [pIdx])"
		>
			<!-- Phase header -->
			<div class="flex items-center gap-2 p-3 border-b border-border">
				<div class="cursor-grab text-muted-foreground/50 select-none" title="Drag to reorder / Drop on another phase to nest">⋮⋮</div>
				<input
					:value="phase.heading"
					placeholder="Phase heading"
					class="flex-1 bg-transparent border-0 outline-none text-sm font-semibold"
					@input="updateNode([pIdx], { heading: ($event.target as HTMLInputElement).value })"
				/>
				<div class="flex items-center gap-0.5 text-muted-foreground">
					<button class="p-1 rounded hover:bg-muted disabled:opacity-30" :disabled="pIdx === 0" title="Move up" @click="moveUp([pIdx])">
						<UIcon name="lucide:chevron-up" class="w-3.5 h-3.5" />
					</button>
					<button class="p-1 rounded hover:bg-muted disabled:opacity-30" :disabled="pIdx === payload.phases.length - 1" title="Move down" @click="moveDown([pIdx])">
						<UIcon name="lucide:chevron-down" class="w-3.5 h-3.5" />
					</button>
					<button class="p-1 rounded hover:bg-muted disabled:opacity-30" :disabled="pIdx === 0" title="Nest under previous phase" @click="demoteNode([pIdx])">
						<UIcon name="lucide:chevron-right" class="w-3.5 h-3.5" />
					</button>
					<button class="p-1 rounded hover:bg-muted" title="Duplicate" @click="duplicateNode([pIdx])">
						<UIcon name="lucide:copy" class="w-3.5 h-3.5" />
					</button>
					<button class="p-1 rounded hover:bg-destructive/10 text-destructive" title="Delete" @click="removeNode([pIdx])">
						<UIcon name="lucide:trash-2" class="w-3.5 h-3.5" />
					</button>
				</div>
			</div>

			<!-- Phase body -->
			<div class="p-3 space-y-2">
				<textarea
					:value="phase.summary || ''"
					placeholder="Intro — a sentence or two on what this phase covers."
					rows="2"
					class="w-full bg-transparent border-0 outline-none resize-y text-sm leading-relaxed text-muted-foreground"
					@input="updateNode([pIdx], { summary: ($event.target as HTMLTextAreaElement).value })"
				/>

				<!-- Bullets -->
				<ul v-if="(phase.bullets || []).length > 0" class="space-y-1 pl-2">
					<li
						v-for="(bullet, bIdx) in phase.bullets"
						:key="bIdx"
						class="flex items-start gap-1.5 group/bullet"
					>
						<span class="text-muted-foreground mt-1.5">•</span>
						<input
							:value="bullet"
							:data-bullet-path="`${pIdx}-${bIdx}`"
							placeholder="Item"
							class="flex-1 bg-transparent border-0 outline-none text-sm"
							@input="updateBullet([pIdx], bIdx, ($event.target as HTMLInputElement).value)"
							@keydown="onBulletKeydown($event, [pIdx], bIdx)"
						/>
						<button
							class="p-0.5 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover/bullet:opacity-100"
							title="Remove item"
							@click="removeBullet([pIdx], bIdx)"
						>
							<UIcon name="lucide:x" class="w-3.5 h-3.5" />
						</button>
					</li>
				</ul>

				<button
					class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
					@click="addBullet([pIdx])"
				>
					<UIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add item
				</button>

				<textarea
					v-if="phase.note || isExpanded([pIdx])"
					:value="phase.note || ''"
					placeholder="Closing note (optional)"
					rows="2"
					class="w-full bg-transparent border-0 border-t border-border/50 outline-none resize-y text-xs leading-relaxed text-muted-foreground pt-2"
					@input="updateNode([pIdx], { note: ($event.target as HTMLTextAreaElement).value })"
				/>

				<!-- Disclosure: hours / fee / deliverables -->
				<div class="flex items-center justify-between pt-1">
					<button
						class="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
						@click="toggleExpanded([pIdx])"
					>
						<UIcon :name="isExpanded([pIdx]) ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="w-3 h-3" />
						{{ isExpanded([pIdx]) ? 'Hide' : 'Estimate, deliverables, note' }}
					</button>
				</div>

				<div v-if="isExpanded([pIdx])" class="space-y-2 pt-2 border-t border-border/50">
					<div class="grid grid-cols-2 gap-2">
						<label class="text-[11px] text-muted-foreground">
							Hours
							<div class="flex items-center gap-1 mt-0.5">
								<input
									type="number"
									:value="phase.hours ?? ''"
									placeholder="—"
									class="w-20 bg-transparent border-b border-border outline-none text-sm py-0.5"
									@input="updateNode([pIdx], { hours: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })"
								/>
								<label class="text-[10px] inline-flex items-center gap-1">
									<input type="checkbox" :checked="!!phase.show_hours" @change="updateNode([pIdx], { show_hours: ($event.target as HTMLInputElement).checked })" />
									Show
								</label>
							</div>
						</label>
						<label class="text-[11px] text-muted-foreground">
							Fee
							<div class="flex items-center gap-1 mt-0.5">
								<input
									type="number"
									:value="phase.fee ?? ''"
									placeholder="—"
									class="w-24 bg-transparent border-b border-border outline-none text-sm py-0.5"
									@input="updateNode([pIdx], { fee: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })"
								/>
								<label class="text-[10px] inline-flex items-center gap-1">
									<input type="checkbox" :checked="!!phase.show_fee" @change="updateNode([pIdx], { show_fee: ($event.target as HTMLInputElement).checked })" />
									Show
								</label>
							</div>
						</label>
					</div>
					<div>
						<div class="flex items-center justify-between">
							<span class="text-[11px] text-muted-foreground">Deliverables</span>
							<label class="text-[10px] inline-flex items-center gap-1">
								<input type="checkbox" :checked="!!phase.show_deliverables" @change="updateNode([pIdx], { show_deliverables: ($event.target as HTMLInputElement).checked })" />
								Show on rendered proposal
							</label>
						</div>
						<ul class="space-y-1 mt-1">
							<li
								v-for="(d, dIdx) in phase.deliverables || []"
								:key="dIdx"
								class="flex items-center gap-1.5"
							>
								<span class="text-muted-foreground">·</span>
								<input
									:value="d"
									placeholder="Deliverable"
									class="flex-1 bg-transparent border-0 outline-none text-sm"
									@input="updateDeliverable([pIdx], dIdx, ($event.target as HTMLInputElement).value)"
								/>
								<button class="p-0.5 rounded hover:bg-destructive/10 text-destructive" @click="removeDeliverable([pIdx], dIdx)">
									<UIcon name="lucide:x" class="w-3.5 h-3.5" />
								</button>
							</li>
						</ul>
						<button class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1" @click="addDeliverable([pIdx])">
							<UIcon name="lucide:plus" class="w-3 h-3" /> Add deliverable
						</button>
					</div>
				</div>

				<!-- Drop zone for nesting -->
				<div
					class="text-[10px] text-muted-foreground/40 text-center py-1 border border-dashed border-transparent rounded hover:border-primary/40 hover:text-primary"
					@dragover="onDragOver"
					@drop="onDrop($event, [pIdx], true)"
				>
					Drop a phase here to nest
				</div>

				<!-- Children (1 level deep max) -->
				<div v-if="(phase.children || []).length > 0" class="ml-4 pl-3 border-l-2 border-primary/30 space-y-2">
					<div
						v-for="(child, cIdx) in phase.children"
						:key="child.id"
						class="scope-card scope-card--child"
						:draggable="true"
						@dragstart.stop="onDragStart($event, [pIdx, cIdx])"
						@dragover="onDragOver"
						@drop.stop="onDrop($event, [pIdx, cIdx])"
					>
						<div class="flex items-center gap-2 p-2 border-b border-border">
							<div class="cursor-grab text-muted-foreground/50 select-none">⋮⋮</div>
							<input
								:value="child.heading"
								placeholder="Sub-phase heading"
								class="flex-1 bg-transparent border-0 outline-none text-sm font-medium"
								@input="updateNode([pIdx, cIdx], { heading: ($event.target as HTMLInputElement).value })"
							/>
							<div class="flex items-center gap-0.5 text-muted-foreground">
								<button class="p-1 rounded hover:bg-muted" title="Promote to top level" @click="promoteNode([pIdx, cIdx])">
									<UIcon name="lucide:chevron-left" class="w-3.5 h-3.5" />
								</button>
								<button class="p-1 rounded hover:bg-muted" title="Duplicate" @click="duplicateNode([pIdx, cIdx])">
									<UIcon name="lucide:copy" class="w-3.5 h-3.5" />
								</button>
								<button class="p-1 rounded hover:bg-destructive/10 text-destructive" title="Delete" @click="removeNode([pIdx, cIdx])">
									<UIcon name="lucide:trash-2" class="w-3.5 h-3.5" />
								</button>
							</div>
						</div>
						<div class="p-2 space-y-2">
							<textarea
								:value="child.summary || ''"
								placeholder="Intro"
								rows="2"
								class="w-full bg-transparent border-0 outline-none resize-y text-sm text-muted-foreground"
								@input="updateNode([pIdx, cIdx], { summary: ($event.target as HTMLTextAreaElement).value })"
							/>
							<ul v-if="(child.bullets || []).length > 0" class="space-y-1 pl-2">
								<li
									v-for="(bullet, bIdx) in child.bullets"
									:key="bIdx"
									class="flex items-start gap-1.5 group/bullet"
								>
									<span class="text-muted-foreground mt-1.5">•</span>
									<input
										:value="bullet"
										:data-bullet-path="`${pIdx}-${cIdx}-${bIdx}`"
										placeholder="Item"
										class="flex-1 bg-transparent border-0 outline-none text-sm"
										@input="updateBullet([pIdx, cIdx], bIdx, ($event.target as HTMLInputElement).value)"
										@keydown="onBulletKeydown($event, [pIdx, cIdx], bIdx)"
									/>
									<button
										class="p-0.5 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover/bullet:opacity-100"
										@click="removeBullet([pIdx, cIdx], bIdx)"
									>
										<UIcon name="lucide:x" class="w-3.5 h-3.5" />
									</button>
								</li>
							</ul>
							<button class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" @click="addBullet([pIdx, cIdx])">
								<UIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add item
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<button
			v-if="payload.phases.length > 0"
			class="w-full ios-card p-2 border-dashed border-2 border-border bg-transparent text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
			@click="addPhase"
		>
			<UIcon name="lucide:plus" class="w-3.5 h-3.5" />
			Add phase
		</button>
	</div>
</template>

<style scoped>
.scope-card {
	border: 1px solid hsl(var(--border));
	border-left: 3px solid hsl(var(--primary));
	border-radius: 0.5rem;
	background: var(--background, hsl(var(--background)));
}
.scope-card--child {
	border-left-width: 2px;
	border-left-color: hsl(var(--primary) / 0.5);
}
</style>

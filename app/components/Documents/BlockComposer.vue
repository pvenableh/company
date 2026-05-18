<script setup lang="ts">
import type { Component } from 'vue';
import type { DocumentBlock, BlockAppliesTo } from '~/composables/useDocumentBlocks';
import { getBlockType, listBlockTypes } from '~~/shared/blocks/registry';
import type { BlockTypeDescriptor } from '~~/shared/blocks/registry';
import { normalizeEntries, newEntryId } from '~~/shared/blocks/normalize';
import type { DocumentBlockEntry, RichTextPayload } from '~~/shared/blocks/types';
import '~/components/Documents/blocks/builtins';

/**
 * `modelValue` may arrive in either legacy or typed shape; we normalize
 * on read and always emit typed shape. The parent's stored value will
 * thus migrate to the new shape on the next save with no data loss.
 */
const props = defineProps<{
	modelValue: any[] | null | undefined;
	appliesTo: BlockAppliesTo;
	saving?: boolean;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: DocumentBlockEntry[]];
}>();

const { listPublished, create: createBlock } = useDocumentBlocks();
const toast = useToast();

const entries = computed<DocumentBlockEntry[]>({
	get: () => normalizeEntries(props.modelValue),
	set: (v) => emit('update:modelValue', v),
});

const library = ref<DocumentBlock[]>([]);
const libraryLoaded = ref(false);
const pickerOpen = ref(false);

async function ensureLibrary() {
	if (libraryLoaded.value) return;
	library.value = await listPublished(props.appliesTo);
	libraryLoaded.value = true;
}

const libraryByCategory = computed(() => {
	const groups: Record<string, DocumentBlock[]> = {};
	for (const b of library.value) {
		(groups[b.category] = groups[b.category] || []).push(b);
	}
	return groups;
});

const availableTypes = computed<BlockTypeDescriptor[]>(() => listBlockTypes(props.appliesTo));

function update(idx: number, patch: Partial<DocumentBlockEntry>) {
	const next = entries.value.slice();
	next[idx] = { ...next[idx], ...patch };
	entries.value = next;
}

function updatePayload(idx: number, payload: any) {
	update(idx, { payload });
}

function addEntry(entry: DocumentBlockEntry) {
	entries.value = [...entries.value, entry];
}

function addInline(type: string = 'rich_text') {
	const desc = getBlockType(type);
	const payload = desc ? desc.defaultPayload() : { heading: '', body_markdown: '' };
	addEntry({
		id: newEntryId(),
		type: (desc?.type || 'rich_text'),
		payload,
		library_ref: null,
		page_break_after: false,
	});
	pickerOpen.value = false;
}

function addFromLibrary(block: DocumentBlock) {
	const t = (block.type as any) || 'rich_text';
	const payload = (block.payload && Object.keys(block.payload).length > 0)
		? { ...block.payload }
		: ({ heading: block.name, body_markdown: block.content || '' } as RichTextPayload);
	addEntry({
		id: newEntryId(),
		type: t,
		payload,
		library_ref: block.id,
		page_break_after: false,
	});
	pickerOpen.value = false;
}

function removeEntry(idx: number) {
	entries.value = entries.value.filter((_, i) => i !== idx);
}

function moveUp(idx: number) {
	if (idx === 0) return;
	const next = entries.value.slice();
	[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
	entries.value = next;
}

function moveDown(idx: number) {
	if (idx === entries.value.length - 1) return;
	const next = entries.value.slice();
	[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
	entries.value = next;
}

async function saveToLibrary(idx: number) {
	const entry = entries.value[idx];
	if (entry.library_ref) {
		toast.add({ title: 'Already in library', color: 'blue' });
		return;
	}
	// Only rich_text can save to library today; other types follow as their primitives ship.
	if (entry.type !== 'rich_text') {
		toast.add({ title: 'Save-to-library not yet supported for this block type', color: 'amber' });
		return;
	}
	const payload = entry.payload as RichTextPayload;
	const name = payload?.heading?.trim() || prompt('Name this block for the library:');
	if (!name) return;
	try {
		const newBlock = await createBlock({
			name,
			category: 'other',
			content: payload.body_markdown || '',
			type: 'rich_text',
			payload: { heading: payload.heading || null, body_markdown: payload.body_markdown || '' },
			applies_to: ['proposals', 'contracts'],
			status: 'published',
		} as any);
		update(idx, { library_ref: newBlock.id });
		library.value = [newBlock, ...library.value];
		toast.add({ title: 'Saved to library', description: name, color: 'green' });
	} catch (err: any) {
		toast.add({ title: 'Failed to save', description: err.message, color: 'red' });
	}
}

function detachFromLibrary(idx: number) {
	update(idx, { library_ref: null });
	toast.add({ title: 'Detached — block is now inline', color: 'blue' });
}

function togglePageBreak(idx: number) {
	update(idx, { page_break_after: !entries.value[idx].page_break_after });
}

const CATEGORY_LABELS: Record<string, string> = {
	bio: 'Bio',
	references: 'References',
	case_study: 'Case Study',
	deliverables: 'Deliverables',
	pricing: 'Pricing',
	timeline: 'Timeline',
	terms: 'Terms',
	nda: 'NDA',
	cover: 'Cover',
	other: 'Other',
};

watch(pickerOpen, (open) => { if (open) ensureLibrary(); });

/**
 * Resolve the Editor component for a given block type. Returns null if
 * the type isn't registered (renders an "unsupported" placeholder).
 */
const editorCache = new Map<string, Component>();
const editorComponents = ref<Record<string, Component | null>>({});

async function resolveEditor(type: string) {
	if (editorComponents.value[type] !== undefined) return;
	const desc = getBlockType(type);
	if (!desc?.Editor) {
		editorComponents.value = { ...editorComponents.value, [type]: null };
		return;
	}
	if (editorCache.has(type)) {
		editorComponents.value = { ...editorComponents.value, [type]: editorCache.get(type)! };
		return;
	}
	const loaded = (await desc.Editor()) as Component;
	editorCache.set(type, loaded);
	editorComponents.value = { ...editorComponents.value, [type]: loaded };
}

watchEffect(() => {
	for (const e of entries.value) {
		if (editorComponents.value[e.type] === undefined) resolveEditor(e.type);
	}
});

function typeLabel(type: string): string {
	return getBlockType(type)?.name || type;
}
</script>

<template>
	<div class="space-y-3">
		<TransitionGroup name="block-list" tag="div" class="space-y-3">
			<div
				v-for="(entry, idx) in entries"
				:key="entry.id"
				class="ios-card p-4 space-y-2 group"
			>
				<!-- Toolbar -->
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
						<button
							class="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30"
							:disabled="idx === 0"
							@click="moveUp(idx)"
							:title="`Move up`"
						>
							<UIcon name="lucide:chevron-up" class="w-3.5 h-3.5" />
						</button>
						<button
							class="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30"
							:disabled="idx === entries.length - 1"
							@click="moveDown(idx)"
							:title="`Move down`"
						>
							<UIcon name="lucide:chevron-down" class="w-3.5 h-3.5" />
						</button>
						<span v-if="entry.library_ref" class="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] uppercase tracking-wider">
							Library
						</span>
						<span v-else class="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] uppercase tracking-wider">
							Inline
						</span>
						<span
							v-if="entry.type !== 'rich_text'"
							class="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] uppercase tracking-wider"
						>
							{{ typeLabel(entry.type) }}
						</span>
					</div>
					<div class="flex items-center gap-1.5">
						<button
							class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded hover:bg-muted"
							:class="entry.page_break_after ? 'text-primary' : 'text-muted-foreground'"
							@click="togglePageBreak(idx)"
							:title="entry.page_break_after ? 'Page break after this block' : 'Add page break after'"
						>
							<UIcon name="lucide:scissors" class="w-3.5 h-3.5 inline -mt-0.5" />
							{{ entry.page_break_after ? 'Page break' : 'Break' }}
						</button>
						<button
							v-if="!entry.library_ref && entry.type === 'rich_text'"
							class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded hover:bg-muted text-muted-foreground"
							@click="saveToLibrary(idx)"
							title="Save this block to your library for reuse"
						>
							Save to library
						</button>
						<button
							v-else-if="entry.library_ref"
							class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded hover:bg-muted text-muted-foreground"
							@click="detachFromLibrary(idx)"
							title="Detach from library — your edits stay on this document only"
						>
							Detach
						</button>
						<button
							class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded hover:bg-destructive/10 dark:hover:bg-destructive/40 text-destructive"
							@click="removeEntry(idx)"
						>
							Remove
						</button>
					</div>
				</div>

				<!-- Type-dispatched editor -->
				<component
					:is="editorComponents[entry.type]"
					v-if="editorComponents[entry.type]"
					:model-value="entry.payload"
					@update:model-value="updatePayload(idx, $event)"
				/>
				<div v-else-if="editorComponents[entry.type] === null" class="p-3 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
					Unsupported block type "{{ entry.type }}" — no editor registered.
				</div>
				<div v-else class="py-2 text-xs text-muted-foreground">
					<UIcon name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin inline -mt-0.5" />
					Loading editor…
				</div>

				<div v-if="entry.page_break_after" class="border-t border-dashed border-primary/40 pt-2 -mb-2">
					<p class="text-[10px] uppercase tracking-wider text-primary/70 text-center">↓ Page break ↓</p>
				</div>
			</div>
		</TransitionGroup>

		<!-- Empty state -->
		<div v-if="entries.length === 0" class="ios-card p-8 text-center">
			<UIcon name="lucide:layout-list" class="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
			<p class="text-sm text-muted-foreground mb-3">No blocks yet. Start with a library block or write inline.</p>
		</div>

		<!-- Add button + picker -->
		<div class="relative">
			<button
				class="w-full ios-card p-3 hover:border-primary/40 border-dashed border-2 border-border bg-transparent text-sm flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
				@click="pickerOpen = !pickerOpen"
			>
				<UIcon name="lucide:plus" class="w-4 h-4" />
				Add block
			</button>

			<div
				v-if="pickerOpen"
				class="absolute left-0 right-0 top-full mt-2 ios-card p-3 z-20 max-h-96 overflow-y-auto shadow-lg"
			>
				<!-- Inline block types (registry-driven) -->
				<div class="space-y-0.5 mb-2">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-1">New inline block</p>
					<button
						v-for="t in availableTypes"
						:key="t.type"
						class="w-full text-left p-2 rounded hover:bg-muted text-sm flex items-center gap-2"
						@click="addInline(t.type)"
					>
						<UIcon :name="t.icon" class="w-4 h-4 text-muted-foreground" />
						<span>{{ t.name }}</span>
						<span v-if="t.description" class="ml-auto text-[10px] text-muted-foreground line-clamp-1">{{ t.description }}</span>
					</button>
				</div>

				<div v-if="!libraryLoaded" class="py-4 text-center">
					<UIcon name="lucide:loader-2" class="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
				</div>
				<div v-else-if="library.length === 0" class="py-3 px-2 text-xs text-muted-foreground border-t border-border mt-2 pt-3">
					No library blocks yet.
					<NuxtLink to="/organization/document-blocks" class="underline">Create one</NuxtLink>
					to reuse across documents.
				</div>
				<div v-else class="space-y-2 border-t border-border mt-2 pt-2">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-1">From library</p>
					<div
						v-for="(catBlocks, cat) in libraryByCategory"
						:key="cat"
						class="space-y-0.5"
					>
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-2">
							{{ CATEGORY_LABELS[cat] || cat }}
						</p>
						<button
							v-for="b in catBlocks"
							:key="b.id"
							class="w-full text-left p-2 rounded hover:bg-muted text-sm flex items-start gap-2"
							@click="addFromLibrary(b)"
						>
							<UIcon name="lucide:rectangle-horizontal" class="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
							<div class="flex-1 min-w-0">
								<p class="font-medium truncate">{{ b.name }}</p>
								<p v-if="b.description" class="text-xs text-muted-foreground line-clamp-1">{{ b.description }}</p>
							</div>
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.block-list-move,
.block-list-enter-active,
.block-list-leave-active {
	transition: all 0.25s ease;
}
.block-list-enter-from,
.block-list-leave-to {
	opacity: 0;
	transform: translateY(8px);
}
.block-list-leave-active {
	position: absolute;
}
</style>

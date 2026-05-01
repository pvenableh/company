<script setup lang="ts">
import type { DocumentBlock, DocumentBlockEntry, BlockAppliesTo } from '~/composables/useDocumentBlocks';

const props = defineProps<{
	modelValue: DocumentBlockEntry[] | null | undefined;
	appliesTo: BlockAppliesTo;
	saving?: boolean;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: DocumentBlockEntry[]];
}>();

const { listPublished, create: createBlock } = useDocumentBlocks();
const toast = useToast();

const entries = computed<DocumentBlockEntry[]>({
	get: () => props.modelValue || [],
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

function update(idx: number, patch: Partial<DocumentBlockEntry>) {
	const next = entries.value.slice();
	next[idx] = { ...next[idx], ...patch };
	entries.value = next;
}

function addEntry(entry: DocumentBlockEntry) {
	entries.value = [...entries.value, entry];
}

function addInline() {
	addEntry({ block_id: null, heading: '', content: '', page_break_after: false });
	pickerOpen.value = false;
}

function addFromLibrary(block: DocumentBlock) {
	addEntry({
		block_id: block.id,
		heading: block.name,
		content: block.content || '',
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
	if (entry.block_id) {
		toast.add({ title: 'Already in library', color: 'blue' });
		return;
	}
	const name = entry.heading?.trim() || prompt('Name this block for the library:');
	if (!name) return;
	try {
		const newBlock = await createBlock({
			name,
			category: 'other',
			content: entry.content,
			applies_to: ['proposals', 'contracts'],
			status: 'published',
		});
		update(idx, { block_id: newBlock.id });
		library.value = [newBlock, ...library.value];
		toast.add({ title: 'Saved to library', description: name, color: 'green' });
	} catch (err: any) {
		toast.add({ title: 'Failed to save', description: err.message, color: 'red' });
	}
}

function detachFromLibrary(idx: number) {
	update(idx, { block_id: null });
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
</script>

<template>
	<div class="space-y-3">
		<TransitionGroup name="block-list" tag="div" class="space-y-3">
			<div
				v-for="(entry, idx) in entries"
				:key="`${entry.block_id || 'inline'}-${idx}`"
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
						<span v-if="entry.block_id" class="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] uppercase tracking-wider">
							Library
						</span>
						<span v-else class="ml-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] uppercase tracking-wider">
							Inline
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
							v-if="!entry.block_id"
							class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded hover:bg-muted text-muted-foreground"
							@click="saveToLibrary(idx)"
							title="Save this block to your library for reuse"
						>
							Save to library
						</button>
						<button
							v-else
							class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded hover:bg-muted text-muted-foreground"
							@click="detachFromLibrary(idx)"
							title="Detach from library — your edits stay on this document only"
						>
							Detach
						</button>
						<button
							class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600"
							@click="removeEntry(idx)"
						>
							Remove
						</button>
					</div>
				</div>

				<!-- Heading -->
				<input
					:value="entry.heading || ''"
					placeholder="Section heading (optional)"
					class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm font-semibold"
					@input="update(idx, { heading: ($event.target as HTMLInputElement).value })"
				/>

				<!-- Content -->
				<textarea
					:value="entry.content"
					placeholder="Block content (markdown supported)"
					rows="6"
					class="w-full bg-transparent border-0 focus:ring-0 outline-none resize-y text-sm leading-relaxed"
					@input="update(idx, { content: ($event.target as HTMLTextAreaElement).value })"
				/>

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
				<button
					class="w-full text-left p-2 rounded hover:bg-muted text-sm flex items-center gap-2 mb-2"
					@click="addInline"
				>
					<UIcon name="lucide:pencil" class="w-4 h-4 text-muted-foreground" />
					<span>Write a custom block</span>
					<span class="ml-auto text-[10px] uppercase text-muted-foreground">Inline</span>
				</button>

				<div v-if="!libraryLoaded" class="py-4 text-center">
					<UIcon name="lucide:loader-2" class="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
				</div>
				<div v-else-if="library.length === 0" class="py-3 px-2 text-xs text-muted-foreground">
					No library blocks yet.
					<NuxtLink to="/organization/document-blocks" class="underline">Create one</NuxtLink>
					to reuse across documents.
				</div>
				<div v-else class="space-y-2">
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

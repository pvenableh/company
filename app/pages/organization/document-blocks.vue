<template>
	<div class="container mx-auto py-6 px-4">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h2 class="text-2xl font-semibold">Document Blocks</h2>
				<p class="text-sm t-text-secondary mt-1">
					Reusable content blocks (bio, references, deliverables, terms, NDA, case studies) that compose into proposals + contracts.
				</p>
			</div>
			<UButton color="primary" @click="openNew">
				<UIcon name="i-heroicons-plus" class="h-4 w-4" />
				New block
			</UButton>
		</div>

		<UAlert
			v-if="!selectedOrg"
			class="mb-6"
			title="No organization selected"
			description="Pick an organization from the global header to manage blocks."
			color="blue"
		/>

		<div v-else class="mb-6 flex items-center gap-2 flex-wrap">
			<button
				v-for="cat in categoryFilters"
				:key="cat.value"
				class="text-xs px-3 py-1 rounded-full border transition-colors"
				:class="activeCategory === cat.value
					? 'bg-primary text-primary-foreground border-primary'
					: 'border-border hover:border-primary/40'"
				@click="activeCategory = cat.value"
			>
				{{ cat.label }} <span class="opacity-60">({{ countByCategory(cat.value) }})</span>
			</button>
		</div>

		<div v-if="loading" class="flex justify-center py-12">
			<UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
		</div>

		<UCard v-else-if="!filtered.length && !blocks.length" class="text-center py-10">
			<UIcon name="i-heroicons-rectangle-group" class="mx-auto h-10 w-10 text-gray-300 mb-3" />
			<h3 class="text-base font-medium mb-1">No blocks yet</h3>
			<p class="t-text-secondary text-sm mb-4 max-w-md mx-auto">
				Save the boilerplate sections you reuse — your studio bio, standard NDA terms, references, case studies. Drag them into any proposal or contract.
			</p>
			<UButton color="primary" @click="openNew">Add your first block</UButton>
		</UCard>

		<UCard v-else-if="!filtered.length" class="text-center py-8">
			<p class="t-text-secondary text-sm">No blocks in this category.</p>
		</UCard>

		<div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			<button
				v-for="b in filtered"
				:key="b.id"
				class="text-left ios-card p-4 hover:border-primary/40 transition-colors"
				:class="b.status === 'archived' ? 'opacity-60' : ''"
				@click="openEdit(b)"
			>
				<div class="flex items-start justify-between gap-2 mb-2">
					<div class="flex-1 min-w-0">
						<p class="text-[10px] uppercase tracking-wider t-text-muted">{{ categoryLabel(b.category) }}</p>
						<h3 class="text-base font-semibold truncate">{{ b.name }}</h3>
					</div>
					<span
						class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
						:class="statusChipClass(b.status)"
					>{{ b.status }}</span>
				</div>
				<p v-if="b.description" class="text-sm t-text-secondary line-clamp-2 mb-3">{{ b.description }}</p>
				<div class="flex items-center justify-between text-xs t-text-muted">
					<span>{{ wordCount(b.content) }} words</span>
					<span class="flex gap-1">
						<span v-if="b.applies_to?.includes('proposals')" class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">P</span>
						<span v-if="b.applies_to?.includes('contracts')" class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">C</span>
					</span>
				</div>
			</button>
		</div>

		<DocumentBlocksFormModal
			v-model="modalOpen"
			:block="selectedBlock"
			@created="onCreated"
			@updated="onUpdated"
			@deleted="onDeleted"
		/>
	</div>
</template>

<script setup lang="ts">
import type { DocumentBlock, BlockCategory } from '~/composables/useDocumentBlocks';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Document Blocks | Earnest' });

const { selectedOrg } = useOrganization();
const { list } = useDocumentBlocks();

const blocks = ref<DocumentBlock[]>([]);
const loading = ref(false);
const modalOpen = ref(false);
const selectedBlock = ref<Partial<DocumentBlock> | null>(null);
const activeCategory = ref<'all' | BlockCategory>('all');

const categoryFilters: Array<{ value: 'all' | BlockCategory; label: string }> = [
	{ value: 'all', label: 'All' },
	{ value: 'bio', label: 'Bio' },
	{ value: 'references', label: 'References' },
	{ value: 'case_study', label: 'Case Study' },
	{ value: 'deliverables', label: 'Deliverables' },
	{ value: 'pricing', label: 'Pricing' },
	{ value: 'timeline', label: 'Timeline' },
	{ value: 'terms', label: 'Terms' },
	{ value: 'nda', label: 'NDA' },
	{ value: 'cover', label: 'Cover' },
	{ value: 'other', label: 'Other' },
];

const filtered = computed(() => {
	if (activeCategory.value === 'all') return blocks.value;
	return blocks.value.filter((b) => b.category === activeCategory.value);
});

function countByCategory(cat: 'all' | BlockCategory) {
	if (cat === 'all') return blocks.value.length;
	return blocks.value.filter((b) => b.category === cat).length;
}

function categoryLabel(cat: BlockCategory) {
	return categoryFilters.find((c) => c.value === cat)?.label || cat;
}

function statusChipClass(status: string) {
	if (status === 'published') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
	if (status === 'draft') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
	return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function wordCount(text: string | null) {
	if (!text) return 0;
	return text.trim().split(/\s+/).filter(Boolean).length;
}

async function fetchBlocks() {
	if (!selectedOrg.value) return;
	loading.value = true;
	try { blocks.value = await list({ includeArchived: true }); } finally { loading.value = false; }
}

function openNew() { selectedBlock.value = null; modalOpen.value = true; }
function openEdit(b: DocumentBlock) { selectedBlock.value = b; modalOpen.value = true; }
function onCreated(b: DocumentBlock) { blocks.value = [b, ...blocks.value]; }
function onUpdated(b: DocumentBlock) {
	const idx = blocks.value.findIndex((x) => x.id === b.id);
	if (idx !== -1) blocks.value[idx] = b;
}
function onDeleted(id: string) { blocks.value = blocks.value.filter((b) => b.id !== id); }

watch(() => selectedOrg.value, fetchBlocks, { immediate: true });
</script>

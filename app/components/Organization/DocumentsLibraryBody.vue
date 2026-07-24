<!--
	DocumentsLibraryBody — shared inner body for the Documents Library surface.

	Rendered by both the full-page `/organization/documents-library` route
	(legacy) and the apps-layout slide-over `documents_library` panel.
	Accepts `:initial-tab` (`'blocks' | 'offerings'`) and `:compact` to
	skip the page-level header when embedded inside a slide-over shell.
-->
<template>
	<div>
		<div v-if="!compact" class="flex items-center justify-between mb-6">
			<div>
				<h2 class="text-2xl font-semibold">Documents Library</h2>
				<p class="text-sm text-muted-foreground mt-1">
					The reusable pieces that compose into proposals and contracts — content blocks (bio, references, terms) and service offerings (scope + pricing presets).
				</p>
			</div>
			<EButton color="primary" @click="openNew">
				<EIcon name="i-heroicons-plus" class="h-4 w-4" />
				{{ activeTab === 'blocks' ? 'New block' : 'New offering' }}
			</EButton>
		</div>

		<EAlert
			v-if="!selectedOrg"
			class="mb-6"
			title="No organization selected"
			description="Pick an organization from the global header to manage the library."
			color="blue"
		/>

		<template v-else>
			<!-- Tab strip -->
			<div class="flex items-center justify-between gap-4 border-b border-border mb-6">
				<div class="flex items-center gap-1">
					<button
						v-for="t in TABS"
						:key="t.key"
						class="px-4 py-2 text-sm border-b-2 -mb-px transition-colors"
						:class="activeTab === t.key
							? 'border-primary text-foreground font-medium'
							: 'border-transparent text-muted-foreground hover:text-foreground'"
						@click="setTab(t.key)"
					>
						{{ t.label }}
						<span class="text-xs text-muted-foreground/40 ml-1">({{ t.count }})</span>
					</button>
				</div>
				<EButton v-if="compact" size="xs" color="primary" @click="openNew">
					<EIcon name="i-heroicons-plus" class="h-3.5 w-3.5" />
					{{ activeTab === 'blocks' ? 'New block' : 'New offering' }}
				</EButton>
			</div>

			<!-- ─── Blocks tab ─────────────────────────────────────────────── -->
			<section v-show="activeTab === 'blocks'">
				<div class="mb-6 flex items-center gap-2 flex-wrap">
					<button
						v-for="cat in BLOCK_CATEGORIES"
						:key="cat.value"
						class="text-xs px-3 py-1 rounded-full border transition-colors"
						:class="activeBlockCategory === cat.value
							? 'bg-primary text-primary-foreground border-primary'
							: 'border-border hover:border-primary/40'"
						@click="activeBlockCategory = cat.value"
					>
						{{ cat.label }} <span class="opacity-60">({{ countBlockCategory(cat.value) }})</span>
					</button>
				</div>

				<div v-if="loadingBlocks" class="flex justify-center py-12">
					<EIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
				</div>

				<ECard v-else-if="!filteredBlocks.length && !blocks.length" class="text-center py-10">
					<EIcon name="i-heroicons-rectangle-group" class="mx-auto h-10 w-10 text-gray-300 mb-3" />
					<h3 class="text-base font-medium mb-1">No blocks yet</h3>
					<p class="text-muted-foreground text-sm mb-4 max-w-md mx-auto">
						Save the boilerplate sections you reuse — studio bio, standard terms, references, case studies. Drag them into any proposal or contract.
					</p>
					<EButton color="primary" @click="openNew">Add your first block</EButton>
				</ECard>

				<ECard v-else-if="!filteredBlocks.length" class="text-center py-8">
					<p class="text-muted-foreground text-sm">No blocks in this category.</p>
				</ECard>

				<div v-else :class="cardGridClass">
					<button
						v-for="b in filteredBlocks"
						:key="b.id"
						class="text-left ios-card p-4 hover:ring-2 hover:ring-primary/30 transition-all"
						:class="b.status === 'archived' ? 'opacity-60' : ''"
						@click="openEditBlock(b)"
					>
						<div class="flex items-start justify-between gap-2 mb-2">
							<div class="flex-1 min-w-0">
								<p class="text-[10px] uppercase tracking-wider text-muted-foreground/40">{{ blockCategoryLabel(b.category) }}</p>
								<h3 class="text-base font-semibold truncate">{{ b.name }}</h3>
							</div>
							<span
								class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
								:class="statusChipClass(b.status)"
							>{{ b.status }}</span>
						</div>
						<p v-if="b.description" class="text-sm text-muted-foreground line-clamp-2 mb-3">{{ b.description }}</p>
						<div class="flex items-center justify-between text-xs text-muted-foreground/40">
							<span>{{ wordCount(b.content) }} words</span>
							<span class="flex gap-1">
								<span v-if="b.applies_to?.includes('proposals')" class="px-1.5 py-0.5 rounded bg-success/10 text-success dark:bg-success/30 dark:text-success">P</span>
								<span v-if="b.applies_to?.includes('contracts')" class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">C</span>
							</span>
						</div>
					</button>
				</div>
			</section>

			<!-- ─── Service offerings tab ──────────────────────────────────── -->
			<section v-show="activeTab === 'offerings'">
				<div v-if="loadingOfferings" class="flex justify-center py-12">
					<EIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
				</div>

				<ECard v-else-if="!offerings.length" class="text-center py-10">
					<EIcon name="i-heroicons-rectangle-stack" class="mx-auto h-10 w-10 text-gray-300 mb-3" />
					<h3 class="text-base font-medium mb-1">No offerings yet</h3>
					<p class="text-muted-foreground text-sm mb-4 max-w-md mx-auto">
						Add the services you offer most often. Each captures a scope template (phased deliverables) + default pricing — the AI uses them as the spine when drafting proposals, and the in-app scope tree editor can drop them in directly.
					</p>
					<EButton color="primary" @click="openNew">Add your first offering</EButton>
				</ECard>

				<div v-else :class="cardGridClass">
					<button
						v-for="t in offerings"
						:key="t.id"
						class="text-left ios-card p-4 hover:ring-2 hover:ring-primary/30 transition-all"
						:class="t.status === 'archived' ? 'opacity-60' : ''"
						@click="openEditOffering(t)"
					>
						<div class="flex items-start justify-between gap-2 mb-2">
							<div class="flex items-start gap-2 flex-1 min-w-0">
								<span
									v-if="t.icon"
									class="inline-flex items-center justify-center w-8 h-8 rounded-full text-lg shrink-0"
									:style="{ backgroundColor: t.color || 'hsl(var(--app-work) / 0.15)' }"
								>{{ t.icon }}</span>
								<div class="flex-1 min-w-0">
									<span
										class="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full mb-1.5"
										:style="categoryBadgeStyle(t.color)"
										:title="t.color ? `Color: ${t.color}` : 'Default (Work accent)'"
									>{{ t.category || 'other' }}</span>
									<h3 class="text-base font-semibold truncate">{{ t.name }}</h3>
								</div>
							</div>
							<span
								class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
								:class="statusChipClass(t.status)"
							>{{ t.status }}</span>
						</div>
						<p v-if="t.description" class="text-sm text-muted-foreground line-clamp-2 mb-3">{{ t.description }}</p>
						<div class="flex items-center justify-between text-xs text-muted-foreground/40">
							<span>{{ phaseCount(t) }} phases</span>
							<div class="flex items-center gap-3">
								<span v-if="t.default_total != null">{{ formatMoney(t.default_total) }}</span>
								<span v-if="t.default_duration_days">{{ t.default_duration_days }} days</span>
							</div>
						</div>
					</button>
				</div>
			</section>
		</template>

		<DocumentBlocksFormModal
			v-model="blockModalOpen"
			:block="selectedBlock"
			@created="onBlockCreated"
			@updated="onBlockUpdated"
			@deleted="onBlockDeleted"
		/>
		<ServiceTemplatesFormModal
			v-model="offeringModalOpen"
			:template="selectedOffering"
			@created="onOfferingCreated"
			@updated="onOfferingUpdated"
			@deleted="onOfferingDeleted"
		/>
	</div>
</template>

<script setup lang="ts">
import type { DocumentBlock, BlockCategory } from '~/composables/useDocumentBlocks';
import type { ServiceTemplate } from '~/composables/useServiceTemplates';
import { legibleTextOn, legibleTextOnHsl } from '~/utils/color-contrast';

type TabKey = 'blocks' | 'offerings';

const props = withDefaults(defineProps<{
	initialTab?: TabKey;
	compact?: boolean;
	// When set, this tab is reported back via `update:tab` so the parent
	// (e.g. the apps-layout slide-over URL) can keep itself in sync.
	syncUrl?: boolean;
}>(), {
	initialTab: 'blocks',
	compact: false,
	syncUrl: false,
});

const emit = defineEmits<{
	(e: 'update:tab', tab: TabKey): void;
}>();

const route = useRoute();
const router = useRouter();
const { selectedOrg } = useOrganization();
const { list: listBlocks } = useDocumentBlocks();
const { list: listOfferings } = useServiceTemplates();
const { accents } = useAppAccent();
const workAccent = computed(() => accents.value.work);

const VALID_TABS: TabKey[] = ['blocks', 'offerings'];
const activeTab = ref<TabKey>(VALID_TABS.includes(props.initialTab) ? props.initialTab : 'blocks');

// Keep activeTab in sync if the parent passes a new initialTab (e.g. when
// the slide-over URL flips from `documents_library:blocks` to `:offerings`).
watch(() => props.initialTab, (next) => {
	if (next && VALID_TABS.includes(next) && next !== activeTab.value) {
		activeTab.value = next;
	}
});

function setTab(t: TabKey) {
	activeTab.value = t;
	emit('update:tab', t);
	if (props.syncUrl) {
		router.replace({ query: { ...route.query, tab: t === 'blocks' ? undefined : t } });
	}
}

const cardGridClass = computed(() => props.compact
	? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
	: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4');

// ─── Data ───────────────────────────────────────────────────────────────
const blocks = ref<DocumentBlock[]>([]);
const offerings = ref<ServiceTemplate[]>([]);
const loadingBlocks = ref(false);
const loadingOfferings = ref(false);

const blockModalOpen = ref(false);
const offeringModalOpen = ref(false);
const selectedBlock = ref<Partial<DocumentBlock> | null>(null);
const selectedOffering = ref<Partial<ServiceTemplate> | null>(null);

const activeBlockCategory = ref<'all' | BlockCategory>('all');
const BLOCK_CATEGORIES: Array<{ value: 'all' | BlockCategory; label: string }> = [
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

const TABS = computed<Array<{ key: TabKey; label: string; count: number }>>(() => [
	{ key: 'blocks', label: 'Blocks', count: blocks.value.length },
	{ key: 'offerings', label: 'Service offerings', count: offerings.value.length },
]);

const filteredBlocks = computed(() => {
	if (activeBlockCategory.value === 'all') return blocks.value;
	return blocks.value.filter((b) => b.category === activeBlockCategory.value);
});

function countBlockCategory(cat: 'all' | BlockCategory) {
	if (cat === 'all') return blocks.value.length;
	return blocks.value.filter((b) => b.category === cat).length;
}
function blockCategoryLabel(cat: BlockCategory) {
	return BLOCK_CATEGORIES.find((c) => c.value === cat)?.label || cat;
}
function statusChipClass(status: string) {
	if (status === 'published') return 'bg-success/10 text-success dark:bg-success/30 dark:text-success';
	if (status === 'draft') return 'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning';
	return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}
function wordCount(text: string | null) {
	if (!text) return 0;
	return text.trim().split(/\s+/).filter(Boolean).length;
}
function phaseCount(t: ServiceTemplate) {
	const p = t.scope_payload;
	if (p && Array.isArray(p.phases)) return p.phases.length;
	return 0;
}
function formatMoney(n: number) {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function categoryBadgeStyle(color: string | null | undefined) {
	if (color) return { backgroundColor: color, color: legibleTextOn(color) };
	const a = workAccent.value;
	return {
		backgroundColor: `hsl(${a.h} ${a.s}% ${a.l}%)`,
		color: legibleTextOnHsl(a.h, a.s, a.l),
	};
}

// ─── Fetch ───────────────────────────────────────────────────────────────
async function fetchBlocks() {
	if (!selectedOrg.value) return;
	loadingBlocks.value = true;
	try { blocks.value = await listBlocks({ includeArchived: true }); } finally { loadingBlocks.value = false; }
}
async function fetchOfferings() {
	if (!selectedOrg.value) return;
	loadingOfferings.value = true;
	try { offerings.value = await listOfferings({ includeArchived: true }); } finally { loadingOfferings.value = false; }
}

// ─── Modal handlers ─────────────────────────────────────────────────────
function openNew() {
	if (activeTab.value === 'blocks') {
		selectedBlock.value = null;
		blockModalOpen.value = true;
	} else {
		selectedOffering.value = null;
		offeringModalOpen.value = true;
	}
}
function openEditBlock(b: DocumentBlock) { selectedBlock.value = b; blockModalOpen.value = true; }
function openEditOffering(t: ServiceTemplate) { selectedOffering.value = t; offeringModalOpen.value = true; }

function onBlockCreated(b: DocumentBlock) { blocks.value = [b, ...blocks.value]; }
function onBlockUpdated(b: DocumentBlock) {
	const idx = blocks.value.findIndex((x) => x.id === b.id);
	if (idx !== -1) blocks.value[idx] = b;
}
function onBlockDeleted(id: string) { blocks.value = blocks.value.filter((b) => b.id !== id); }

function onOfferingCreated(t: ServiceTemplate) { offerings.value = [t, ...offerings.value]; }
function onOfferingUpdated(t: ServiceTemplate) {
	const idx = offerings.value.findIndex((x) => x.id === t.id);
	if (idx !== -1) offerings.value[idx] = t;
}
function onOfferingDeleted(id: string | number) { offerings.value = offerings.value.filter((t) => t.id !== id); }

watch(() => selectedOrg.value, () => {
	fetchBlocks();
	fetchOfferings();
}, { immediate: true });
</script>

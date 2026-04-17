<template>
	<div class="w-full mx-auto relative leads-board">
		<!-- Loading Overlay -->
		<transition name="fade">
			<div
				v-if="isLoading"
				class="absolute h-svh inset-0 bg-white/70 dark:bg-gray-800/70 z-50 flex items-center justify-center"
			>
				<LayoutLoader text="Loading Pipeline" />
			</div>
		</transition>

		<!-- Filters -->
		<div class="w-full flex flex-col md:flex-row items-start md:items-center justify-between mb-4 xl:mb-8 xl:mt-2 px-4 md:px-0 gap-4 pt-4">
			<div class="flex items-center gap-3">
				<UiActionButton icon="lucide:plus" @click="showNewLeadModal = true">
					New Lead
				</UiActionButton>
			</div>

			<div class="hidden md:flex items-center gap-4">
				<button
					class="flex items-center space-x-2 cursor-pointer"
					@click="filterByAssignedTo = !filterByAssignedTo"
				>
					<UToggle :model-value="filterByAssignedTo" />
					<span
						class="text-[10px] uppercase select-none whitespace-nowrap"
						:class="filterByAssignedTo ? 'text-foreground font-semibold' : 'text-muted-foreground'"
					>
						{{ filterByAssignedTo ? 'My Leads' : 'All Leads' }}
					</span>
				</button>
				<UInput
					v-model="searchQuery"
					icon="i-heroicons-magnifying-glass"
					placeholder="Search..."
					size="sm"
					class="w-40"
				/>
				<UInput
					v-model="tagFilter"
					icon="i-heroicons-tag"
					placeholder="Filter by tag"
					size="sm"
					class="w-36"
				/>
				<UButton
					icon="i-heroicons-archive-box"
					size="xs"
					:color="showArchived ? 'primary' : 'gray'"
					:variant="showArchived ? 'soft' : 'outline'"
					@click="toggleArchived"
					class="uppercase text-[10px] border border-border/60"
				>
					{{ showArchived ? 'View Board' : 'Archived' }}
				</UButton>
				<transition name="fade">
					<UIcon v-if="isFetching" name="i-heroicons-arrow-path" class="w-4 h-4 text-muted-foreground animate-spin" />
				</transition>
			</div>
		</div>

		<!-- Archived / Junk View -->
		<transition name="fade" mode="out-in">
		<div v-if="showArchived" key="archived-view" class="px-4">
			<div class="bg-card border border-border rounded-2xl p-6">
				<div class="flex items-center justify-between mb-6">
					<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
						<UIcon name="i-heroicons-archive-box" class="w-4 h-4" />
						Archived & Junk Leads
						<span v-if="archivedLeads.length" class="text-xs font-normal text-muted-foreground">({{ archivedLeads.length }})</span>
					</h3>
				</div>

				<div v-if="isLoadingArchived" class="flex items-center justify-center py-12">
					<LayoutLoader text="Loading archived leads" />
				</div>

				<div v-else-if="!archivedLeads.length" class="text-center py-12 text-muted-foreground">
					<UIcon name="i-heroicons-archive-box" class="w-8 h-8 mx-auto mb-2 opacity-40" />
					<p class="text-sm">No archived or junk leads</p>
				</div>

				<div v-else class="space-y-2">
					<div
						v-for="lead in archivedLeads"
						:key="lead.id"
						class="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors stagger-item"
					>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-foreground truncate">
								{{ lead.related_contact?.first_name }} {{ lead.related_contact?.last_name }}
								<span v-if="lead.related_contact?.company" class="text-muted-foreground"> · {{ lead.related_contact.company }}</span>
							</p>
							<div class="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground uppercase">
								<span class="flex items-center gap-1">
									<span
										class="inline-block w-1.5 h-1.5 rounded-full"
										:class="lead.status === 'junk' ? 'bg-red-500' : 'bg-muted-foreground'"
									/>
									{{ lead.status === 'junk' ? 'Junk' : 'Archived' }}
								</span>
								<span v-if="lead.source" class="flex items-center gap-1">
									Source: {{ lead.source }}
								</span>
								<span v-if="lead.date_updated" class="flex items-center gap-1">
									<UIcon name="i-heroicons-clock" class="w-3 h-3" />
									{{ new Date(lead.date_updated).toLocaleDateString() }}
								</span>
							</div>
						</div>
						<div class="flex items-center gap-1 ml-3">
							<UTooltip text="Restore to Pipeline" :popper="{ arrow: true }">
								<UButton
									icon="i-heroicons-arrow-uturn-left"
									size="xs"
									color="gray"
									variant="soft"
									@click="handleRestore(lead.id)"
								/>
							</UTooltip>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div v-else key="board-view">
		<!-- Won/Lost Summary -->
		<div class="flex items-center gap-3 px-4 mb-4">
			<div class="flex items-center gap-1.5 text-[10px] font-medium">
				<span class="w-2 h-2 rounded-full bg-emerald-500" />
				<span class="text-emerald-600">{{ wonCount }} Won</span>
			</div>
			<div class="flex items-center gap-1.5 text-[10px] font-medium">
				<span class="w-2 h-2 rounded-full bg-red-500" />
				<span class="text-red-500">{{ lostCount }} Lost</span>
			</div>
		</div>

		<!-- Mobile Column Navigation -->
		<div
			v-if="isMobile"
			class="flex items-center justify-between mb-4 mx-4 rounded-xl bg-card border border-border px-4 gap-4 py-3 text-foreground shadow-sm"
		>
			<UIcon name="i-heroicons-chevron-left" class="w-5 h-5 cursor-pointer" @click="previousColumn" />
			<h3 class="text-sm font-medium uppercase tracking-wide">
				{{ columns.find(col => col.id === activeColumn)?.name }}
			</h3>
			<UIcon name="i-heroicons-chevron-right" class="w-5 h-5 cursor-pointer" @click="nextColumn" />
		</div>

		<!-- Main Board -->
		<div
			class="ios-card !p-0 w-full flex min-h-svh overflow-x-auto scrollbar-hide"
			@touchstart="handleTouchStart"
			@touchend="handleTouchEnd"
		>
			<div
				v-for="column in columns"
				:key="column.id"
				class="flex-grow w-full basis-0 h-full min-h-dvh transition-transform duration-300 ease-in-out min-w-[300px]"
				:class="{
					'hidden md:block': isMobile && column.id !== activeColumn,
					'transform translate-x-0': !isMobile || column.id === activeColumn,
				}"
			>
				<!-- Column Header -->
				<div class="p-3 border-b border-border/50">
					<div class="flex items-center gap-3">
						<div class="h-5 w-1 rounded-full" :style="{ backgroundColor: `var(--${column.color})` }" />
						<h3 class="text-[10px] font-bold uppercase tracking-wider text-foreground flex-1">{{ column.name }}</h3>
						<span
							class="text-[10px] font-bold tabular-nums min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5"
							:style="{ backgroundColor: `var(--${column.color})`, color: 'var(--darkBlue)' }"
						>
							{{ localLeads[column.id]?.length || 0 }}
						</span>
					</div>
				</div>

				<!-- Loading Skeletons -->
				<div
					v-if="isLoading && !localLeads[column.id]?.length"
					class="min-h-[90svh] p-2 bg-muted"
				>
					<div class="space-y-3">
						<USkeleton v-for="n in 4" :key="n" class="h-28 mb-4 w-full" />
					</div>
				</div>

				<!-- Draggable Column Content -->
				<VueDraggable
					v-else
					v-model="localLeads[column.id]"
					:group="{ name: 'leads' }"
					item-key="id"
					:delay="150"
					:delay-on-touch-only="true"
					class="min-h-[80svh] p-2 space-y-2 bg-muted/30"
					:class="{ 'bg-primary/5': isDragging }"
					ghost-class="ghost"
					chosen-class="chosen"
					drag-class="drag"
					@start="onDragStart"
					@end="onDragEnd"
					@change="(event) => handleDragChange(column.id, event)"
				>
					<template #item="{ element }">
						<div :id="element.id" class="lead-wrapper stagger-item">
							<div class="relative">
								<div
									v-if="updatingLeads.has(element.id)"
									class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 rounded-lg flex items-center justify-center z-10"
								>
									<LayoutLoader />
								</div>
								<LeadsExpandableCard :element="element" />
							</div>
						</div>
					</template>
				</VueDraggable>
			</div>
		</div>

		<!-- Empty state -->
		<div v-if="!isLoading && hasNoLeads" class="flex items-center justify-center min-h-[60vh]">
			<div class="text-center max-w-sm">
				<UIcon name="i-heroicons-funnel" class="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
				<p class="text-base font-medium text-foreground">No leads in pipeline</p>
				<p class="text-sm text-muted-foreground mt-1.5">Create your first lead to get started.</p>
			</div>
		</div>

		</div>
		</transition>

		<!-- New Lead Modal -->
		<LeadsFormModal
			v-model="showNewLeadModal"
			@created="handleLeadCreated"
		/>

		<!-- Board-level Conversion Modal (for drag-to-won) -->
		<LeadsConversionModal
			v-model="showConversionModal"
			:lead="pendingConversionLead"
			@converted="handleConverted"
			@cancelled="handleConversionCancelled"
		/>

		<!-- Board-level Lost Reason Modal (for drag-to-lost) -->
		<LeadsLostReasonModal
			v-model="showLostReasonModal"
			:lead="pendingLostLead"
			@lost="handleLostConfirmed"
			@cancelled="handleLostCancelled"
		/>
	</div>
</template>

<script setup>
import VueDraggable from 'vuedraggable';
import { useDebounceFn } from '@vueuse/core';
import { LEAD_PIPELINE_STAGES, LEAD_STAGE_LABELS, LEAD_STAGE_COLUMN_COLORS } from '~~/shared/leads';

const { getLeadsByStage, updateLeadStageWithAutomation, archiveLead, junkLead, restoreLead, getArchivedLeads } = useLeads();
const { registerRefreshCallback, triggerRefresh } = useLeadsStore();
const { user } = useDirectusAuth();
const { triggerHaptic } = useHaptic();
const toast = useToast();

// Build columns from config
const columns = LEAD_PIPELINE_STAGES.map(stage => ({
	id: stage,
	name: LEAD_STAGE_LABELS[stage],
	color: LEAD_STAGE_COLUMN_COLORS[stage],
}));

// Mobile navigation
const {
	isMobile,
	activeColumn,
	handleTouchStart,
	handleTouchEnd,
	nextColumn,
	previousColumn,
	setupMobileDetection,
} = useMobileBoardNavigation({
	columns,
	breakpoint: 768,
	swipeThreshold: 50,
});

// State
const isLoading = ref(true);
const isFetching = ref(false);
const isDragging = ref(false);
const filterByAssignedTo = ref(false);
const searchQuery = ref('');
const tagFilter = ref('');
const updatingLeads = ref(new Set());
const showNewLeadModal = ref(false);

// Archive/Junk state
const showArchived = ref(false);
const archivedLeads = ref([]);
const isLoadingArchived = ref(false);

async function toggleArchived() {
	showArchived.value = !showArchived.value;
	if (showArchived.value) {
		await loadArchivedLeads();
	}
}

async function loadArchivedLeads() {
	isLoadingArchived.value = true;
	try {
		archivedLeads.value = await getArchivedLeads() || [];
	} catch { archivedLeads.value = []; }
	finally { isLoadingArchived.value = false; }
}

async function handleRestore(leadId) {
	try {
		await restoreLead(leadId);
		archivedLeads.value = archivedLeads.value.filter(l => l.id !== leadId);
		toast.add({ title: 'Lead restored to pipeline', color: 'green' });
		fetchLeads();
	} catch (err) {
		console.error('Failed to restore lead:', err);
		toast.add({ title: 'Failed to restore lead', color: 'red' });
	}
}

// Terminal stage modals
const showConversionModal = ref(false);
const showLostReasonModal = ref(false);
const pendingConversionLead = ref(null);
const pendingLostLead = ref(null);
const pendingDragRevert = ref(null);

// Initialize localLeads with empty arrays for each pipeline stage
const localLeads = ref(
	LEAD_PIPELINE_STAGES.reduce((acc, stage) => {
		acc[stage] = [];
		return acc;
	}, {}),
);

// Won/Lost counts
const wonCount = ref(0);
const lostCount = ref(0);

const hasNoLeads = computed(() => {
	return LEAD_PIPELINE_STAGES.every(stage => !localLeads.value[stage]?.length);
});

// Filter storage
const assignedToStorage = useStorageSync('leadFilterAssignedTo');

// Debounced search
const debouncedFetch = useDebounceFn(() => fetchLeads(), 300);
watch(searchQuery, () => debouncedFetch());
watch(tagFilter, () => debouncedFetch());
watch(filterByAssignedTo, (newVal) => {
	assignedToStorage.setValue(newVal);
	fetchLeads();
});

async function fetchLeads() {
	isFetching.value = true;

	try {
		const filters = {};
		if (searchQuery.value) filters.search = searchQuery.value;
		if (tagFilter.value.trim()) filters.tag = tagFilter.value.trim();
		if (filterByAssignedTo.value && user.value?.id) {
			filters.assigned_to = user.value.id;
		}

		const grouped = await getLeadsByStage(filters);

		// Update pipeline columns
		for (const stage of LEAD_PIPELINE_STAGES) {
			localLeads.value[stage] = grouped[stage] || [];
		}

		// Update terminal counts
		wonCount.value = grouped.won?.length || 0;
		lostCount.value = grouped.lost?.length || 0;
	} catch (err) {
		console.error('Failed to fetch leads:', err);
		toast.add({ title: 'Failed to load pipeline', color: 'red' });
	} finally {
		isLoading.value = false;
		isFetching.value = false;
	}
}

// Drag handlers
function onDragStart() {
	isDragging.value = true;
}

function onDragEnd() {
	isDragging.value = false;
}

async function handleDragChange(columnId, event) {
	if (!event.added) return;

	const lead = event.added.element;
	const newStage = columnId;
	const oldStage = lead.stage;

	updatingLeads.value.add(lead.id);

	try {
		const result = await updateLeadStageWithAutomation(lead.id, newStage, oldStage);

		if (result.requiresConversion) {
			// Store revert info and open conversion modal
			pendingConversionLead.value = lead;
			pendingDragRevert.value = { leadId: lead.id, fromColumn: columnId, toColumn: oldStage };
			showConversionModal.value = true;
			updatingLeads.value.delete(lead.id);
			return;
		}

		if (result.requiresLostReason) {
			// Store revert info and open lost reason modal
			pendingLostLead.value = lead;
			pendingDragRevert.value = { leadId: lead.id, fromColumn: columnId, toColumn: oldStage };
			showLostReasonModal.value = true;
			updatingLeads.value.delete(lead.id);
			return;
		}

		// Update local lead state
		lead.stage = newStage;
		triggerHaptic([100, 30, 100]);
	} catch (err) {
		console.error('Error updating lead stage:', err);

		// Revert: move back to original column
		localLeads.value[oldStage].push(lead);
		localLeads.value[columnId] = localLeads.value[columnId].filter(l => l.id !== lead.id);

		toast.add({ title: 'Failed to update lead', description: 'Please try again.', color: 'red' });
	} finally {
		updatingLeads.value.delete(lead.id);
	}
}

function revertDrag() {
	if (!pendingDragRevert.value) return;
	const { leadId, fromColumn, toColumn } = pendingDragRevert.value;
	const lead = localLeads.value[fromColumn]?.find(l => l.id === leadId);
	if (lead) {
		localLeads.value[fromColumn] = localLeads.value[fromColumn].filter(l => l.id !== leadId);
		localLeads.value[toColumn].push(lead);
	}
	pendingDragRevert.value = null;
}

function handleConverted() {
	// Lead is now won — remove from board, refresh
	if (pendingDragRevert.value) {
		const { leadId, fromColumn } = pendingDragRevert.value;
		localLeads.value[fromColumn] = localLeads.value[fromColumn].filter(l => l.id !== leadId);
	}
	pendingDragRevert.value = null;
	pendingConversionLead.value = null;
	fetchLeads();
}

function handleConversionCancelled() {
	revertDrag();
	pendingConversionLead.value = null;
}

function handleLostConfirmed() {
	// Lead is now lost — remove from board, refresh
	if (pendingDragRevert.value) {
		const { leadId, fromColumn } = pendingDragRevert.value;
		localLeads.value[fromColumn] = localLeads.value[fromColumn].filter(l => l.id !== leadId);
	}
	pendingDragRevert.value = null;
	pendingLostLead.value = null;
	fetchLeads();
}

function handleLostCancelled() {
	revertDrag();
	pendingLostLead.value = null;
}

function handleLeadCreated() {
	fetchLeads();
}

// Register refresh callback for child modals
registerRefreshCallback(fetchLeads);

let cleanupMobileDetection = null;

onMounted(async () => {
	// Restore filter
	const storedAssigned = assignedToStorage.getValue();
	if (storedAssigned) {
		filterByAssignedTo.value = storedAssigned === true || storedAssigned === 'true';
	}

	cleanupMobileDetection = setupMobileDetection();
	await fetchLeads();
});

onUnmounted(() => {
	if (cleanupMobileDetection) cleanupMobileDetection();
});
</script>

<style scoped>
.ghost {
	opacity: 0.4;
	background: hsl(var(--primary) / 0.1);
	border-radius: 12px;
}
.chosen {
	opacity: 0.8;
}
.drag {
	opacity: 0.9;
}
</style>

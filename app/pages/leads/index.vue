<script setup lang="ts">
import type { LeadStage } from '~~/shared/leads';
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Leads | Earnest' });

const { getLeads, getLeadStats } = useLeads();
const { isOrgManagerOrAbove } = useOrgRole();

// View toggle — useCookie is SSR-safe (no hydration mismatch)
const viewCookie = useCookie('leadView', { default: () => 'board' });
const activeView = ref(viewCookie.value || 'board');
watch(activeView, (val) => { viewCookie.value = val; });

const viewOptions = [
	{ value: 'board', label: 'Board', icon: 'lucide:columns-3' },
	{ value: 'grid', label: 'Grid', icon: 'lucide:layout-grid' },
];

const allLeads = ref<any[]>([]);
const stats = ref({
	total: 0,
	by_stage: {} as Record<LeadStage, number>,
	avg_score: 0,
	pipeline_value: 0,
	new_this_week: 0,
});
const loading = ref(true);
const search = ref('');
const stageFilter = ref('');
const priorityFilter = ref('');

async function fetchData() {
	loading.value = true;
	try {
		const [leadsResult, statsResult] = await Promise.all([
			getLeads({
				search: search.value || undefined,
				stage: (stageFilter.value || undefined) as LeadStage | undefined,
				priority: priorityFilter.value || undefined,
			} as any),
			getLeadStats(),
		]);
		allLeads.value = leadsResult as any[];
		stats.value = statsResult;
	} catch (e) {
		console.error('Failed to load leads:', e);
	} finally {
		loading.value = false;
	}
}

const debouncedSearch = useDebounceFn(() => fetchData(), 300);
watch(search, () => debouncedSearch());
watch([stageFilter, priorityFilter], () => fetchData());

onMounted(() => {
	fetchData();
});
</script>

<template>
	<LayoutPageContainer>
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-bold t-text">Leads</h1>
				<p class="text-sm t-text-secondary">{{ stats.total }} total lead{{ stats.total === 1 ? '' : 's' }}</p>
			</div>
			<NuxtLink
				v-if="isOrgManagerOrAbove"
				to="/leads/automations"
				class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
			>
				<Icon name="lucide:zap" class="w-3.5 h-3.5" />
				Automations
			</NuxtLink>
		</div>

		<!-- Stats -->
		<LeadsLeadStats :stats="stats" class="mb-6" />

		<!-- View Toggle -->
		<UiPillToggle v-model="activeView" :options="viewOptions" class="mb-6" />

		<!-- Board View -->
		<div v-show="activeView === 'board'">
			<LeadsPipelineBoard />
		</div>

		<!-- Grid View -->
		<div v-show="activeView !== 'board'">
			<!-- Filters -->
			<LeadsLeadFilters
				v-model:search="search"
				v-model:stage="stageFilter"
				v-model:priority="priorityFilter"
				class="mb-4"
				@clear="fetchData"
			/>

			<!-- Loading -->
			<div v-if="loading" class="flex items-center justify-center py-20">
				<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
			</div>

			<!-- Lead Grid -->
			<div v-else-if="allLeads.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				<LeadsLeadCard
					v-for="lead in allLeads"
					:key="lead.id"
					:lead="lead"
					@click="navigateTo(`/leads/${lead.id}`)"
				/>
			</div>

			<!-- Empty -->
			<div v-else class="text-center py-20">
				<UIcon name="i-heroicons-inbox" class="w-12 h-12 t-text-muted mx-auto mb-3" />
				<p class="t-text-secondary">No leads found</p>
				<p class="text-xs t-text-muted mt-1">Leads from your website forms will appear here</p>
			</div>
		</div>

	</LayoutPageContainer>
</template>

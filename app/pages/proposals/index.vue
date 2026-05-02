<script setup lang="ts">
import type { ProposalStatus } from '~~/shared/proposals-enhanced';
import { PROPOSAL_STATUS_LABELS } from '~~/shared/proposals-enhanced';
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Proposals | Earnest' });

const route = useRoute();
const router = useRouter();
const { getProposals } = useProposals();

const allProposals = ref<any[]>([]);
const loading = ref(true);
const search = ref('');
const statusFilter = ref('');
const showCreateModal = ref(false);
const newFromLeadId = ref<number | string | null>(null);

const statusOptions = [
	{ value: '', label: 'All Statuses' },
	...Object.entries(PROPOSAL_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

async function fetchData() {
	loading.value = true;
	try {
		allProposals.value = await getProposals({
			search: search.value || undefined,
			proposal_status: (statusFilter.value || undefined) as ProposalStatus | undefined,
		}) as any[];
	} catch (e) {
		console.error('Failed to load proposals:', e);
	} finally {
		loading.value = false;
	}
}

const debouncedSearch = useDebounceFn(() => fetchData(), 300);
watch(search, () => debouncedSearch());
watch(statusFilter, () => fetchData());

function openCreate(leadId?: number | string | null) {
	newFromLeadId.value = leadId || null;
	showCreateModal.value = true;
}

async function onProposalCreated(created: any) {
	// Clear any ?new/?lead query params so reload doesn't reopen
	if (route.query.new || route.query.lead) {
		await router.replace({ query: {} });
	}
	newFromLeadId.value = null;
	if (created?.id) {
		router.push(`/proposals/${created.id}`);
	} else {
		await fetchData();
	}
}

onMounted(async () => {
	await fetchData();
	// Support /proposals?new=1&lead=X deep-link (formerly /proposals/new?lead=X)
	if (route.query.new) {
		openCreate(route.query.lead as string | undefined);
	}
});
</script>

<template>
	<LayoutPageContainer>
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-bold t-text">Proposals</h1>
				<p class="text-sm t-text-secondary">{{ allProposals.length }} proposal{{ allProposals.length === 1 ? '' : 's' }}</p>
			</div>
			<UButton icon="i-heroicons-plus" size="sm" @click="openCreate()">New Proposal</UButton>
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-2 mb-4">
			<UInput
				v-model="search"
				icon="i-heroicons-magnifying-glass"
				placeholder="Search proposals..."
				size="sm"
				class="w-48"
			/>
			<USelectMenu
				v-model="statusFilter"
				:options="statusOptions"
				value-attribute="value"
				option-attribute="label"
				placeholder="Status"
				size="sm"
				class="w-36"
			/>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
		</div>

		<!-- Grid -->
		<div v-else-if="allProposals.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			<ProposalsProposalCard
				v-for="proposal in allProposals"
				:key="proposal.id"
				:proposal="proposal"
				@click="navigateTo(`/proposals/${proposal.id}`)"
			/>
		</div>

		<!-- Empty -->
		<div v-else class="text-center py-20">
			<UIcon name="i-heroicons-document-text" class="w-12 h-12 t-text-muted mx-auto mb-3" />
			<p class="t-text-secondary">No proposals yet</p>
			<button class="text-xs text-primary mt-2 inline-block hover:underline" @click="openCreate()">
				Create your first proposal
			</button>
		</div>

		<!-- Create Modal -->
		<ProposalsFormModal
			v-model="showCreateModal"
			:lead-id="newFromLeadId"
			@created="onProposalCreated"
		/>
	</LayoutPageContainer>
</template>

<script setup lang="ts">
import type { ContractStatus } from '~~/shared/contracts';
import { CONTRACT_STATUS_LABELS } from '~~/shared/contracts';
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Contracts | Earnest' });

const route = useRoute();
const router = useRouter();
const { getContracts } = useContracts();

const allContracts = ref<any[]>([]);
const loading = ref(true);
const search = ref('');
const statusFilter = ref('');
const showCreateModal = ref(false);

const statusOptions = [
	{ value: '', label: 'All Statuses' },
	...Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

async function fetchData() {
	loading.value = true;
	try {
		allContracts.value = await getContracts({
			search: search.value || undefined,
			contract_status: (statusFilter.value || undefined) as ContractStatus | undefined,
		}) as any[];
	} catch (e) {
		console.error('Failed to load contracts:', e);
	} finally {
		loading.value = false;
	}
}

const debouncedSearch = useDebounceFn(() => fetchData(), 300);
watch(search, () => debouncedSearch());
watch(statusFilter, () => fetchData());

async function onContractCreated(created: any) {
	if (route.query.new) {
		await router.replace({ query: {} });
	}
	if (created?.id) {
		router.push(`/contracts/${created.id}`);
	} else {
		await fetchData();
	}
}

onMounted(async () => {
	await fetchData();
	if (route.query.new) {
		showCreateModal.value = true;
	}
});
</script>

<template>
	<div class="page__inner px-6 max-w-7xl mx-auto">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-bold t-text">Contracts</h1>
				<p class="text-sm t-text-secondary">{{ allContracts.length }} contract{{ allContracts.length === 1 ? '' : 's' }}</p>
			</div>
			<UButton icon="i-heroicons-plus" size="sm" @click="showCreateModal = true">New Contract</UButton>
		</div>

		<div class="flex flex-wrap items-center gap-2 mb-4">
			<UInput
				v-model="search"
				icon="i-heroicons-magnifying-glass"
				placeholder="Search contracts..."
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

		<div v-if="loading" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
		</div>

		<div v-else-if="allContracts.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			<ContractsContractCard
				v-for="contract in allContracts"
				:key="contract.id"
				:contract="contract"
				@click="navigateTo(`/contracts/${contract.id}`)"
			/>
		</div>

		<div v-else class="text-center py-20">
			<UIcon name="i-heroicons-document-text" class="w-12 h-12 t-text-muted mx-auto mb-3" />
			<p class="t-text-secondary">No contracts yet</p>
			<button class="text-xs text-primary mt-2 inline-block hover:underline" @click="showCreateModal = true">
				Create your first contract
			</button>
		</div>

		<ContractsFormModal
			v-model="showCreateModal"
			@created="onContractCreated"
		/>
	</div>
</template>

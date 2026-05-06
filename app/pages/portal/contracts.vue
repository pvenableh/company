<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Contracts | Client Portal' });

const { selectedOrg } = useOrganization();

const contractItems = usePortalItems('contracts');

const loading = ref(true);
const contracts = ref<any[]>([]);

const statusConfig: Record<string, { label: string; classes: string; icon: string }> = {
	draft:   { label: 'Draft',    classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',      icon: 'lucide:file' },
	sent:    { label: 'Sent',     classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',   icon: 'lucide:send' },
	signed:  { label: 'Signed',   classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: 'lucide:check-circle-2' },
	void:    { label: 'Void',     classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',      icon: 'lucide:x-circle' },
	expired: { label: 'Expired',  classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: 'lucide:clock' },
};

async function loadContracts() {
	if (!selectedOrg.value) return;
	loading.value = true;

	try {
		contracts.value = await contractItems.list({
			filter: {
				_and: [
					{ organization: { _eq: selectedOrg.value } },
					{ contract_status: { _nin: ['draft'] } },
				],
			},
			fields: [
				'id',
				'title',
				'contract_status',
				'date_created',
				'date_updated',
				'contact.first_name',
				'contact.last_name',
				'contact.company',
				'proposal.id',
				'proposal.title',
			],
			sort: ['-date_created'],
			limit: 100,
		});
	} catch (err) {
		console.error('Failed to load contracts:', err);
	} finally {
		loading.value = false;
	}
}

function formatDate(d: string) {
	if (!d) return '—';
	return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

onMounted(() => loadContracts());
watch(() => selectedOrg.value, () => loadContracts());
</script>

<template>
	<LayoutPageContainer>
		<div class="mb-6">
			<h1 class="text-xl font-semibold">Contracts</h1>
			<p class="text-sm text-muted-foreground mt-0.5">View and sign your contracts.</p>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty State -->
		<div v-else-if="!contracts.length" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:file-badge" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">No contracts yet.</p>
		</div>

		<!-- Contract List -->
		<div v-else class="space-y-2">
			<NuxtLink
				v-for="contract in contracts"
				:key="contract.id"
				:to="`/contracts/preview/${contract.id}`"
				class="ios-card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group"
			>
				<div class="flex items-center justify-center w-10 h-10 rounded-full bg-muted/60 shrink-0">
					<Icon
						:name="(statusConfig[contract.contract_status] ?? statusConfig.draft).icon"
						class="w-5 h-5"
						:class="contract.contract_status === 'signed' ? 'text-green-500' : 'text-muted-foreground'"
					/>
				</div>

				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2 mb-0.5">
						<span class="text-sm font-medium truncate">{{ contract.title || 'Contract' }}</span>
						<span
							class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full shrink-0"
							:class="(statusConfig[contract.contract_status] ?? statusConfig.draft).classes"
						>
							{{ statusConfig[contract.contract_status]?.label ?? contract.contract_status }}
						</span>
					</div>
					<div class="flex items-center gap-3 text-xs text-muted-foreground">
						<span v-if="contract.contact?.first_name">
							{{ contract.contact.first_name }} {{ contract.contact.last_name }}
							<template v-if="contract.contact.company"> · {{ contract.contact.company }}</template>
						</span>
						<span>{{ formatDate(contract.date_created) }}</span>
					</div>
					<p v-if="contract.proposal?.title" class="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
						<Icon name="lucide:link" class="w-3 h-3" />
						{{ contract.proposal.title }}
					</p>
				</div>

				<!-- Sign CTA for sent contracts -->
				<div class="shrink-0">
					<span
						v-if="contract.contract_status === 'sent'"
						class="text-xs font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full"
					>
						Sign
					</span>
					<Icon v-else name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
				</div>
			</NuxtLink>
		</div>
	</LayoutPageContainer>
</template>

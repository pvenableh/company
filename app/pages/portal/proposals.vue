<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Proposals | Client Portal' });

const { selectedOrg } = useOrganization();
const { clientScope } = useOrgRole();

const proposalItems = usePortalItems('proposals');

const loading = ref(true);
const proposals = ref<any[]>([]);

const statusConfig: Record<string, { label: string; classes: string }> = {
	draft:    { label: 'Draft',    classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
	sent:     { label: 'Sent',     classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
	viewed:   { label: 'Viewed',   classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
	accepted: { label: 'Accepted', classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
	declined: { label: 'Declined', classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

async function loadProposals() {
	if (!selectedOrg.value) return;
	loading.value = true;

	try {
		const conditions: any[] = [
			{ organization: { _eq: selectedOrg.value } },
			{ proposal_status: { _nin: ['draft'] } },
		];

		proposals.value = await proposalItems.list({
			filter: { _and: conditions },
			fields: [
				'id',
				'title',
				'proposal_status',
				'date_created',
				'date_updated',
				'contact.first_name',
				'contact.last_name',
				'contact.company',
				'total_value',
			],
			sort: ['-date_created'],
			limit: 100,
		});
	} catch (err) {
		console.error('Failed to load proposals:', err);
	} finally {
		loading.value = false;
	}
}

function formatDate(d: string) {
	if (!d) return '—';
	return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(amount: number | null | undefined) {
	if (!amount) return null;
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

onMounted(() => loadProposals());
watch(() => selectedOrg.value, () => loadProposals());
</script>

<template>
	<LayoutPageContainer>
		<div class="mb-6">
			<h1 class="text-xl font-semibold">Proposals</h1>
			<p class="text-sm text-muted-foreground mt-0.5">Review proposals shared with you.</p>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty State -->
		<div v-else-if="!proposals.length" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:file-signature" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">No proposals yet.</p>
		</div>

		<!-- Proposal List -->
		<div v-else class="space-y-2">
			<NuxtLink
				v-for="proposal in proposals"
				:key="proposal.id"
				:to="`/proposals/preview/${proposal.id}`"
				class="ios-card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group"
			>
				<div class="flex items-center justify-center w-10 h-10 rounded-full bg-muted/60 shrink-0">
					<Icon name="lucide:file-signature" class="w-5 h-5 text-muted-foreground" />
				</div>

				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2 mb-0.5">
						<span class="text-sm font-medium truncate">{{ proposal.title || 'Proposal' }}</span>
						<span
							class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full shrink-0"
							:class="(statusConfig[proposal.proposal_status] ?? statusConfig.draft).classes"
						>
							{{ statusConfig[proposal.proposal_status]?.label ?? proposal.proposal_status }}
						</span>
					</div>
					<div class="flex items-center gap-3 text-xs text-muted-foreground">
						<span v-if="proposal.contact?.first_name">
							{{ proposal.contact.first_name }} {{ proposal.contact.last_name }}
							<template v-if="proposal.contact.company"> · {{ proposal.contact.company }}</template>
						</span>
						<span>{{ formatDate(proposal.date_created) }}</span>
					</div>
				</div>

				<div v-if="proposal.total_value" class="text-right shrink-0">
					<p class="text-sm font-semibold">{{ formatCurrency(proposal.total_value) }}</p>
				</div>

				<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
			</NuxtLink>
		</div>
	</LayoutPageContainer>
</template>

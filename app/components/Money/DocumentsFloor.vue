<!--
  MoneyDocumentsFloor — the "Documents" floor inside /apps/money.

  Hosts the org-wide proposals + contracts lists with an internal tab
  strip. Lifted out of the orphan /proposals + /contracts pages and
  reused (without the tab strip) inside the ClientWorkspace and lead
  detail Documents tabs.

  Row clicks open the slide-over panels, not detail routes — see
  MoneyProposalsList / MoneyContractsList for the click handler.

  Parent owns the create modals (Money page header gets the "+ New"
  CTA, mirroring how + New Invoice is wired on the Invoices floor).
-->
<script setup lang="ts">
const props = defineProps<{
	/** Initial tab. Driven by `?tab=` on the host page; defaults to proposals. */
	initialTab?: 'proposals' | 'contracts';
}>();

const emit = defineEmits<{
	(e: 'tab-change', tab: 'proposals' | 'contracts'): void;
	(e: 'count', value: { proposals?: number; contracts?: number }): void;
}>();

const tab = ref<'proposals' | 'contracts'>(props.initialTab || 'proposals');
const proposalCount = ref<number>(0);
const contractCount = ref<number>(0);

watch(tab, (next) => emit('tab-change', next));

watch(() => props.initialTab, (next) => {
	if (next && next !== tab.value) tab.value = next;
});

function onProposalCount(n: number) {
	proposalCount.value = n;
	emit('count', { proposals: n, contracts: contractCount.value });
}
function onContractCount(n: number) {
	contractCount.value = n;
	emit('count', { proposals: proposalCount.value, contracts: n });
}

const proposalsRef = ref<any>(null);
const contractsRef = ref<any>(null);
function refresh() {
	proposalsRef.value?.refresh?.();
	contractsRef.value?.refresh?.();
}
defineExpose({ refresh, tab });
</script>

<template>
	<div class="space-y-4">
		<!-- Sub-tab pills — same chip shape as ClientTabsBar -->
		<div class="flex flex-wrap gap-1.5">
			<button
				type="button"
				class="inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-xs font-medium border transition-colors"
				:class="tab === 'proposals'
					? 'bg-primary text-primary-foreground border-primary'
					: 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'"
				@click="tab = 'proposals'"
			>
				<Icon name="lucide:file-text" class="w-3.5 h-3.5" />
				Proposals
				<span class="text-[10px] opacity-70 ml-0.5">{{ proposalCount }}</span>
			</button>
			<button
				type="button"
				class="inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-xs font-medium border transition-colors"
				:class="tab === 'contracts'
					? 'bg-primary text-primary-foreground border-primary'
					: 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'"
				@click="tab = 'contracts'"
			>
				<Icon name="lucide:file-signature" class="w-3.5 h-3.5" />
				Contracts
				<span class="text-[10px] opacity-70 ml-0.5">{{ contractCount }}</span>
			</button>
		</div>

		<div class="ios-card p-4 sm:p-6">
			<MoneyProposalsList
				v-show="tab === 'proposals'"
				ref="proposalsRef"
				:show-filters="true"
				@count="onProposalCount"
			/>
			<MoneyContractsList
				v-show="tab === 'contracts'"
				ref="contractsRef"
				:show-filters="true"
				@count="onContractCount"
			/>
		</div>
	</div>
</template>

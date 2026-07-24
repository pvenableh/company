<script setup lang="ts">
/*
  ProposalPipeline (Approach B) — every proposal in flight, and what you can learn
  from the ones that got away. A board of the pursuit lifecycle
  (Draft → Sent → Viewed → Cold → Won → Lost) for leads AND clients, with win-rate
  / open-value / cold-value KPIs and a loss-reason breakdown. Cold is derived (see
  shared/proposals). Marking a proposal Won/Lost captures the outcome + reason —
  the learning signal.
*/
import {
	proposalPursuitState, PROPOSAL_PIPELINE_COLUMNS, PROPOSAL_LOSS_REASONS, lossReasonLabel,
	type ProposalPursuitState,
} from '~~/shared/proposals';

const props = defineProps<{
	/** Optional client scope (embed on a client detail). Omit = whole org. */
	clientId?: string | null;
}>();

const { selectedOrg } = useOrganization();
const proposalItems = useDirectusItems('proposals');
const proposalSlide = useAppSlideOver('proposal');
const toast = useToast();

const rows = ref<any[]>([]);
const loading = ref(true);
const savingId = ref<string | null>(null);
const lostPickerId = ref<string | null>(null);

const toneText: Record<string, string> = {
	muted: 'text-muted-foreground', info: 'text-primary', view: 'text-violet-500 dark:text-violet-400',
	warn: 'text-warning', good: 'text-success', bad: 'text-destructive',
};
const toneDot: Record<string, string> = {
	muted: 'bg-muted-foreground/50', info: 'bg-primary', view: 'bg-violet-500',
	warn: 'bg-warning', good: 'bg-success', bad: 'bg-destructive',
};

async function load() {
	loading.value = true;
	try {
		const filter: any = { _and: [] };
		if (selectedOrg.value) filter._and.push({ organization: { _eq: selectedOrg.value } });
		if (props.clientId) filter._and.push({ client: { _eq: props.clientId } });
		rows.value = (await proposalItems.list({
			fields: [
				'id', 'title', 'total_value', 'proposal_status', 'date_sent', 'valid_until',
				'outcome_reason', 'date_created',
				'client.id', 'client.name',
				'lead.id', 'lead.related_contact.first_name', 'lead.related_contact.last_name',
				'contact.first_name', 'contact.last_name',
			],
			filter: filter._and.length ? filter : undefined,
			sort: ['-date_created'],
			limit: -1,
		}).catch(() => [])) as any[];
	} finally {
		loading.value = false;
	}
}
onMounted(load);
watch(() => [selectedOrg.value, props.clientId], load);

// Enrich each proposal with its derived pursuit state + a "who".
const enriched = computed(() => rows.value.map((p) => {
	const { state, isCold, daysOut } = proposalPursuitState(p);
	const leadName = p.lead?.related_contact
		? `${p.lead.related_contact.first_name || ''} ${p.lead.related_contact.last_name || ''}`.trim() : '';
	const contactName = p.contact ? `${p.contact.first_name || ''} ${p.contact.last_name || ''}`.trim() : '';
	return { ...p, _state: state, _isCold: isCold, _daysOut: daysOut, _who: p.client?.name || leadName || contactName || '—' };
}));

const columns = computed(() => PROPOSAL_PIPELINE_COLUMNS.map((c) => ({
	...c,
	items: enriched.value.filter((p) => p._state === c.key),
})));

const num = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const sumValue = (states: ProposalPursuitState[]) =>
	enriched.value.filter((p) => states.includes(p._state)).reduce((s, p) => s + (Number(p.total_value) || 0), 0);

const kpis = computed(() => {
	const won = enriched.value.filter((p) => p._state === 'won').length;
	const lost = enriched.value.filter((p) => p._state === 'lost').length;
	const decided = won + lost;
	return {
		winRate: decided ? Math.round((won / decided) * 100) : 0,
		openValue: sumValue(['sent', 'viewed', 'cold']),
		coldValue: sumValue(['cold']),
		coldCount: enriched.value.filter((p) => p._state === 'cold').length,
	};
});

// Loss reasons across lost + cold (the ones worth learning from).
const lossBreakdown = computed(() => {
	const pool = enriched.value.filter((p) => (p._state === 'lost' || p._state === 'cold') && p.outcome_reason);
	const counts = new Map<string, number>();
	for (const p of pool) counts.set(p.outcome_reason, (counts.get(p.outcome_reason) || 0) + 1);
	const total = pool.length || 1;
	return PROPOSAL_LOSS_REASONS
		.map((r) => ({ ...r, count: counts.get(r.value) || 0 }))
		.filter((r) => r.count > 0)
		.sort((a, b) => b.count - a.count)
		.map((r) => ({ ...r, pct: Math.round((r.count / total) * 100) }));
});

function expiryLabel(p: any): string {
	if (p._state === 'cold' && p._daysOut) return `${p._daysOut}d silent`;
	if (p.valid_until) {
		const d = new Date(p.valid_until); const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
		if (days < 0) return `expired ${Math.abs(days)}d`;
		if (days === 0) return 'expires today';
		return `${days}d left`;
	}
	return '';
}

async function mark(p: any, status: 'accepted' | 'rejected', reason?: string) {
	savingId.value = String(p.id);
	try {
		await proposalItems.update(String(p.id), {
			proposal_status: status,
			...(status === 'rejected' && reason ? { outcome_reason: reason } : {}),
		} as any);
		lostPickerId.value = null;
		toast.add({ title: status === 'accepted' ? 'Marked won' : 'Marked lost', color: 'green' });
		await load();
	} catch (e: any) {
		toast.add({ title: 'Could not update proposal', description: e?.message, color: 'red' });
	} finally {
		savingId.value = null;
	}
}

const markable = (state: ProposalPursuitState) => state === 'sent' || state === 'viewed' || state === 'cold';
</script>

<template>
	<div class="space-y-5">
		<!-- KPIs -->
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
			<div class="ios-card p-4">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Win rate</p>
				<p class="text-2xl font-bold tabular-nums text-success">{{ kpis.winRate }}%</p>
			</div>
			<div class="ios-card p-4">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Open value</p>
				<p class="text-2xl font-bold tabular-nums">{{ num(kpis.openValue) }}</p>
			</div>
			<div class="ios-card p-4">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Value gone cold</p>
				<p class="text-2xl font-bold tabular-nums" :class="kpis.coldValue ? 'text-warning' : ''">{{ num(kpis.coldValue) }}</p>
			</div>
			<div class="ios-card p-4">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Cold deals</p>
				<p class="text-2xl font-bold tabular-nums" :class="kpis.coldCount ? 'text-warning' : ''">{{ kpis.coldCount }}</p>
			</div>
		</div>

		<!-- Board -->
		<div v-if="loading" class="py-16 text-center text-sm text-muted-foreground">
			<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
		</div>
		<div v-else class="grid grid-cols-2 lg:grid-cols-6 gap-3">
			<div v-for="col in columns" :key="col.key" class="ios-card p-2.5 min-w-0">
				<div class="flex items-center gap-2 mb-2.5 px-1">
					<span class="w-2 h-2 rounded-sm shrink-0" :class="toneDot[col.tone]" />
					<span class="text-[10px] font-semibold uppercase tracking-wider" :class="toneText[col.tone]">{{ col.label }}</span>
					<span class="ml-auto text-[11px] text-muted-foreground tabular-nums">{{ col.items.length }}</span>
				</div>

				<div class="space-y-2 max-h-[30rem] overflow-y-auto -mx-0.5 px-0.5">
					<div
						v-for="p in col.items"
						:key="p.id"
						class="rounded-lg border border-border/60 bg-muted/10 p-2.5 hover:bg-muted/30 transition-colors"
					>
						<button type="button" class="w-full text-left" @click="proposalSlide.open(String(p.id))">
							<p class="text-[12.5px] font-medium leading-snug line-clamp-2">{{ p.title || 'Untitled' }}</p>
							<p class="text-[11px] text-muted-foreground truncate mt-0.5">{{ p._who }}</p>
							<div class="flex items-center justify-between gap-2 mt-1.5">
								<span class="text-[12px] font-semibold tabular-nums">{{ num(p.total_value) }}</span>
								<span class="text-[10px]" :class="p._isCold ? 'text-warning' : 'text-muted-foreground'">{{ expiryLabel(p) }}</span>
							</div>
							<span v-if="p.outcome_reason" class="inline-block mt-1.5 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full"
								:class="p._state === 'lost' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'">
								{{ lossReasonLabel(p.outcome_reason) }}
							</span>
						</button>

						<!-- Mark outcome (in-flight proposals only) -->
						<div v-if="markable(p._state)" class="mt-2 pt-2 border-t border-border/40">
							<div v-if="lostPickerId === String(p.id)" class="space-y-1.5">
								<p class="text-[10px] text-muted-foreground">Why was it lost?</p>
								<div class="flex flex-wrap gap-1">
									<button
										v-for="r in PROPOSAL_LOSS_REASONS"
										:key="r.value"
										type="button"
										class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 hover:bg-destructive/15 hover:text-destructive transition-colors"
										:disabled="savingId === String(p.id)"
										@click="mark(p, 'rejected', r.value)"
									>{{ r.label }}</button>
								</div>
								<button type="button" class="text-[10px] text-muted-foreground hover:text-foreground" @click="lostPickerId = null">Cancel</button>
							</div>
							<div v-else class="flex items-center gap-1.5">
								<button
									type="button"
									class="flex-1 text-[11px] font-medium py-1 rounded-md bg-success/10 text-success hover:bg-success/20 transition-colors"
									:disabled="savingId === String(p.id)"
									@click="mark(p, 'accepted')"
								>Won</button>
								<button
									type="button"
									class="flex-1 text-[11px] font-medium py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
									:disabled="savingId === String(p.id)"
									@click="lostPickerId = String(p.id)"
								>Lost</button>
							</div>
						</div>
					</div>

					<p v-if="!col.items.length" class="text-[11px] text-muted-foreground/60 text-center py-4">—</p>
				</div>
			</div>
		</div>

		<!-- Loss reasons -->
		<div v-if="lossBreakdown.length" class="ios-card p-5">
			<p class="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Why deals slip away</p>
			<div class="space-y-2">
				<div v-for="r in lossBreakdown" :key="r.value" class="grid grid-cols-[140px_1fr_40px] items-center gap-3 text-[12.5px]">
					<span class="truncate">{{ r.label }}</span>
					<span class="h-2 rounded-full bg-muted/50 overflow-hidden"><i class="block h-full bg-destructive" :style="{ width: r.pct + '%' }" /></span>
					<span class="text-right text-muted-foreground tabular-nums">{{ r.pct }}%</span>
				</div>
			</div>
		</div>
	</div>
</template>

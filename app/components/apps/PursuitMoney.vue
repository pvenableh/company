<script setup lang="ts">
/*
  PursuitMoney — the money that's still *out there* (proposals), scoped to a
  client, lead, or contact. Complements the invoice "Money Pipeline / Hunt"
  (money already owed) with the pursuit tier: what's pitched, in play, gone cold
  (revivable), and won — plus a fixable "lost to silence" leak. Self-hides when
  the entity has no proposals.

  Scope precedence: leadId → clientId → contactId. Contact = the union of
  proposals directly on the contact OR on a lead whose primary contact is them.
*/
import { proposalPursuitState } from '~~/shared/proposals';
import { moneyPeriodRange, moneyPeriodMeta, inMoneyPeriod, type MoneyPeriodKey } from '~~/shared/money-period';

const props = defineProps<{
	clientId?: string | null;
	leadId?: string | number | null;
	contactId?: string | null;
}>();

// Period lens — scopes only the *pitch flow* (Pitched = value pitched in the
// window, by date_sent). In-play/Cold are live; Won/Win-rate are lifetime.
// Defaults to Lifetime so a lead's full courtship shows without a period cutting
// older pitches (collected-money surfaces default to YTD; pursuit is longer-arc).
const period = ref<MoneyPeriodKey>('all');

const proposalItems = useDirectusItems('proposals');
const proposalSlide = useAppSlideOver('proposal');

const rows = ref<any[]>([]);
const loading = ref(true);

function buildFilter(): Record<string, any> | null {
	if (props.leadId != null) return { lead: { _eq: props.leadId } };
	if (props.clientId) return { client: { _eq: props.clientId } };
	if (props.contactId) return { _or: [{ contact: { _eq: props.contactId } }, { lead: { related_contact: { _eq: props.contactId } } }] };
	return null;
}

async function load() {
	const filter = buildFilter();
	if (!filter) { rows.value = []; loading.value = false; return; }
	loading.value = true;
	try {
		rows.value = (await proposalItems.list({
			fields: [
				'id', 'title', 'total_value', 'proposal_status', 'date_sent', 'valid_until', 'outcome_reason', 'date_created',
				'client.name', 'lead.id', 'lead.related_contact.first_name', 'lead.related_contact.last_name',
				'contact.first_name', 'contact.last_name',
			],
			filter, sort: ['-date_created'], limit: -1,
		}).catch(() => [])) as any[];
	} finally {
		loading.value = false;
	}
}
onMounted(load);
watch(() => [props.clientId, props.leadId, props.contactId], load);
defineExpose({ refresh: load });

const enriched = computed(() => rows.value.map((p) => ({ ...p, ...proposalPursuitState(p) })));
const valueOf = (pred: (p: any) => boolean) => enriched.value.filter(pred).reduce((s, p) => s + (Number(p.total_value) || 0), 0);

// Pitched, scoped to the selected period by when it was sent (flow metric).
const pitchedInPeriod = computed(() => {
	const range = moneyPeriodRange(period.value);
	return enriched.value
		.filter((p) => p.state !== 'draft' && (!range.start || inMoneyPeriod(p.date_sent || p.date_created, range)))
		.reduce((s, p) => s + (Number(p.total_value) || 0), 0);
});

const stats = computed(() => {
	const e = enriched.value;
	const wonN = e.filter((p) => p.state === 'won').length;
	const lostN = e.filter((p) => p.state === 'lost').length;
	const decided = wonN + lostN;
	return {
		pitched: pitchedInPeriod.value,
		inPlay: valueOf((p) => p.state === 'sent' || p.state === 'viewed'),
		cold: valueOf((p) => p.state === 'cold'),
		coldCount: e.filter((p) => p.state === 'cold').length,
		won: valueOf((p) => p.state === 'won'),
		winRate: decided ? Math.round((wonN / decided) * 100) : null,
		// Money slipping to silence — cold (still recoverable) + lost-to-no-response.
		noResponse: valueOf((p) => p.state === 'cold' || (p.state === 'lost' && p.outcome_reason === 'no_response')),
	};
});

const coldDeals = computed(() => enriched.value.filter((p) => p.state === 'cold').sort((a, b) => b.daysOut - a.daysOut));
const hasAny = computed(() => enriched.value.length > 0);

function who(p: any): string {
	if (p.client?.name) return p.client.name;
	if (p.lead?.related_contact) return `${p.lead.related_contact.first_name || ''} ${p.lead.related_contact.last_name || ''}`.trim();
	if (p.contact) return `${p.contact.first_name || ''} ${p.contact.last_name || ''}`.trim();
	return '';
}
const num = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
</script>

<template>
	<div v-if="hasAny" class="ios-card glass-edge rounded-2xl p-5">
		<div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
			<h3 class="text-sm font-semibold text-foreground/80 flex items-center gap-2">
				<Icon name="lucide:target" class="w-4 h-4 text-primary" />
				Pursuit money
			</h3>
			<MoneyPeriodSelect v-model="period" />
		</div>

		<div class="grid grid-cols-3 sm:grid-cols-5 gap-3">
			<div>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Pitched<span v-if="period !== 'all'" class="text-muted-foreground/70"> · {{ moneyPeriodMeta(period).short }}</span></p>
				<p class="text-lg font-bold tabular-nums leading-none mt-1">{{ num(stats.pitched) }}</p>
			</div>
			<div>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">In play</p>
				<p class="text-lg font-bold tabular-nums leading-none mt-1 text-primary">{{ num(stats.inPlay) }}</p>
			</div>
			<div>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Cold</p>
				<p class="text-lg font-bold tabular-nums leading-none mt-1" :class="stats.cold ? 'text-warning' : ''">{{ num(stats.cold) }}</p>
			</div>
			<div>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Won</p>
				<p class="text-lg font-bold tabular-nums leading-none mt-1 text-success">{{ num(stats.won) }}</p>
			</div>
			<div>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Win rate</p>
				<p class="text-lg font-bold tabular-nums leading-none mt-1">{{ stats.winRate == null ? '—' : stats.winRate + '%' }}</p>
			</div>
		</div>

		<p v-if="period !== 'all'" class="mt-2.5 text-[10px] text-muted-foreground/80">
			Pitched = sent <span class="font-medium text-foreground/70">{{ moneyPeriodMeta(period).label.toLowerCase() }}</span> · in play, cold &amp; won are live
		</p>

		<p v-if="stats.noResponse > 0" class="mt-3 text-[11px] text-muted-foreground">
			<Icon name="lucide:volume-x" class="w-3 h-3 inline -mt-0.5" />
			<span class="font-medium text-warning">{{ num(stats.noResponse) }}</span> slipping to silence — worth a fresh angle.
		</p>

		<!-- Revive: cold deals you can still win. -->
		<div v-if="coldDeals.length" class="mt-4 pt-4 border-t border-border/50">
			<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
				<Icon name="lucide:flame" class="w-3 h-3 text-warning" /> Revive · {{ coldDeals.length }} cold {{ coldDeals.length === 1 ? 'deal' : 'deals' }}
			</p>
			<ul class="divide-y divide-border/50 -mx-1">
				<li v-for="p in coldDeals" :key="p.id">
					<button type="button" class="w-full flex items-center gap-3 px-1 py-2 text-left rounded-lg hover:bg-muted/40 transition-colors" @click="proposalSlide.open(String(p.id))">
						<span class="w-1.5 h-7 rounded-full bg-warning shrink-0" />
						<div class="min-w-0 flex-1">
							<p class="text-[13px] font-medium truncate">{{ p.title || 'Proposal' }}</p>
							<p class="text-[11px] text-muted-foreground truncate">{{ who(p) }} · <span class="text-warning">{{ p.daysOut }}d silent</span></p>
						</div>
						<span class="text-[14px] font-bold tabular-nums text-warning shrink-0">{{ num(p.total_value) }}</span>
						<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground shrink-0" />
					</button>
				</li>
			</ul>
		</div>
	</div>
</template>

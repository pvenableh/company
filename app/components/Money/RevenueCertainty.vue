<script setup lang="ts">
/*
  RevenueCertainty — the whole money picture in one bar, ordered by *certainty*:

    Banked → Overdue → Outstanding → In play → Cold
    (most certain ─────────────────────────► most speculative)

  Banked/owed come from invoices (passed in — the Insights floor already computes
  them); In-play/Cold come from open proposals. It deliberately keeps the tiers
  visually distinct so the honest, high-certainty money never blurs into the
  hoped-for pipeline. Won proposals are excluded (they become invoices → banked/
  owed), so nothing is double-counted.
*/
import { proposalPursuitState } from '~~/shared/proposals';

const props = defineProps<{
	/** Banked = collected within the selected period (flow). */
	paid: number;
	outstanding: number;
	overdue: number;
	/** Compact period label (e.g. "YTD") — annotates the period-scoped Banked
	 *  tier so it never reads as an as-of-now snapshot. Omit for lifetime. */
	periodLabel?: string;
}>();

const { selectedOrg } = useOrganization();
const proposalItems = useDirectusItems('proposals');
const proposals = ref<any[]>([]);

async function load() {
	if (!selectedOrg.value) { proposals.value = []; return; }
	proposals.value = (await proposalItems.list({
		fields: ['total_value', 'proposal_status', 'date_sent', 'valid_until', 'date_created'],
		filter: { organization: { _eq: selectedOrg.value } },
		limit: -1,
	}).catch(() => [])) as any[];
}
onMounted(load);
watch(selectedOrg, load);

const proposalValue = (state: string) => proposals.value
	.filter((p) => proposalPursuitState(p).state === state)
	.reduce((s, p) => s + (Number(p.total_value) || 0), 0);

const inPlay = computed(() => proposalValue('sent') + proposalValue('viewed'));
const cold = computed(() => proposalValue('cold'));

interface Tier { key: string; label: string; value: number; cls: string; hatch?: boolean }
const tiers = computed<Tier[]>(() => [
	{ key: 'banked', label: 'Banked', value: props.paid, cls: 'bg-success' },
	{ key: 'overdue', label: 'Overdue', value: props.overdue, cls: 'bg-destructive' },
	{ key: 'outstanding', label: 'Outstanding', value: props.outstanding, cls: 'bg-warning' },
	{ key: 'inplay', label: 'In play', value: inPlay.value, cls: 'bg-primary' },
	{ key: 'cold', label: 'Cold', value: cold.value, cls: 'bg-warning', hatch: true },
]);

const total = computed(() => tiers.value.reduce((s, t) => s + t.value, 0));
const banked = computed(() => props.paid);
const owed = computed(() => props.outstanding + props.overdue);
const pursuit = computed(() => inPlay.value + cold.value);
const hasAny = computed(() => total.value > 0);

const num = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const pct = (v: number) => `${total.value ? (v / total.value) * 100 : 0}%`;
</script>

<template>
	<div v-if="hasAny" class="ios-card glass-edge rounded-2xl p-5">
		<div class="flex items-start justify-between gap-4 mb-4">
			<div>
				<h3 class="text-sm font-semibold text-foreground/80">Revenue certainty</h3>
				<p class="text-[11px] text-muted-foreground mt-0.5">Banked → owed → in play → cold · most certain to most speculative</p>
				<p v-if="periodLabel" class="text-[10px] text-muted-foreground/80 mt-0.5">Banked = collected <span class="font-semibold text-foreground/70">{{ periodLabel }}</span> · owed &amp; pipeline are live</p>
			</div>
			<div class="text-right shrink-0">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">In view</p>
				<p class="text-xl font-bold tabular-nums leading-none mt-0.5">{{ num(total) }}</p>
			</div>
		</div>

		<!-- Certainty bar -->
		<div class="flex h-4 w-full overflow-hidden rounded-full bg-muted/40">
			<div
				v-for="t in tiers"
				:key="t.key"
				class="h-full transition-[width] duration-500 ease-out first:rounded-l-full last:rounded-r-full"
				:class="[t.cls, t.value > 0 ? 'min-w-[3px]' : '']"
				:style="t.hatch
					? { width: pct(t.value), backgroundImage: 'repeating-linear-gradient(-45deg, rgba(0,0,0,.28) 0 4px, transparent 4px 8px)' }
					: { width: pct(t.value) }"
				:title="`${t.label}: ${num(t.value)}`"
			/>
		</div>

		<!-- Legend -->
		<div class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
			<div v-for="t in tiers" :key="`lg-${t.key}`" class="flex items-center gap-2 min-w-0">
				<span class="w-2.5 h-2.5 rounded-sm shrink-0" :class="t.cls" :style="t.hatch ? { backgroundImage: 'repeating-linear-gradient(-45deg, rgba(0,0,0,.3) 0 2px, transparent 2px 4px)' } : {}" />
				<span class="text-[11px] text-muted-foreground truncate">{{ t.label }}</span>
				<span class="text-[11px] font-semibold tabular-nums ml-auto">{{ num(t.value) }}</span>
			</div>
		</div>

		<!-- Roll-up: certain vs pursuit -->
		<div class="mt-4 pt-4 border-t border-border/50 grid grid-cols-3 gap-3 text-center">
			<div>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Banked<span v-if="periodLabel" class="text-muted-foreground/70"> · {{ periodLabel }}</span></p>
				<p class="text-base font-bold tabular-nums text-success">{{ num(banked) }}</p>
			</div>
			<div>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">To collect</p>
				<p class="text-base font-bold tabular-nums" :class="owed ? 'text-warning' : ''">{{ num(owed) }}</p>
			</div>
			<div>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">In pursuit</p>
				<p class="text-base font-bold tabular-nums text-primary">{{ num(pursuit) }}</p>
			</div>
		</div>
	</div>
</template>

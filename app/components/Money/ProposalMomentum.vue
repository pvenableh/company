<!--
  MoneyProposalMomentum — an encouragement strip that answers "how are my
  proposals doing?" at a glance. Sums the value currently working for you
  (sent + viewed + not-yet-cold), what you've won, and gently flags the ones
  that have gone quiet. Framed to feel like a pat on the back, not a report.

  Self-contained (fetches its own proposals) so it can drop into the Money
  Documents floor and the Command Center alike.
-->
<script setup lang="ts">
import { proposalPursuitState } from '~~/shared/proposals';

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const { getProposals } = useProposals();
const loading = ref(true);
const rows = ref<any[]>([]);

async function load() {
	loading.value = true;
	try {
		rows.value = (await getProposals()) || [];
	} catch {
		rows.value = [];
	} finally {
		loading.value = false;
	}
}
onMounted(load);
defineExpose({ refresh: load });

const stats = computed(() => {
	const now = new Date();
	let liveValue = 0;
	let liveCount = 0;
	let wonValue = 0;
	let wonCount = 0;
	let cold = 0;
	for (const p of rows.value) {
		const value = Number(p.total_value) || 0;
		const { state, isCold } = proposalPursuitState(p as any, now);
		if (state === 'won') { wonValue += value; wonCount++; }
		else if (state !== 'draft' && state !== 'lost') { liveValue += value; liveCount++; }
		if (isCold) cold++;
	}
	return { liveValue, liveCount, wonValue, wonCount, cold };
});

const money = (n: number) =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

// A warm, changing headline based on where the numbers land.
const headline = computed(() => {
	const s = stats.value;
	if (!s.liveCount && !s.wonCount) return "Every deal starts with a proposal. Send your first — you've got this.";
	if (s.wonCount && !s.liveCount) return `${money(s.wonValue)} won so far. Time to get the next one in flight.`;
	if (s.liveCount >= 5) return `${s.liveCount} proposals out working for you — that's a strong pipeline.`;
	if (s.liveCount) return `${money(s.liveValue)} in proposals is out there working for you right now.`;
	return 'Keep the momentum going.';
});
</script>

<template>
	<div class="ios-card px-4 py-3 sm:px-5 sm:py-4">
		<div class="flex items-center gap-2 mb-3">
			<Icon name="lucide:sparkles" class="w-4 h-4 text-primary" />
			<p class="text-sm font-medium leading-snug">{{ headline }}</p>
		</div>

		<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
			<div>
				<div class="text-[10px] uppercase tracking-wide text-muted-foreground">Out for review</div>
				<div class="text-lg font-semibold tabular-nums">{{ loading ? '—' : money(stats.liveValue) }}</div>
				<div class="text-[11px] text-muted-foreground">{{ stats.liveCount }} proposal{{ stats.liveCount === 1 ? '' : 's' }}</div>
			</div>
			<div>
				<div class="text-[10px] uppercase tracking-wide text-muted-foreground">Won</div>
				<div class="text-lg font-semibold tabular-nums text-emerald-500">{{ loading ? '—' : money(stats.wonValue) }}</div>
				<div class="text-[11px] text-muted-foreground">{{ stats.wonCount }} accepted</div>
			</div>
			<div>
				<div class="text-[10px] uppercase tracking-wide text-muted-foreground">Total sent</div>
				<div class="text-lg font-semibold tabular-nums">{{ loading ? '—' : money(stats.liveValue + stats.wonValue) }}</div>
				<div class="text-[11px] text-muted-foreground">{{ stats.liveCount + stats.wonCount }} out the door</div>
			</div>
			<div>
				<div class="text-[10px] uppercase tracking-wide text-muted-foreground">Needs a nudge</div>
				<div class="text-lg font-semibold tabular-nums" :class="stats.cold ? 'text-amber-500' : ''">{{ loading ? '—' : stats.cold }}</div>
				<div class="text-[11px] text-muted-foreground">{{ stats.cold ? 'gone quiet — follow up' : 'all fresh 🎉' }}</div>
			</div>
		</div>
	</div>
</template>

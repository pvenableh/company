<script setup lang="ts">
/*
  MoneyCollectedCard — a compact "how much have we actually collected" reading,
  scoped by date period (7D / 30D / MTD / QTD / YTD / Lifetime). A pure FLOW
  figure: it answers "collected in this window" and shows lifetime for context.
  Reusable at any altitude that can hand it a dated payment ledger (client now;
  project later if invoices are project-linked). Self-contained period state.
*/
import {
	moneyPeriodRange,
	moneyPeriodMeta,
	inMoneyPeriod,
	type MoneyPeriodKey,
} from '~~/shared/money-period';

const props = defineProps<{
	/** Dated payment ledger (refunds as negatives net out correctly). */
	payments: { amount: number; date: string | null }[];
	/** Card heading. */
	title?: string;
	loading?: boolean;
}>();

const period = ref<MoneyPeriodKey>('ytd');

const collected = computed(() => {
	const range = moneyPeriodRange(period.value);
	if (!range.start) return lifetime.value; // Lifetime
	return props.payments.reduce(
		(s, p) => (inMoneyPeriod(p.date, range) ? s + (Number(p.amount) || 0) : s),
		0,
	);
});
const lifetime = computed(() =>
	props.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
);

const num = (n: number) =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
</script>

<template>
	<div class="ios-card glass-edge rounded-2xl p-5">
		<div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
			<h3 class="text-sm font-semibold text-foreground/80">{{ title || 'Collected' }}</h3>
			<MoneyPeriodSelect v-model="period" />
		</div>
		<template v-if="loading">
			<div class="h-8 w-32 rounded bg-muted/50 animate-pulse" />
		</template>
		<template v-else>
			<p class="text-2xl font-bold tabular-nums text-success leading-none">{{ num(collected) }}</p>
			<p class="text-[11px] text-muted-foreground mt-1.5">
				Collected <span class="font-medium text-foreground/70">{{ moneyPeriodMeta(period).label.toLowerCase() }}</span>
				<span v-if="period !== 'all'"> · {{ num(lifetime) }} lifetime</span>
			</p>
		</template>
	</div>
</template>

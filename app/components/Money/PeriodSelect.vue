<script setup lang="ts">
/*
  MoneyPeriodSelect — the pill period selector for the financial-clarity
  graphics (7D / 30D / MTD / QTD / YTD / All). Scopes *flow* metrics only
  (money collected); current-state AR + open pipeline stay live. Reusable so
  the client/project surfaces can adopt the same control later.
*/
import { MONEY_PERIODS, type MoneyPeriodKey } from '~~/shared/money-period';

const model = defineModel<MoneyPeriodKey>({ required: true });
</script>

<template>
	<div class="inline-flex items-center gap-0.5 rounded-full bg-muted/50 p-0.5 overflow-x-auto max-w-full">
		<button
			v-for="p in MONEY_PERIODS"
			:key="p.key"
			type="button"
			class="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors"
			:class="model === p.key
				? 'bg-primary text-primary-foreground shadow-sm'
				: 'text-muted-foreground hover:text-foreground'"
			:aria-pressed="model === p.key"
			:title="p.label"
			@click="model = p.key"
		>{{ p.short }}</button>
	</div>
</template>

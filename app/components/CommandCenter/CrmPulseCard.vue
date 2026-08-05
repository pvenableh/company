<!--
  CrmPulseCard — a compact "state of the business" snapshot for the identity
  column. Deliberately does NOT repeat what other widgets already say: the
  actionable alerts live in Priority Actions, and the headline score lives in
  Earnest Score. What's unique here is the per-dimension CRM health breakdown +
  the pipeline/outstanding figures. Full analysis lives on /contacts?view=insights.
-->
<script setup lang="ts">
const { snapshot: crmSnapshot, overview: crmOverview } = useCRMIntelligence();

const healthScore = computed(() => crmOverview.value?.healthScore ?? crmSnapshot.value?.healthScore ?? null);
const healthBreakdown = computed(() => crmOverview.value?.healthBreakdown ?? crmSnapshot.value?.breakdown ?? null);
const metrics = computed<any>(() => crmSnapshot.value?.metrics ?? null);

const healthColor = computed(() => {
	const s = healthScore.value;
	if (s === null) return 'text-muted-foreground';
	if (s >= 75) return 'text-success';
	if (s >= 50) return 'text-warning';
	return 'text-destructive';
});

const DIM_LABELS: Record<string, string> = {
	contacts: 'Contacts', projects: 'Projects', tickets: 'Tickets', invoices: 'Invoices', deals: 'Deals',
};
const breakdownRows = computed(() => {
	const b = healthBreakdown.value;
	if (!b) return [] as Array<{ key: string; label: string; value: number }>;
	return Object.entries(b)
		.filter(([k]) => k in DIM_LABELS)
		.map(([k, v]) => ({ key: k, label: DIM_LABELS[k], value: Math.round(Number(v) || 0) }));
});
const barColor = (v: number) => (v >= 75 ? 'bg-success' : v >= 50 ? 'bg-warning' : 'bg-destructive');
const fmtMoney = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
</script>

<template>
	<div class="ios-card p-4 space-y-3">
		<!-- Header: label + compact inline score (no radial — Earnest Score owns the big score) -->
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-baseline gap-2 min-w-0">
				<h3 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">CRM Pulse</h3>
				<span v-if="healthScore !== null" :class="healthColor" class="text-sm font-bold tabular-nums leading-none">{{ healthScore }}</span>
				<span v-if="healthScore !== null" :class="healthColor" class="text-[10px] font-semibold uppercase tracking-wide">
					{{ healthScore >= 75 ? 'Strong' : healthScore >= 50 ? 'Steady' : 'Attention' }}
				</span>
			</div>
			<UiViewLink to="/contacts?view=insights" size="sm">Insights</UiViewLink>
		</div>

		<!-- Per-dimension breakdown (the unique bit) -->
		<div v-if="breakdownRows.length" class="space-y-1.5">
			<div v-for="row in breakdownRows" :key="row.key" class="flex items-center gap-2">
				<span class="text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">{{ row.label }}</span>
				<div class="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
					<div
						class="h-full rounded-full transition-all duration-500"
						:class="barColor(row.value)"
						:style="{ width: `${Math.max(row.value, 3)}%` }"
					/>
				</div>
				<span class="text-[10px] tabular-nums text-muted-foreground w-7 text-right shrink-0">{{ row.value }}</span>
			</div>
		</div>
		<p v-else-if="healthScore === null" class="text-xs text-muted-foreground">
			Add your first client to start tracking pulse.
		</p>

		<!-- Headline pipeline / outstanding -->
		<div v-if="metrics" class="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
			<div>
				<p class="text-sm font-semibold text-foreground tabular-nums">{{ fmtMoney(metrics.pipelineValue) }}</p>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Pipeline · {{ metrics.openDeals || 0 }} open</p>
			</div>
			<div>
				<p class="text-sm font-semibold text-foreground tabular-nums">{{ fmtMoney(metrics.outstandingAmount) }}</p>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</p>
			</div>
		</div>
	</div>
</template>

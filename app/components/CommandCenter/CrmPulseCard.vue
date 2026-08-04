<!--
  CrmPulseCard — CRM health at a glance for the dashboard's identity column.
  Health radial + status, the live rule-based alerts, a per-dimension breakdown,
  and the headline pipeline/outstanding metrics. Full analysis + growth
  opportunities live on /contacts?view=insights (one destination per noun).
-->
<script setup lang="ts">
const { snapshot: crmSnapshot, snapshotLoading: crmSnapshotLoading, overview: crmOverview } = useCRMIntelligence();

const healthScore = computed(() => crmOverview.value?.healthScore ?? crmSnapshot.value?.healthScore ?? null);
const healthBreakdown = computed(() => crmOverview.value?.healthBreakdown ?? crmSnapshot.value?.breakdown ?? null);
const crmAlerts = computed(() => (crmSnapshot.value?.alerts ?? []) as Array<{ type: string; message: string }>);
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
const topAlerts = computed(() => crmAlerts.value.slice(0, 4));

const alertDot = (type: string) =>
	type === 'danger' ? 'bg-destructive' : type === 'warning' ? 'bg-warning' : type === 'success' ? 'bg-success' : 'bg-info';
const barColor = (v: number) => (v >= 75 ? 'bg-success' : v >= 50 ? 'bg-warning' : 'bg-destructive');
const fmtMoney = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
</script>

<template>
	<div class="ios-card p-4 space-y-4">
		<!-- Header: radial + status + link -->
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-3 min-w-0">
				<div v-if="healthScore !== null" class="relative w-11 h-11 shrink-0">
					<svg class="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
						<path class="stroke-muted/30" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke-width="3" />
						<path
							:class="healthColor.replace('text-', 'stroke-')"
							d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
							fill="none"
							stroke-width="3"
							stroke-linecap="round"
							:stroke-dasharray="`${healthScore}, 100`"
						/>
					</svg>
					<div class="absolute inset-0 flex items-center justify-center">
						<span :class="healthColor" class="text-sm font-bold tabular-nums">{{ healthScore }}</span>
					</div>
				</div>
				<div v-else-if="crmSnapshotLoading" class="w-11 h-11 shrink-0 rounded-full bg-muted/40 animate-pulse" />
				<div class="min-w-0">
					<h3 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">CRM Pulse</h3>
					<p v-if="healthScore !== null" :class="healthColor" class="text-[11px] font-semibold">
						{{ healthScore >= 75 ? 'Strong' : healthScore >= 50 ? 'Steady' : 'Needs attention' }}
					</p>
				</div>
			</div>
			<UiViewLink to="/contacts?view=insights" size="sm">Insights</UiViewLink>
		</div>

		<!-- Live alerts -->
		<ul v-if="topAlerts.length" class="space-y-1.5">
			<li v-for="(a, i) in topAlerts" :key="i" class="flex items-start gap-2">
				<span class="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" :class="alertDot(a.type)" />
				<span class="text-xs text-foreground/80 leading-snug">{{ a.message }}</span>
			</li>
		</ul>
		<p v-else-if="healthScore === null" class="text-xs text-muted-foreground">
			Add your first client to start tracking pulse.
		</p>

		<!-- Per-dimension breakdown -->
		<div v-if="breakdownRows.length" class="space-y-1.5 pt-1 border-t border-border/40">
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

		<!-- Headline metrics -->
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

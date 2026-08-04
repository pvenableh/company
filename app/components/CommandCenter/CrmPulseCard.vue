<!--
  CrmPulseCard — slim glass callout for CRM health, extracted from the dashboard
  so it's an addressable, reorderable widget. The full radial + breakdown lives
  on /contacts?view=insights (one destination per noun); this is quick reference.
-->
<script setup lang="ts">
const { snapshot: crmSnapshot, snapshotLoading: crmSnapshotLoading, overview: crmOverview } = useCRMIntelligence();

const healthScore = computed(() => crmOverview.value?.healthScore ?? crmSnapshot.value?.healthScore ?? null);
const healthBreakdown = computed(() => crmOverview.value?.healthBreakdown ?? crmSnapshot.value?.breakdown ?? null);
const crmAlerts = computed(() => crmSnapshot.value?.alerts ?? []);
const healthColor = computed(() => {
	const score = healthScore.value;
	if (score === null) return 'text-muted-foreground';
	if (score >= 75) return 'text-success';
	if (score >= 50) return 'text-warning';
	return 'text-destructive';
});
</script>

<template>
	<NuxtLink
		to="/contacts?view=insights"
		class="glass-surface glass-surface--hoverable p-4 flex items-center gap-4 group"
	>
		<!-- Mini radial -->
		<div v-if="healthScore !== null" class="relative w-12 h-12 shrink-0">
			<svg class="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
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
		<div v-else-if="crmSnapshotLoading" class="w-12 h-12 shrink-0 rounded-full bg-muted/40 animate-pulse"></div>
		<div v-else class="w-12 h-12 shrink-0 rounded-full bg-muted/30 flex items-center justify-center">
			<EIcon name="i-heroicons-user-group" class="w-5 h-5 text-muted-foreground/60" />
		</div>

		<!-- Headline + first alert -->
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2">
				<h3 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">CRM pulse</h3>
				<span v-if="healthScore !== null" :class="healthColor" class="text-[10px] font-semibold tabular-nums">
					{{ healthScore >= 75 ? 'Strong' : healthScore >= 50 ? 'Steady' : 'Needs attention' }}
				</span>
			</div>
			<p v-if="crmAlerts.length > 0" class="text-xs text-foreground/80 mt-0.5 truncate">
				{{ crmAlerts[0].message }}
			</p>
			<p v-else-if="healthScore === null" class="text-xs text-muted-foreground mt-0.5">
				Add your first client to start tracking pulse.
			</p>
			<p v-else class="text-xs text-muted-foreground mt-0.5">
				{{ healthBreakdown ? `${Object.keys(healthBreakdown).length} dimensions tracked` : 'Open Insights for full breakdown' }}
			</p>
		</div>

		<span class="hidden sm:inline-flex items-center gap-0.5 text-[11px] font-medium uppercase tracking-wide text-primary opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap">
			Open insights
			<EIcon name="i-heroicons-chevron-right" class="w-3.5 h-3.5" />
		</span>
	</NuxtLink>
</template>

<template>
	<div>
		<!-- KPI strip -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
			<div class="ios-card p-4 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Active Goals</p>
					<EIcon name="i-heroicons-flag" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-2">
					<p class="text-2xl font-bold">{{ activeGoals.length }}</p>
					<span class="text-[10px] text-muted-foreground">/ {{ goals.length }} total</span>
				</div>
				<p class="text-[11px] text-muted-foreground">{{ completedGoals.length }} completed</p>
			</div>

			<div class="ios-card p-4 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Progress</p>
					<EIcon name="i-heroicons-chart-bar" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-1">
					<p class="text-2xl font-bold">{{ avgProgress }}<span class="text-lg">%</span></p>
				</div>
				<div class="h-1.5 bg-muted/30 rounded-full overflow-hidden">
					<div
						class="h-full rounded-full transition-all"
						:class="progressColor(avgProgress)"
						:style="{ width: avgProgress + '%' }"
					/>
				</div>
			</div>

			<div class="ios-card p-4 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">On Track</p>
					<EIcon name="i-heroicons-check-circle" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-2">
					<p class="text-2xl font-bold">{{ onTrackCount }}</p>
					<span class="text-[10px] text-muted-foreground">/ {{ activeGoals.length }}</span>
				</div>
				<p class="text-[11px]" :class="atRiskCount > 0 ? 'text-warning' : 'text-muted-foreground'">
					{{ atRiskCount }} at risk · {{ overdueGoals.length }} overdue
				</p>
			</div>

			<div class="ios-card p-4 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Check-in Cadence</p>
					<EIcon name="i-heroicons-calendar-days" class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div class="flex items-baseline gap-1">
					<p class="text-2xl font-bold">{{ snapshotsLast30 }}</p>
					<span class="text-[10px] text-muted-foreground">updates / 30d</span>
				</div>
				<p class="text-[11px] text-muted-foreground">{{ goalsWithRecentSnap }} / {{ activeGoals.length }} goals touched</p>
			</div>
		</div>

		<!-- By Scope + By Category -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
			<div class="ios-card p-5">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">By Scope</h3>
					<span class="text-[10px] text-muted-foreground">all goals</span>
				</div>
				<div v-if="scopeRows.length" class="space-y-2.5">
					<div v-for="row in scopeRows" :key="row.scope" class="flex items-center gap-3">
						<span class="text-[11px] font-medium w-24 shrink-0 capitalize">{{ scopeLabel(row.scope) }}</span>
						<div class="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
							<div
								class="h-full rounded-full bg-primary/70"
								:style="{ width: scopeBarWidth(row.count) + '%' }"
							/>
						</div>
						<span class="text-[11px] tabular-nums w-10 text-right">{{ row.count }}</span>
					</div>
				</div>
				<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
					No goals yet.
				</div>
			</div>

			<div class="ios-card p-5">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">By Category</h3>
					<span class="text-[10px] text-muted-foreground">active</span>
				</div>
				<div v-if="categoryRows.length" class="space-y-2.5">
					<div v-for="row in categoryRows" :key="row.category" class="flex items-center gap-3">
						<span class="w-2 h-2 rounded-sm shrink-0" :style="{ background: categoryColor(row.category) }" />
						<span class="text-[11px] font-medium w-24 shrink-0 capitalize">{{ row.category }}</span>
						<div class="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
							<div
								class="h-full rounded-full"
								:style="{ background: categoryColor(row.category), width: categoryBarWidth(row.count) + '%' }"
							/>
						</div>
						<span class="text-[11px] tabular-nums w-10 text-right">{{ row.count }}</span>
					</div>
				</div>
				<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
					No active goals.
				</div>
			</div>
		</div>

		<!-- At Risk + Overdue -->
		<div v-if="riskList.length" class="ios-card p-5">
			<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
				Needs Attention
				<span class="text-warning ml-1">({{ riskList.length }})</span>
			</h3>
			<div class="space-y-0.5">
				<div
					v-for="g in riskList"
					:key="g.id"
					class="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/30 transition-colors"
				>
					<div class="flex items-center gap-3 min-w-0 flex-1">
						<span
							class="w-2 h-2 rounded-full shrink-0"
							:class="g.reason === 'overdue' ? 'bg-destructive' : 'bg-warning'"
						/>
						<div class="min-w-0">
							<p class="text-sm font-medium truncate">{{ g.title }}</p>
							<p class="text-[11px] text-muted-foreground">
								<span class="capitalize">{{ g.category || 'custom' }}</span>
								<span v-if="g.endDate"> · ends {{ formatDate(g.endDate) }}</span>
								<span> · {{ g.reasonText }}</span>
							</p>
						</div>
					</div>
					<div class="flex items-center gap-3 shrink-0 ml-3">
						<span class="text-xs font-medium" :class="progressTextColor(g.progress)">{{ g.progress }}%</span>
						<div class="w-16 h-1.5 bg-muted/30 rounded-full overflow-hidden">
							<div class="h-full rounded-full" :class="progressColor(g.progress)" :style="{ width: g.progress + '%' }" />
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Goal } from '~~/shared/directus';

type Snapshot = { value?: number; date_created?: string };

const props = defineProps<{
	goals: Goal[];
	activeGoals: Goal[];
	completedGoals: Goal[];
	overdueGoals: Goal[];
	goalsByScope: Record<string, Goal[]>;
	goalsByCategory: Record<string, Goal[]>;
	goalProgress: (g: Goal) => number;
	loading: boolean;
}>();

const avgProgress = computed(() => {
	if (!props.activeGoals.length) return 0;
	return Math.round(props.activeGoals.reduce((s, g) => s + props.goalProgress(g), 0) / props.activeGoals.length);
});

// "On track" = progress ≥ time-elapsed%; "at risk" = progress < time-elapsed - 15
function timeElapsedPct(g: Goal): number {
	if (!g.start_date || !g.end_date) return 50;
	const start = new Date(g.start_date).getTime();
	const end = new Date(g.end_date).getTime();
	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 50;
	const now = Date.now();
	return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

const onTrackCount = computed(() => props.activeGoals.filter((g) => props.goalProgress(g) >= timeElapsedPct(g)).length);
const atRiskCount = computed(() => props.activeGoals.filter((g) => {
	const p = props.goalProgress(g);
	const t = timeElapsedPct(g);
	return p < t - 15 && !props.overdueGoals.includes(g);
}).length);

const snapshotsLast30 = computed(() => {
	const cutoff = Date.now() - 30 * 86_400_000;
	let count = 0;
	for (const g of props.goals) {
		for (const s of (g.snapshots as Snapshot[] | undefined) || []) {
			if (s?.date_created && new Date(s.date_created).getTime() >= cutoff) count++;
		}
	}
	return count;
});

const goalsWithRecentSnap = computed(() => {
	const cutoff = Date.now() - 30 * 86_400_000;
	return props.activeGoals.filter((g) => {
		const snaps = (g.snapshots as Snapshot[] | undefined) || [];
		return snaps.some((s) => s?.date_created && new Date(s.date_created).getTime() >= cutoff);
	}).length;
});

const scopeRows = computed<Array<{ scope: string; count: number }>>(() =>
	Object.entries(props.goalsByScope || {})
		.map(([scope, arr]) => ({ scope, count: (arr || []).length }))
		.filter((r) => r.count > 0)
		.sort((a, b) => b.count - a.count),
);
const maxScopeCount = computed(() => Math.max(1, ...scopeRows.value.map((r) => r.count)));
function scopeBarWidth(n: number): number {
	return Math.max(4, (n / maxScopeCount.value) * 100);
}
function scopeLabel(scope: string): string {
	if (scope === 'user') return 'For me';
	return scope;
}

const categoryRows = computed<Array<{ category: string; count: number }>>(() => {
	const map: Record<string, number> = {};
	for (const g of props.activeGoals) {
		const c = g.category || 'custom';
		map[c] = (map[c] || 0) + 1;
	}
	return Object.entries(map)
		.map(([category, count]) => ({ category, count }))
		.sort((a, b) => b.count - a.count);
});
const maxCategoryCount = computed(() => Math.max(1, ...categoryRows.value.map((r) => r.count)));
function categoryBarWidth(n: number): number {
	return Math.max(4, (n / maxCategoryCount.value) * 100);
}

const CATEGORY_COLORS: Record<string, string> = {
	revenue: 'hsl(142, 71%, 45%)',
	growth: 'hsl(217, 91%, 60%)',
	retention: 'hsl(280, 65%, 60%)',
	learning: 'hsl(43, 95%, 55%)',
	wellbeing: 'hsl(173, 78%, 45%)',
	delivery: 'hsl(199, 89%, 55%)',
	custom: 'hsl(0, 0%, 55%)',
};
function categoryColor(cat: string): string {
	return CATEGORY_COLORS[cat] || CATEGORY_COLORS.custom!;
}

type RiskRow = {
	id: string;
	title: string;
	category: string | null;
	endDate: string | null;
	progress: number;
	reason: 'overdue' | 'behind';
	reasonText: string;
};
const riskList = computed<RiskRow[]>(() => {
	const out: RiskRow[] = [];
	for (const g of props.overdueGoals) {
		out.push({
			id: g.id,
			title: g.title,
			category: g.category || null,
			endDate: g.end_date || null,
			progress: props.goalProgress(g),
			reason: 'overdue',
			reasonText: 'past due',
		});
	}
	for (const g of props.activeGoals) {
		if (props.overdueGoals.includes(g)) continue;
		const p = props.goalProgress(g);
		const t = timeElapsedPct(g);
		const gap = t - p;
		if (gap > 15) {
			out.push({
				id: g.id,
				title: g.title,
				category: g.category || null,
				endDate: g.end_date || null,
				progress: p,
				reason: 'behind',
				reasonText: `${gap}% behind pace`,
			});
		}
	}
	return out.sort((a, b) => {
		if (a.reason !== b.reason) return a.reason === 'overdue' ? -1 : 1;
		return a.progress - b.progress;
	}).slice(0, 10);
});

function progressColor(p: number): string {
	if (p >= 75) return 'bg-success/70';
	if (p >= 50) return 'bg-primary/70';
	if (p >= 25) return 'bg-warning/70';
	return 'bg-destructive/70';
}
function progressTextColor(p: number): string {
	if (p >= 75) return 'text-success';
	if (p >= 50) return 'text-primary';
	if (p >= 25) return 'text-warning';
	return 'text-destructive';
}

function formatDate(d: string): string {
	try {
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	} catch {
		return '—';
	}
}
</script>

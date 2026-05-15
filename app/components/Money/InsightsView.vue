<template>
	<div>
		<!-- Loading -->
		<div v-if="loading && !snapshot" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
			<p class="text-sm text-muted-foreground">Computing insights…</p>
		</div>

		<template v-else-if="snapshot">
			<!-- KPI strip -->
			<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
				<div class="ios-card p-4 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue (6mo)</p>
						<Icon name="lucide:dollar-sign" class="w-3.5 h-3.5 text-muted-foreground" />
					</div>
					<div class="flex items-baseline gap-2">
						<p class="text-2xl font-bold">${{ formatNumber(totalRevenue6Mo) }}</p>
						<span class="text-[10px] font-medium" :class="trendColor(revenueTrend)">{{ trendArrow(revenueTrend) }}</span>
					</div>
					<p class="text-[11px] text-muted-foreground">vs prior month</p>
				</div>

				<div class="ios-card p-4 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</p>
						<Icon name="lucide:alert-circle" class="w-3.5 h-3.5 text-muted-foreground" />
					</div>
					<div class="flex items-baseline gap-1">
						<p class="text-2xl font-bold">${{ formatNumber(outstandingAmount) }}</p>
					</div>
					<p class="text-[11px]" :class="outstandingAmount > 0 ? 'text-amber-500' : 'text-muted-foreground'">
						{{ outstandingCount }} overdue invoice{{ outstandingCount === 1 ? '' : 's' }}
					</p>
				</div>

				<div class="ios-card p-4 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Invoice</p>
						<Icon name="lucide:receipt" class="w-3.5 h-3.5 text-muted-foreground" />
					</div>
					<div class="flex items-baseline gap-1">
						<p class="text-2xl font-bold">${{ formatNumber(avgInvoiceValue) }}</p>
					</div>
					<p class="text-[11px] text-muted-foreground">across last 6 mo</p>
				</div>

				<div class="ios-card p-4 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Pipeline</p>
						<Icon name="lucide:trending-up" class="w-3.5 h-3.5 text-muted-foreground" />
					</div>
					<div class="flex items-baseline gap-2">
						<p class="text-2xl font-bold">${{ formatNumber(pipelineValue) }}</p>
					</div>
					<p class="text-[11px] text-muted-foreground">{{ openDeals }} open deal{{ openDeals === 1 ? '' : 's' }}</p>
				</div>
			</div>

			<!-- Revenue trend + Top clients -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
				<div class="ios-card p-5">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Monthly Revenue — last 6 mo</h3>
					</div>
					<div v-if="monthlyRevenue.length" class="space-y-2">
						<div v-for="m in monthlyRevenue" :key="m.month" class="flex items-center gap-3">
							<span class="text-[11px] font-medium w-20 shrink-0">{{ formatMonth(m.month) }}</span>
							<div class="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
								<div
									class="h-full rounded-full bg-emerald-500/70"
									:style="{ width: monthBarWidth(m.total) + '%' }"
								/>
							</div>
							<span class="text-[11px] font-semibold tabular-nums w-20 text-right">${{ formatNumber(m.total) }}</span>
						</div>
					</div>
					<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
						No invoice data yet.
					</div>
				</div>

				<div class="ios-card p-5">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Top Clients by Revenue</h3>
						<span class="text-[10px] text-muted-foreground">last 6 mo</span>
					</div>
					<div v-if="topClients.length" class="space-y-2">
						<div v-for="(c, i) in topClients" :key="c.name" class="flex items-center gap-3">
							<span class="text-[10px] text-muted-foreground w-4">{{ i + 1 }}</span>
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-0.5">
									<span class="text-[11px] font-medium truncate">{{ c.name }}</span>
									<span class="text-[10px] text-muted-foreground ml-auto shrink-0">${{ formatNumber(c.revenue) }}</span>
								</div>
								<div class="h-1.5 bg-muted/30 rounded-full overflow-hidden">
									<div
										class="h-full rounded-full bg-emerald-500/70"
										:style="{ width: clientBarWidth(c.revenue) + '%' }"
									/>
								</div>
							</div>
						</div>
					</div>
					<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
						No revenue data yet.
					</div>
				</div>
			</div>

			<!-- Outstanding invoices -->
			<div v-if="outstandingInvoices.length" class="ios-card p-5">
				<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
					Outstanding Invoices
					<span class="text-amber-400 ml-1">({{ outstandingInvoices.length }})</span>
				</h3>
				<div class="space-y-0.5">
					<NuxtLink
						v-for="inv in outstandingInvoices"
						:key="inv.code"
						to="/invoices"
						class="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/30 transition-colors"
					>
						<div class="flex items-center gap-3 min-w-0 flex-1">
							<span class="w-2 h-2 rounded-full shrink-0" :class="inv.daysOverdue >= 30 ? 'bg-red-500' : 'bg-amber-500'" />
							<div class="min-w-0">
								<p class="text-sm font-medium truncate">{{ inv.code }} <span v-if="inv.client" class="text-muted-foreground font-normal">· {{ inv.client }}</span></p>
								<p class="text-[11px] text-muted-foreground">{{ inv.daysOverdue }}d overdue</p>
							</div>
						</div>
						<span class="text-sm font-medium shrink-0 ml-3">${{ formatNumber(inv.amount) }}</span>
					</NuxtLink>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	snapshot: any;
	loading: boolean;
}>();

const totalRevenue6Mo = computed(() => props.snapshot?.metrics?.totalRevenue6Mo ?? 0);
const outstandingAmount = computed(() => props.snapshot?.metrics?.outstandingAmount ?? 0);
const avgInvoiceValue = computed(() => props.snapshot?.metrics?.avgInvoiceValue ?? 0);
const pipelineValue = computed(() => props.snapshot?.metrics?.pipelineValue ?? 0);
const openDeals = computed(() => props.snapshot?.metrics?.openDeals ?? 0);
const revenueTrend = computed(() => props.snapshot?.metrics?.revenueTrend ?? 'flat');
const monthlyRevenue = computed<Array<{ month: string; total: number }>>(() => props.snapshot?.metrics?.monthlyRevenue ?? []);
const topClients = computed<Array<{ name: string; revenue: number }>>(() => props.snapshot?.metrics?.topClients ?? []);
const outstandingInvoices = computed<Array<{ code: string; amount: number; client: string | null; daysOverdue: number }>>(() => props.snapshot?.outstandingInvoices ?? []);
const outstandingCount = computed(() => outstandingInvoices.value.length);

const maxMonthRevenue = computed(() => Math.max(1, ...monthlyRevenue.value.map((m) => m.total)));
function monthBarWidth(n: number): number {
	return Math.max(4, (n / maxMonthRevenue.value) * 100);
}

const maxClientRevenue = computed(() => Math.max(1, ...topClients.value.map((c) => c.revenue)));
function clientBarWidth(n: number): number {
	return Math.max(4, (n / maxClientRevenue.value) * 100);
}

function formatNumber(n: number): string {
	if (!n) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
	return String(Math.round(n));
}

function formatMonth(month: string): string {
	if (!month) return '—';
	const [y, m] = month.split('-');
	if (!y || !m) return month;
	const d = new Date(Number(y), Number(m) - 1, 1);
	return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function trendColor(t: 'up' | 'down' | 'flat'): string {
	if (t === 'up') return 'text-emerald-500';
	if (t === 'down') return 'text-red-500';
	return 'text-muted-foreground';
}

function trendArrow(t: 'up' | 'down' | 'flat'): string {
	if (t === 'up') return '↑';
	if (t === 'down') return '↓';
	return '→';
}
</script>

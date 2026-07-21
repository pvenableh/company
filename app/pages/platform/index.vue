<script setup lang="ts">
/**
 * /platform — the Earnest creator's cross-org console.
 *
 * Every org with feedback + usage + revenue + health; click through to any
 * org's full feedback hub (/feedback?org=<id>). Gated server-side to platform
 * admins (global Directus Administrator) — grants no access they lack via
 * admin.earnest.guru, so it's a safe convenience surface.
 */
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Platform | Earnest' });

const { data: orgs, pending, error } = await useFetch<Array<any>>('/api/platform/orgs');
const { data: reversals } = await useFetch<{ totals: any; items: any[] }>('/api/platform/reversals', {
	// Non-fatal: the console still renders its org roster if this 403s/500s.
	default: () => ({ totals: { invoiceRefunded: 0, openDisputes: 0, platformReversed: 0, tokensClawedBack: 0, total: 0 }, items: [] }),
});

const denied = computed(() => (error.value as any)?.statusCode === 403);
const active = computed(() => (orgs.value || []).filter((o) => !o.archived));
const archived = computed(() => (orgs.value || []).filter((o) => o.archived));

const totals = computed(() => {
	const a = active.value;
	return {
		orgs: a.length,
		revenue: a.reduce((s, o) => s + (o.revenue || 0), 0),
		refunded: reversals.value?.totals?.total ?? 0,
		members: a.reduce((s, o) => s + (o.members || 0), 0),
		projects: a.reduce((s, o) => s + (o.activeProjects || 0), 0),
	};
});

const reversalItems = computed(() => reversals.value?.items ?? []);
const reversalTotals = computed(() => reversals.value?.totals ?? {});

function reversalLabel(type: string): string {
	switch (type) {
		case 'invoice_refund': return 'Invoice refund';
		case 'invoice_dispute_lost': return 'Chargeback lost';
		case 'invoice_dispute_open': return 'Dispute (held)';
		case 'token_refund': return 'Token refund';
		case 'token_dispute': return 'Token chargeback';
		case 'subscription_refund': return 'Subscription refund';
		case 'subscription_dispute': return 'Subscription chargeback';
		default: return type;
	}
}
function reversalTone(type: string): string {
	if (type.includes('dispute') || type.includes('chargeback')) return 'bg-destructive/10 text-destructive';
	return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
}

function money(n: number): string {
	if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
	return `$${Math.round(n)}`;
}
function ago(iso: string | null): string {
	if (!iso) return 'no activity';
	const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
	if (days <= 0) return 'active today';
	if (days === 1) return 'active yesterday';
	if (days < 30) return `active ${days}d ago`;
	if (days < 365) return `active ${Math.floor(days / 30)}mo ago`;
	return 'dormant';
}
function healthColor(iso: string | null): string {
	if (!iso) return 'bg-muted-foreground/30';
	const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
	if (days <= 7) return 'bg-success';
	if (days <= 30) return 'bg-warning';
	return 'bg-destructive';
}
</script>

<template>
	<LayoutPageContainer>
		<AppHeader title="Platform" />
		<p class="text-sm text-muted-foreground mb-6 -mt-1">
			Every organization on Earnest — feedback, usage, revenue, health. Open any one for its full client feedback.
		</p>

		<div v-if="pending" class="flex items-center justify-center py-20">
			<Icon name="lucide:loader-2" class="w-7 h-7 text-muted-foreground animate-spin" />
		</div>

		<div v-else-if="denied" class="ios-card p-8 text-center">
			<Icon name="lucide:lock" class="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
			<p class="text-sm text-muted-foreground">This area is for Earnest platform administrators.</p>
		</div>

		<template v-else>
			<!-- Totals -->
			<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Organizations</p>
					<p class="text-2xl font-semibold tabular-nums leading-none">{{ totals.orgs }}</p>
				</div>
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Net revenue</p>
					<p class="text-2xl font-semibold tabular-nums leading-none">{{ money(totals.revenue) }}</p>
					<p class="text-[10px] text-muted-foreground/70 mt-1">after refunds/disputes</p>
				</div>
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Refunds &amp; disputes</p>
					<p class="text-2xl font-semibold tabular-nums leading-none" :class="totals.refunded > 0 ? 'text-amber-600 dark:text-amber-400' : ''">{{ money(totals.refunded) }}</p>
					<p v-if="reversalTotals.openDisputes" class="text-[10px] text-destructive mt-1">{{ reversalTotals.openDisputes }} open dispute{{ reversalTotals.openDisputes === 1 ? '' : 's' }}</p>
				</div>
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Team members</p>
					<p class="text-2xl font-semibold tabular-nums leading-none">{{ totals.members }}</p>
				</div>
				<div class="ios-card p-4">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Active projects</p>
					<p class="text-2xl font-semibold tabular-nums leading-none">{{ totals.projects }}</p>
				</div>
			</div>

			<!-- Org cards -->
			<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
				<NuxtLink
					v-for="o in active"
					:key="o.id"
					:to="`/feedback?org=${o.id}`"
					class="ios-card p-5 hover:bg-muted/30 transition-colors group"
				>
					<div class="flex items-center gap-2 mb-4">
						<span class="w-2 h-2 rounded-full shrink-0" :class="healthColor(o.lastActive)" :title="ago(o.lastActive)" />
						<span class="font-semibold truncate">{{ o.name }}</span>
						<span v-if="o.refunded > 0" class="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-medium" :title="`${money(o.refunded)} refunded/reversed`"><Icon name="lucide:rotate-ccw" class="w-2.5 h-2.5" />{{ money(o.refunded) }}</span>
						<span v-if="o.disputed" class="shrink-0 inline-flex items-center rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider" title="Open or lost dispute">Disputed</span>
						<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors ml-auto shrink-0" />
					</div>

					<div class="grid grid-cols-2 gap-x-4 gap-y-3">
						<div>
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue</p>
							<p class="text-lg font-semibold tabular-nums leading-tight">{{ money(o.revenue) }}</p>
						</div>
						<div>
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Members</p>
							<p class="text-lg font-semibold tabular-nums leading-tight">{{ o.members }}</p>
						</div>
						<div>
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Projects · Tickets</p>
							<p class="text-lg font-semibold tabular-nums leading-tight">{{ o.activeProjects }} · {{ o.openTickets }}</p>
						</div>
						<div>
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Client rating</p>
							<p class="text-lg font-semibold tabular-nums leading-tight flex items-center gap-1">
								<template v-if="o.agency.count || o.csat.count">
									{{ (o.agency.count ? o.agency.avg : o.csat.avg).toFixed(1) }}
									<Icon name="lucide:star" class="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
								</template>
								<span v-else class="text-muted-foreground">—</span>
							</p>
						</div>
					</div>

					<p class="text-[10px] text-muted-foreground/70 mt-4 flex items-center gap-1">
						<Icon name="lucide:activity" class="w-3 h-3" />
						{{ ago(o.lastActive) }}
						<span v-if="o.agency.count" class="ml-auto">{{ o.agency.count }} agency review{{ o.agency.count === 1 ? '' : 's' }}</span>
					</p>
				</NuxtLink>
			</div>

			<div v-if="reversalItems.length" class="mt-8">
				<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">Refunds &amp; disputes</h3>
				<div class="ios-card divide-y divide-border/40">
					<div v-for="(r, i) in reversalItems" :key="i" class="flex items-center gap-3 px-4 py-2.5">
						<span class="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium" :class="reversalTone(r.type)">{{ reversalLabel(r.type) }}</span>
						<span class="text-sm truncate">{{ r.orgName || '—' }}</span>
						<span v-if="r.tokens" class="text-[10px] text-muted-foreground shrink-0">−{{ r.tokens.toLocaleString() }} tokens</span>
						<span class="ml-auto text-sm font-semibold tabular-nums shrink-0">−{{ money(r.amount) }}</span>
						<span class="text-[10px] text-muted-foreground/70 shrink-0 w-16 text-right hidden sm:block">{{ ago(r.date) }}</span>
					</div>
				</div>
			</div>

			<div v-if="archived.length" class="mt-8">
				<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">Archived</h3>
				<div class="flex flex-wrap gap-2">
					<NuxtLink
						v-for="o in archived"
						:key="o.id"
						:to="`/feedback?org=${o.id}`"
						class="text-xs px-3 py-1.5 rounded-full bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
					>
						{{ o.name }}
					</NuxtLink>
				</div>
			</div>
		</template>
	</LayoutPageContainer>
</template>

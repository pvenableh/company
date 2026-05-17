<script setup lang="ts">
/**
 * /portal/billing — Billing hub.
 *
 * Cross-cutting view of invoices + proposals + contracts. The
 * "money lifecycle" surface — proposals (pre-sale) → contracts
 * (committing to the work) → invoices (post-delivery). Headline
 * KPIs roll up the most important client-facing number on each:
 * what's owed, what needs review, what's awaiting signature.
 *
 * Sub-pages stay at /portal/invoices, /portal/proposals,
 * /portal/contracts for deep-dives. Each section here ends with
 * "View all" links that route into them.
 */

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Billing | Client Portal' });

const { selectedOrg } = useOrganization();
const { membership } = useOrgRole();

const proposalItems = usePortalItems('proposals');
const contractItems = usePortalItems('contracts');

interface SummaryResponse {
	attention: Array<{
		id: string;
		type: string;
		label: string;
		detail: string;
		href: string;
		severity: 'urgent' | 'normal' | 'info';
	}>;
	kpis: {
		billing: { outstandingTotal: number; pendingProposals: number; unsignedContracts: number };
	};
}

const loading = ref(true);
const summary = ref<SummaryResponse | null>(null);
const recentInvoices = ref<any[]>([]);
const recentProposals = ref<any[]>([]);
const recentContracts = ref<any[]>([]);

async function loadHub() {
	if (!selectedOrg.value) return;
	loading.value = true;
	try {
		const [summaryRes, invoiceRes, proposals, contracts] = await Promise.all([
			$fetch<SummaryResponse>('/api/portal/summary').catch(() => null),
			$fetch<{ invoices: any[] }>('/api/portal/invoices?status=all').catch(() => ({ invoices: [] })),
			proposalItems.list({
				filter: { proposal_status: { _nin: ['draft'] } },
				fields: ['id', 'title', 'proposal_status', 'total_value', 'date_sent', 'date_updated', 'valid_until'],
				sort: ['-date_updated'],
				limit: 5,
			}).catch(() => []),
			contractItems.list({
				filter: { contract_status: { _nin: ['draft'] } },
				fields: ['id', 'title', 'contract_status', 'total_value', 'date_sent', 'date_updated', 'valid_until', 'signed_at'],
				sort: ['-date_updated'],
				limit: 5,
			}).catch(() => []),
		]);
		summary.value = summaryRes;
		recentInvoices.value = (invoiceRes.invoices || []).slice(0, 5);
		recentProposals.value = proposals;
		recentContracts.value = contracts;
	} catch (err) {
		console.error('Failed to load billing hub:', err);
	} finally {
		loading.value = false;
	}
}

const clientName = computed(() => {
	if (!membership.value?.client) return null;
	const client = membership.value.client;
	return typeof client === 'object' ? client.name : null;
});

const kpis = computed(() => summary.value?.kpis.billing ?? { outstandingTotal: 0, pendingProposals: 0, unsignedContracts: 0 });

const attentionItems = computed(() =>
	(summary.value?.attention ?? []).filter((a) => ['invoice', 'proposal', 'contract'].includes(a.type)),
);

function formatCurrency(n: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | null | undefined): string {
	if (!iso) return '—';
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function labelize(s: string | null | undefined): string {
	if (!s) return '';
	return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function paidAmount(inv: any): number {
	const payments = Array.isArray(inv.payments) ? inv.payments : [];
	return payments.reduce((sum: number, p: any) => sum + (p?.status === 'completed' ? Number(p.amount ?? 0) : 0), 0);
}

function outstandingFor(inv: any): number {
	return Math.max(0, Number(inv.total_amount ?? 0) - paidAmount(inv));
}

const { getStatusBadgeClasses } = useStatusStyle();

onMounted(() => loadHub());
watch(() => selectedOrg.value, () => loadHub());
</script>

<template>
	<div class="portal-page">
		<AppHeader>
			<template #default>Billing</template>
		</AppHeader>

		<LayoutPageContainer>
			<p v-if="clientName" class="text-sm text-muted-foreground mb-6 -mt-1">
				{{ clientName }} &mdash; invoices, proposals, and contracts in one place.
			</p>

			<div v-if="loading" class="flex items-center justify-center py-24">
				<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
			</div>

			<template v-else>
				<!-- KPI Strip -->
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-warning/10">
								<Icon name="lucide:dollar-sign" class="w-5 h-5 text-warning" />
							</div>
							<div>
								<p class="text-2xl font-semibold tabular-nums">{{ formatCurrency(kpis.outstandingTotal) }}</p>
								<p class="text-xs text-muted-foreground">Outstanding</p>
							</div>
						</div>
					</div>
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
								<Icon name="lucide:file-text" class="w-5 h-5 text-primary" />
							</div>
							<div>
								<p class="text-2xl font-semibold">{{ kpis.pendingProposals }}</p>
								<p class="text-xs text-muted-foreground">Proposals awaiting review</p>
							</div>
						</div>
					</div>
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-success/10">
								<Icon name="lucide:file-signature" class="w-5 h-5 text-success" />
							</div>
							<div>
								<p class="text-2xl font-semibold">{{ kpis.unsignedContracts }}</p>
								<p class="text-xs text-muted-foreground">Contracts awaiting signature</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Action Items -->
				<div v-if="attentionItems.length" class="ios-card p-5 mb-8">
					<h2 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">
						Awaiting Your Action
					</h2>
					<div class="space-y-2">
						<NuxtLink
							v-for="item in attentionItems"
							:key="`${item.type}-${item.id}`"
							:to="item.href"
							class="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
						>
							<div
								class="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
								:class="item.severity === 'urgent' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'"
							>
								<Icon
									:name="item.type === 'invoice' ? 'lucide:dollar-sign' : item.type === 'proposal' ? 'lucide:file-text' : 'lucide:file-signature'"
									class="w-4 h-4"
								/>
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium truncate">{{ item.label }}</p>
								<p class="text-xs text-muted-foreground truncate">{{ item.detail }}</p>
							</div>
							<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground shrink-0" />
						</NuxtLink>
					</div>
				</div>

				<!-- Three-column section breakdown -->
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<!-- Invoices -->
					<div class="ios-card p-5">
						<div class="flex items-center justify-between mb-4">
							<h2 class="font-medium flex items-center gap-2">
								<Icon name="lucide:receipt" class="w-4 h-4 text-muted-foreground" />
								Recent Invoices
							</h2>
							<NuxtLink to="/portal/invoices" class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline">
								View all
								<Icon name="lucide:chevron-right" class="w-3 h-3" />
							</NuxtLink>
						</div>
						<div v-if="recentInvoices.length" class="space-y-2">
							<NuxtLink
								v-for="inv in recentInvoices"
								:key="inv.id"
								:to="`/portal/invoices/${inv.id}`"
								class="flex flex-col gap-1 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
							>
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium truncate">{{ inv.invoice_code || `#${String(inv.id).slice(0, 6)}` }}</span>
									<span class="text-xs px-2 py-0.5 rounded-full shrink-0" :class="getStatusBadgeClasses(inv.status)">
										{{ labelize(inv.status) }}
									</span>
								</div>
								<div class="flex items-center justify-between text-xs text-muted-foreground">
									<span>{{ formatDate(inv.invoice_date) }}</span>
									<span class="tabular-nums font-medium text-foreground">{{ formatCurrency(Number(inv.total_amount ?? 0)) }}</span>
								</div>
								<div v-if="outstandingFor(inv) > 0" class="text-[11px] text-warning">
									{{ formatCurrency(outstandingFor(inv)) }} due
								</div>
							</NuxtLink>
						</div>
						<p v-else class="text-sm text-muted-foreground text-center py-6">No invoices yet.</p>
					</div>

					<!-- Proposals -->
					<div class="ios-card p-5">
						<div class="flex items-center justify-between mb-4">
							<h2 class="font-medium flex items-center gap-2">
								<Icon name="lucide:file-text" class="w-4 h-4 text-muted-foreground" />
								Recent Proposals
							</h2>
							<NuxtLink to="/portal/proposals" class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline">
								View all
								<Icon name="lucide:chevron-right" class="w-3 h-3" />
							</NuxtLink>
						</div>
						<div v-if="recentProposals.length" class="space-y-2">
							<NuxtLink
								v-for="p in recentProposals"
								:key="p.id"
								:to="`/portal/proposals/${p.id}`"
								class="flex flex-col gap-1 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
							>
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium truncate">{{ p.title }}</span>
									<span class="text-xs px-2 py-0.5 rounded-full shrink-0" :class="getStatusBadgeClasses(p.proposal_status)">
										{{ labelize(p.proposal_status) }}
									</span>
								</div>
								<div class="flex items-center justify-between text-xs text-muted-foreground">
									<span>{{ formatDate(p.date_sent) }}</span>
									<span v-if="p.total_value" class="tabular-nums font-medium text-foreground">{{ formatCurrency(Number(p.total_value)) }}</span>
								</div>
							</NuxtLink>
						</div>
						<p v-else class="text-sm text-muted-foreground text-center py-6">No proposals yet.</p>
					</div>

					<!-- Contracts -->
					<div class="ios-card p-5">
						<div class="flex items-center justify-between mb-4">
							<h2 class="font-medium flex items-center gap-2">
								<Icon name="lucide:file-signature" class="w-4 h-4 text-muted-foreground" />
								Recent Contracts
							</h2>
							<NuxtLink to="/portal/contracts" class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline">
								View all
								<Icon name="lucide:chevron-right" class="w-3 h-3" />
							</NuxtLink>
						</div>
						<div v-if="recentContracts.length" class="space-y-2">
							<NuxtLink
								v-for="c in recentContracts"
								:key="c.id"
								:to="`/portal/contracts/${c.id}`"
								class="flex flex-col gap-1 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
							>
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium truncate">{{ c.title }}</span>
									<span class="text-xs px-2 py-0.5 rounded-full shrink-0" :class="getStatusBadgeClasses(c.contract_status)">
										{{ labelize(c.contract_status) }}
									</span>
								</div>
								<div class="flex items-center justify-between text-xs text-muted-foreground">
									<span>{{ c.signed_at ? `Signed ${formatDate(c.signed_at)}` : formatDate(c.date_sent) }}</span>
									<span v-if="c.total_value" class="tabular-nums font-medium text-foreground">{{ formatCurrency(Number(c.total_value)) }}</span>
								</div>
							</NuxtLink>
						</div>
						<p v-else class="text-sm text-muted-foreground text-center py-6">No contracts yet.</p>
					</div>
				</div>
			</template>
		</LayoutPageContainer>
	</div>
</template>

<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Invoices | Client Portal' });

const { selectedOrg } = useOrganization();

const loading = ref(true);
const invoices = ref<any[]>([]);
const filter = ref<'all' | 'unpaid' | 'paid'>('all');

const invoiceSegments = [
	{ key: 'all' as const,    label: 'All',    icon: 'lucide:layers' },
	{ key: 'unpaid' as const, label: 'Unpaid', icon: 'lucide:clock' },
	{ key: 'paid' as const,   label: 'Paid',   icon: 'lucide:check-circle-2' },
];

async function loadInvoices() {
	loading.value = true;
	try {
		const res = await $fetch<{ invoices: any[] }>(`/api/portal/invoices?status=${filter.value}`);
		invoices.value = res?.invoices ?? [];
	} catch (err) {
		console.error('Failed to load invoices:', err);
		invoices.value = [];
	} finally {
		loading.value = false;
	}
}

// Colors route through canonical useStatusStyle buckets (palette-driven,
// consistent app-wide).
const { getStatusBadgeClasses } = useStatusStyle();
const statusConfig: Record<string, { label: string; classes: string }> = {
	pending:    { label: 'Pending',    classes: getStatusBadgeClasses('pending') },
	processing: { label: 'Processing', classes: getStatusBadgeClasses('processing') },
	paid:       { label: 'Paid',       classes: getStatusBadgeClasses('paid') },
	overdue:    { label: 'Overdue',    classes: getStatusBadgeClasses('overdue') },
	archived:   { label: 'Archived',   classes: getStatusBadgeClasses('archived') },
};

function formatCurrency(amount: number) {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount ?? 0);
}

function formatDate(d: string) {
	if (!d) return '—';
	return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(invoice: any) {
	if (!invoice.due_date || invoice.status === 'paid' || invoice.status === 'archived') return false;
	return new Date(invoice.due_date) < new Date();
}

const amountPaid = (invoice: any) =>
	(invoice.payments ?? [])
		.filter((p: any) => p.status === 'paid')
		.reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

onMounted(() => loadInvoices());
watch(() => selectedOrg.value, () => loadInvoices());
watch(filter, () => loadInvoices());
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Invoices" />

		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-4 -mt-1">View your billing history and payment status.</p>

			<AppFloorStrip v-model="filter" :items="invoiceSegments" aria-label="Invoice filter" />

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty State -->
		<div v-else-if="!invoices.length" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:file-text" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">No invoices found.</p>
		</div>

		<!-- Invoice List -->
		<div v-else class="space-y-2">
			<NuxtLink
				v-for="invoice in invoices"
				:key="invoice.id"
				:to="`/portal/invoices/${invoice.id}`"
				class="ios-card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group"
			>
				<!-- Icon -->
				<div class="flex items-center justify-center w-10 h-10 rounded-full bg-muted/60 shrink-0">
					<Icon name="lucide:file-text" class="w-5 h-5 text-muted-foreground" />
				</div>

				<!-- Details -->
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2 mb-0.5">
						<span class="text-sm font-medium">{{ invoice.invoice_code || `INV-${invoice.id.slice(0, 8)}` }}</span>
						<span
							class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
							:class="(isOverdue(invoice) ? statusConfig.overdue : statusConfig[invoice.status] ?? statusConfig.draft).classes"
						>
							{{ isOverdue(invoice) ? 'Overdue' : (statusConfig[invoice.status]?.label ?? invoice.status) }}
						</span>
					</div>
					<div class="flex items-center gap-3 text-xs text-muted-foreground">
						<span v-if="invoice.invoice_date">{{ formatDate(invoice.invoice_date) }}</span>
						<span v-if="invoice.due_date" class="flex items-center gap-1">
							<Icon name="lucide:clock" class="w-3 h-3" />
							Due {{ formatDate(invoice.due_date) }}
						</span>
					</div>
				</div>

				<!-- Amount -->
				<div class="text-right shrink-0">
					<p class="text-sm font-semibold">{{ formatCurrency(invoice.total_amount) }}</p>
					<p v-if="invoice.status !== 'paid' && amountPaid(invoice) > 0" class="text-[10px] text-muted-foreground">
						{{ formatCurrency(amountPaid(invoice)) }} paid
					</p>
				</div>

				<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
			</NuxtLink>
		</div>
		</LayoutPageContainer>
	</div>
</template>

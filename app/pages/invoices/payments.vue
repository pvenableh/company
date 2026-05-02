<script setup lang="ts">
import { Button } from '~/components/ui/button';

definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Payments | Earnest' });

const { canAccess } = useOrgRole();
const paymentsReceivedItems = useDirectusItems('payments_received');

const payments = ref<any[]>([]);
const loading = ref(true);

const fetchPayments = async () => {
	loading.value = true;
	try {
		payments.value = await paymentsReceivedItems.list({
			fields: ['*', 'invoice_id.id', 'invoice_id.invoice_code', 'invoice_id.status', 'invoice_id.total_amount', 'invoice_id.client.*'],
			sort: ['-date_received'],
			limit: 100,
		});
	} catch (e) {
		console.error('Failed to load payments:', e);
	} finally {
		loading.value = false;
	}
};

onMounted(fetchPayments);

function formatCurrency(amount: number | null | undefined): string {
	if (amount == null) return '$0.00';
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// Uses getFriendlyDateThree from utils/dates.ts
function formatDate(dateStr: string | null | undefined): string {
	return getFriendlyDateThree(dateStr) || '—';
}

const { getStatusBadgeClasses } = useStatusStyle();

const totalReceived = computed(() => {
	return payments.value.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
});
</script>

<template>
	<LayoutPageContainer>
		<div class="flex items-center justify-between mb-6">
			<div class="flex items-center gap-3">
				<NuxtLink
					to="/invoices"
					class="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				>
					<Icon name="lucide:arrow-left" class="w-5 h-5" />
				</NuxtLink>
				<div>
					<h1 class="text-xl font-semibold text-foreground">Payments</h1>
					<p class="text-sm text-muted-foreground">Payment history for your invoices</p>
				</div>
			</div>
		</div>

		<!-- Summary card -->
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6" v-if="!loading && canAccess('invoices')">
			<div class="ios-card p-5">
				<p class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Received</p>
				<p class="text-2xl font-bold text-foreground">{{ formatCurrency(totalReceived) }}</p>
			</div>
			<div class="ios-card p-5">
				<p class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Payments</p>
				<p class="text-2xl font-bold text-foreground">{{ payments.length }}</p>
			</div>
			<div class="ios-card p-5">
				<p class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Latest Payment</p>
				<p class="text-2xl font-bold text-foreground">
					{{ payments.length > 0 ? formatDate(payments[0]?.date_received) : '—' }}
				</p>
			</div>
		</div>

		<!-- Loading state -->
		<div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
			<p class="text-sm text-muted-foreground">Loading payments...</p>
		</div>

		<!-- No access -->
		<div v-else-if="!canAccess('invoices')" class="text-center py-16">
			<Icon name="lucide:lock" class="w-10 h-10 text-muted-foreground mx-auto mb-3" />
			<p class="text-sm text-muted-foreground">You don't have access to view payments.</p>
		</div>

		<!-- Empty state -->
		<div v-else-if="payments.length === 0" class="text-center py-16">
			<Icon name="lucide:credit-card" class="w-10 h-10 text-muted-foreground mx-auto mb-3" />
			<p class="text-muted-foreground">No payments received yet.</p>
		</div>

		<!-- Payments table -->
		<div v-else class="ios-card overflow-hidden">
			<table class="w-full">
				<thead>
					<tr class="border-b text-left">
						<th class="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
						<th class="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoice</th>
						<th class="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
						<th class="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
						<th class="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Method</th>
						<th class="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="payment in payments"
						:key="payment.id"
						class="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
					>
						<td class="px-4 py-3 text-sm">{{ formatDate(payment.date_received) }}</td>
						<td class="px-4 py-3 text-sm">
							<NuxtLink
								v-if="payment.invoice_id?.id"
								:to="`/invoices/${payment.invoice_id.id}`"
								class="text-blue-500 hover:text-blue-400 font-medium"
							>
								{{ payment.invoice_id.invoice_code || 'View Invoice' }}
							</NuxtLink>
							<span v-else class="text-muted-foreground">—</span>
						</td>
						<td class="px-4 py-3 text-sm">
							{{ payment.invoice_id?.client?.name || '—' }}
						</td>
						<td class="px-4 py-3 text-sm font-medium">{{ formatCurrency(Number(payment.amount) || 0) }}</td>
						<td class="px-4 py-3 text-sm text-muted-foreground capitalize">
							{{ payment.payment_method || payment.method || '—' }}
						</td>
						<td class="px-4 py-3 text-sm">
							<span
								class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
								:class="getStatusBadgeClasses(payment.status)"
							>
								{{ payment.status || 'completed' }}
							</span>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</LayoutPageContainer>
</template>

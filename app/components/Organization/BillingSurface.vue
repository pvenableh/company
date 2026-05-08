<script setup lang="ts">
// Phase 3 of Stripe Connect (Standard accounts). Rendered inside the Billing tab once
// the org's connected account is `active`. Surfaces Transactions / Refunds /
// Payouts / Balance — all data lives on Stripe, we just relay it through
// org-scoped server routes and render natively. No leaving Earnest for the
// Stripe dashboard for day-to-day operations.

const props = defineProps<{
	organizationId: string;
}>();

interface Transaction {
	id: string;
	type: string;
	status: string;
	amount: number;
	fee: number;
	net: number;
	currency: string;
	description: string | null;
	created: number;
	availableOn: number;
	sourceId: string | null;
	charge: {
		id: string;
		paymentIntent: string | null;
		receiptUrl: string | null;
		refunded: boolean;
		amountRefunded: number;
		invoiceId: string | null;
		invoiceCode: string | null;
	} | null;
}

interface Refund {
	id: string;
	amount: number;
	currency: string;
	status: string;
	reason: string | null;
	created: number;
	chargeId: string | undefined;
	paymentIntentId: string | null;
	receiptUrl: string | null;
	invoiceId: string | null;
	invoiceCode: string | null;
}

interface Payout {
	id: string;
	amount: number;
	currency: string;
	status: string;
	arrivalDate: number;
	created: number;
	method: string;
	type: string;
	statementDescriptor: string | null;
	failureCode: string | null;
	failureMessage: string | null;
	automatic: boolean;
}

interface BalanceResponse {
	available: Record<string, number>;
	pending: Record<string, number>;
	instantAvailable: Record<string, number>;
}

const toast = useToast();

const subTabs = [
	{ slot: 'transactions', label: 'Transactions', icon: 'i-heroicons-list-bullet' },
	{ slot: 'refunds', label: 'Refunds', icon: 'i-heroicons-arrow-uturn-left' },
	{ slot: 'payouts', label: 'Payouts', icon: 'i-heroicons-banknotes' },
	{ slot: 'balance', label: 'Balance', icon: 'i-heroicons-scale' },
];
const activeSub = ref(0);

// ── Balance (cheap, fetch on mount) ─────────────────────────────────────────
const balance = ref<BalanceResponse | null>(null);
const balanceLoading = ref(false);

const fetchBalance = async () => {
	balanceLoading.value = true;
	try {
		balance.value = await $fetch('/api/stripe/connect/balance', {
			query: { organizationId: props.organizationId },
		});
	} catch (err: any) {
		toast.add({
			title: 'Could not load balance',
			description: err?.data?.message || err?.message,
			color: 'red',
		});
	} finally {
		balanceLoading.value = false;
	}
};

// ── Transactions ────────────────────────────────────────────────────────────
const transactions = ref<Transaction[]>([]);
const transactionsLoading = ref(false);
const transactionsHasMore = ref(false);

const fetchTransactions = async (loadMore = false) => {
	transactionsLoading.value = true;
	try {
		const startingAfter = loadMore && transactions.value.length
			? transactions.value[transactions.value.length - 1]!.id
			: undefined;
		const res = await $fetch<{ data: Transaction[]; hasMore: boolean }>(
			'/api/stripe/connect/transactions',
			{
				query: {
					organizationId: props.organizationId,
					limit: 25,
					...(startingAfter ? { starting_after: startingAfter } : {}),
				},
			},
		);
		transactions.value = loadMore ? [...transactions.value, ...res.data] : res.data;
		transactionsHasMore.value = res.hasMore;
	} catch (err: any) {
		toast.add({
			title: 'Could not load transactions',
			description: err?.data?.message || err?.message,
			color: 'red',
		});
	} finally {
		transactionsLoading.value = false;
	}
};

// ── Refunds ─────────────────────────────────────────────────────────────────
const refunds = ref<Refund[]>([]);
const refundsLoading = ref(false);
const refundsHasMore = ref(false);

const fetchRefunds = async (loadMore = false) => {
	refundsLoading.value = true;
	try {
		const startingAfter = loadMore && refunds.value.length
			? refunds.value[refunds.value.length - 1]!.id
			: undefined;
		const res = await $fetch<{ data: Refund[]; hasMore: boolean }>(
			'/api/stripe/connect/refunds',
			{
				query: {
					organizationId: props.organizationId,
					limit: 25,
					...(startingAfter ? { starting_after: startingAfter } : {}),
				},
			},
		);
		refunds.value = loadMore ? [...refunds.value, ...res.data] : res.data;
		refundsHasMore.value = res.hasMore;
	} catch (err: any) {
		toast.add({
			title: 'Could not load refunds',
			description: err?.data?.message || err?.message,
			color: 'red',
		});
	} finally {
		refundsLoading.value = false;
	}
};

// ── Payouts ─────────────────────────────────────────────────────────────────
const payouts = ref<Payout[]>([]);
const payoutsLoading = ref(false);
const payoutsHasMore = ref(false);

const fetchPayouts = async (loadMore = false) => {
	payoutsLoading.value = true;
	try {
		const startingAfter = loadMore && payouts.value.length
			? payouts.value[payouts.value.length - 1]!.id
			: undefined;
		const res = await $fetch<{ data: Payout[]; hasMore: boolean }>(
			'/api/stripe/connect/payouts',
			{
				query: {
					organizationId: props.organizationId,
					limit: 25,
					...(startingAfter ? { starting_after: startingAfter } : {}),
				},
			},
		);
		payouts.value = loadMore ? [...payouts.value, ...res.data] : res.data;
		payoutsHasMore.value = res.hasMore;
	} catch (err: any) {
		toast.add({
			title: 'Could not load payouts',
			description: err?.data?.message || err?.message,
			color: 'red',
		});
	} finally {
		payoutsLoading.value = false;
	}
};

// Lazy-load each section the first time the user views it.
watch(activeSub, (i) => {
	const slot = subTabs[i]?.slot;
	if (slot === 'transactions' && !transactions.value.length) fetchTransactions();
	if (slot === 'refunds' && !refunds.value.length) fetchRefunds();
	if (slot === 'payouts' && !payouts.value.length) fetchPayouts();
}, { immediate: true });

onMounted(() => fetchBalance());

// ── Refund modal ────────────────────────────────────────────────────────────
const refundOpen = ref(false);
const refundTarget = ref<Transaction | null>(null);
const refundAmount = ref<number | null>(null);
const refundReason = ref<'requested_by_customer' | 'duplicate' | 'fraudulent' | ''>('');
const refundNote = ref('');
const refundSubmitting = ref(false);

const openRefund = (txn: Transaction) => {
	refundTarget.value = txn;
	refundAmount.value = txn.amount; // default to full
	refundReason.value = 'requested_by_customer';
	refundNote.value = '';
	refundOpen.value = true;
};

const submitRefund = async () => {
	if (!refundTarget.value?.charge?.id || refundSubmitting.value) return;
	refundSubmitting.value = true;
	try {
		await $fetch('/api/stripe/connect/refund', {
			method: 'POST',
			body: {
				organizationId: props.organizationId,
				chargeId: refundTarget.value.charge.id,
				amount: refundAmount.value && refundAmount.value > 0 ? refundAmount.value : undefined,
				reason: refundReason.value || undefined,
				note: refundNote.value || undefined,
			},
		});
		toast.add({ title: 'Refund issued', color: 'green' });
		refundOpen.value = false;
		await Promise.all([fetchTransactions(), fetchRefunds(), fetchBalance()]);
	} catch (err: any) {
		toast.add({
			title: 'Refund failed',
			description: err?.data?.message || err?.message,
			color: 'red',
		});
	} finally {
		refundSubmitting.value = false;
	}
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const formatMoney = (cents: number, currency = 'usd') => {
	const sign = cents < 0 ? '-' : '';
	const abs = Math.abs(cents);
	return `${sign}${new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(abs / 100)}`;
};
const formatDate = (unix: number) => new Date(unix * 1000).toLocaleDateString();

const txnTypeLabel = (type: string) => {
	const map: Record<string, string> = {
		charge: 'Charge',
		refund: 'Refund',
		payout: 'Payout',
		stripe_fee: 'Stripe Fee',
		application_fee: 'Platform Fee',
		adjustment: 'Adjustment',
		transfer: 'Transfer',
	};
	return map[type] || type;
};

const statusColor = (status: string): 'green' | 'amber' | 'red' | 'gray' => {
	if (['available', 'paid', 'succeeded'].includes(status)) return 'green';
	if (['pending', 'in_transit'].includes(status)) return 'amber';
	if (['failed', 'canceled'].includes(status)) return 'red';
	return 'gray';
};
</script>

<template>
	<div class="space-y-6">
		<UTabs v-model="activeSub" :items="subTabs">
			<template #transactions>
				<div class="mt-4 space-y-4">
					<div class="flex items-center justify-between">
						<p class="text-sm text-muted-foreground">
							Online card and bank payments processed by Stripe. Manual payments (check, cash, Zelle, etc.) live on each invoice and aren't shown here.
						</p>
						<UiActionButton
							icon="lucide:refresh-cw"
							variant="ghost"
							size="xs"
							:loading="transactionsLoading"
							@click="fetchTransactions(false)"
						>
							Refresh
						</UiActionButton>
					</div>

					<div v-if="transactionsLoading && !transactions.length" class="flex items-center justify-center py-10 text-muted-foreground">
						<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin mr-2" />
						<span class="text-sm">Loading transactions…</span>
					</div>

					<div v-else-if="!transactions.length" class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
						No transactions yet. New invoice payments will land here.
					</div>

					<div v-else class="rounded-md border border-border overflow-hidden">
						<table class="w-full text-sm">
							<thead class="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
								<tr>
									<th class="text-left px-3 py-2 font-semibold">Date</th>
									<th class="text-left px-3 py-2 font-semibold">Type</th>
									<th class="text-left px-3 py-2 font-semibold">Invoice</th>
									<th class="text-right px-3 py-2 font-semibold">Gross</th>
									<th class="text-right px-3 py-2 font-semibold">Fee</th>
									<th class="text-right px-3 py-2 font-semibold">Net</th>
									<th class="text-right px-3 py-2 font-semibold">Actions</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="txn in transactions" :key="txn.id" class="border-t border-border">
									<td class="px-3 py-2 whitespace-nowrap">{{ formatDate(txn.created) }}</td>
									<td class="px-3 py-2">
										<UBadge :color="statusColor(txn.status)" variant="soft" size="xs">{{ txnTypeLabel(txn.type) }}</UBadge>
									</td>
									<td class="px-3 py-2">
										<NuxtLink
											v-if="txn.charge?.invoiceId"
											:to="`/invoices/${txn.charge.invoiceId}`"
											class="text-primary hover:underline"
										>
											{{ txn.charge.invoiceCode || txn.charge.invoiceId.slice(0, 8) }}
										</NuxtLink>
										<span v-else class="text-muted-foreground">—</span>
									</td>
									<td class="px-3 py-2 text-right tabular-nums">{{ formatMoney(txn.amount, txn.currency) }}</td>
									<td class="px-3 py-2 text-right tabular-nums text-muted-foreground">{{ formatMoney(-txn.fee, txn.currency) }}</td>
									<td class="px-3 py-2 text-right tabular-nums font-medium">{{ formatMoney(txn.net, txn.currency) }}</td>
									<td class="px-3 py-2 text-right">
										<div class="flex items-center justify-end gap-2">
											<a
												v-if="txn.charge?.receiptUrl"
												:href="txn.charge.receiptUrl"
												target="_blank"
												rel="noopener noreferrer"
												class="text-xs text-muted-foreground hover:text-foreground"
												title="Stripe receipt"
											>
												<UIcon name="i-heroicons-receipt-percent" class="w-4 h-4" />
											</a>
											<UButton
												v-if="txn.type === 'charge' && txn.charge && !txn.charge.refunded"
												size="xs"
												color="gray"
												variant="ghost"
												@click="openRefund(txn)"
											>
												Refund
											</UButton>
										</div>
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					<div v-if="transactionsHasMore" class="flex justify-center">
						<UiActionButton
							icon="lucide:chevron-down"
							variant="secondary"
							size="sm"
							:loading="transactionsLoading"
							@click="fetchTransactions(true)"
						>
							Load more
						</UiActionButton>
					</div>
				</div>
			</template>

			<template #refunds>
				<div class="mt-4 space-y-4">
					<div class="flex items-center justify-between">
						<p class="text-sm text-muted-foreground">Every refund issued from this account.</p>
						<UiActionButton
							icon="lucide:refresh-cw"
							variant="ghost"
							size="xs"
							:loading="refundsLoading"
							@click="fetchRefunds(false)"
						>
							Refresh
						</UiActionButton>
					</div>
					<div v-if="refundsLoading && !refunds.length" class="flex items-center justify-center py-10 text-muted-foreground">
						<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin mr-2" />
						<span class="text-sm">Loading refunds…</span>
					</div>
					<div v-else-if="!refunds.length" class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
						No refunds issued yet.
					</div>
					<div v-else class="rounded-md border border-border overflow-hidden">
						<table class="w-full text-sm">
							<thead class="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
								<tr>
									<th class="text-left px-3 py-2 font-semibold">Date</th>
									<th class="text-left px-3 py-2 font-semibold">Invoice</th>
									<th class="text-left px-3 py-2 font-semibold">Reason</th>
									<th class="text-right px-3 py-2 font-semibold">Amount</th>
									<th class="text-left px-3 py-2 font-semibold">Status</th>
									<th class="text-right px-3 py-2 font-semibold"></th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="r in refunds" :key="r.id" class="border-t border-border">
									<td class="px-3 py-2 whitespace-nowrap">{{ formatDate(r.created) }}</td>
									<td class="px-3 py-2">
										<NuxtLink
											v-if="r.invoiceId"
											:to="`/invoices/${r.invoiceId}`"
											class="text-primary hover:underline"
										>
											{{ r.invoiceCode || r.invoiceId.slice(0, 8) }}
										</NuxtLink>
										<span v-else class="text-muted-foreground">—</span>
									</td>
									<td class="px-3 py-2 text-muted-foreground">{{ r.reason || '—' }}</td>
									<td class="px-3 py-2 text-right tabular-nums">{{ formatMoney(r.amount, r.currency) }}</td>
									<td class="px-3 py-2">
										<UBadge :color="statusColor(r.status)" variant="soft" size="xs">{{ r.status }}</UBadge>
									</td>
									<td class="px-3 py-2 text-right">
										<a
											v-if="r.receiptUrl"
											:href="r.receiptUrl"
											target="_blank"
											rel="noopener noreferrer"
											class="text-xs text-muted-foreground hover:text-foreground"
											title="Stripe receipt"
										>
											<UIcon name="i-heroicons-receipt-percent" class="w-4 h-4" />
										</a>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
					<div v-if="refundsHasMore" class="flex justify-center">
						<UiActionButton
							icon="lucide:chevron-down"
							variant="secondary"
							size="sm"
							:loading="refundsLoading"
							@click="fetchRefunds(true)"
						>
							Load more
						</UiActionButton>
					</div>
				</div>
			</template>

			<template #payouts>
				<div class="mt-4 space-y-4">
					<div class="flex items-center justify-between">
						<p class="text-sm text-muted-foreground">
							Bank deposits from this account. Stripe pays out on a 2-day rolling schedule by default.
						</p>
						<UiActionButton
							icon="lucide:refresh-cw"
							variant="ghost"
							size="xs"
							:loading="payoutsLoading"
							@click="fetchPayouts(false)"
						>
							Refresh
						</UiActionButton>
					</div>
					<div v-if="payoutsLoading && !payouts.length" class="flex items-center justify-center py-10 text-muted-foreground">
						<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin mr-2" />
						<span class="text-sm">Loading payouts…</span>
					</div>
					<div v-else-if="!payouts.length" class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
						No payouts yet. Once Stripe holds enough balance, payouts will appear here.
					</div>
					<div v-else class="rounded-md border border-border overflow-hidden">
						<table class="w-full text-sm">
							<thead class="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
								<tr>
									<th class="text-left px-3 py-2 font-semibold">Arrival</th>
									<th class="text-left px-3 py-2 font-semibold">Method</th>
									<th class="text-right px-3 py-2 font-semibold">Amount</th>
									<th class="text-left px-3 py-2 font-semibold">Status</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="p in payouts" :key="p.id" class="border-t border-border">
									<td class="px-3 py-2 whitespace-nowrap">{{ formatDate(p.arrivalDate) }}</td>
									<td class="px-3 py-2 capitalize">{{ p.method.replace(/_/g, ' ') }}</td>
									<td class="px-3 py-2 text-right tabular-nums font-medium">{{ formatMoney(p.amount, p.currency) }}</td>
									<td class="px-3 py-2">
										<UBadge :color="statusColor(p.status)" variant="soft" size="xs">{{ p.status }}</UBadge>
										<span v-if="p.failureMessage" class="block text-[10px] text-red-500 mt-1">{{ p.failureMessage }}</span>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
					<div v-if="payoutsHasMore" class="flex justify-center">
						<UiActionButton
							icon="lucide:chevron-down"
							variant="secondary"
							size="sm"
							:loading="payoutsLoading"
							@click="fetchPayouts(true)"
						>
							Load more
						</UiActionButton>
					</div>
				</div>
			</template>

			<template #balance>
				<div class="mt-4">
					<div v-if="balanceLoading" class="flex items-center justify-center py-10 text-muted-foreground">
						<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin mr-2" />
						<span class="text-sm">Loading balance…</span>
					</div>
					<div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<UCard>
							<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Available</div>
							<div class="mt-1 text-2xl font-semibold tabular-nums">
								{{ formatMoney(balance?.available?.usd || 0) }}
							</div>
							<p class="text-xs text-muted-foreground mt-2">Settled funds ready to pay out.</p>
						</UCard>
						<UCard>
							<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Pending</div>
							<div class="mt-1 text-2xl font-semibold tabular-nums">
								{{ formatMoney(balance?.pending?.usd || 0) }}
							</div>
							<p class="text-xs text-muted-foreground mt-2">Charges still in Stripe's clearing window.</p>
						</UCard>
						<UCard>
							<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Instant Available</div>
							<div class="mt-1 text-2xl font-semibold tabular-nums">
								{{ formatMoney(balance?.instantAvailable?.usd || 0) }}
							</div>
							<p class="text-xs text-muted-foreground mt-2">Eligible for instant payout (where supported).</p>
						</UCard>
					</div>
				</div>
			</template>
		</UTabs>

		<!-- Refund modal -->
		<UModal v-model="refundOpen" title="Issue Refund" class="sm:max-w-md">
			<div v-if="refundTarget" class="space-y-4 text-sm">
				<div class="rounded-md bg-muted/50 p-3 space-y-1">
					<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Charge</div>
					<div class="tabular-nums">
						{{ formatMoney(refundTarget.amount, refundTarget.currency) }}
						<span class="text-muted-foreground"> on {{ formatDate(refundTarget.created) }}</span>
					</div>
					<div v-if="refundTarget.charge?.invoiceCode" class="text-xs text-muted-foreground">
						Invoice {{ refundTarget.charge.invoiceCode }}
					</div>
				</div>

				<UFormGroup label="Refund amount (cents)" hint="Defaults to full refund. Edit for a partial.">
					<UInput v-model.number="refundAmount" type="number" :min="1" :max="refundTarget.amount" />
				</UFormGroup>

				<UFormGroup label="Reason">
					<USelect
						v-model="refundReason"
						:options="[
							{ label: 'Requested by customer', value: 'requested_by_customer' },
							{ label: 'Duplicate charge', value: 'duplicate' },
							{ label: 'Fraudulent', value: 'fraudulent' },
						]"
					/>
				</UFormGroup>

				<UFormGroup label="Internal note (optional)">
					<UTextarea v-model="refundNote" :rows="2" placeholder="Why this refund was issued — saved on the payment record." />
				</UFormGroup>
			</div>
			<template #footer>
				<div class="flex justify-end gap-2">
					<UiActionButton
						icon="lucide:arrow-uturn-left"
						variant="primary"
						:loading="refundSubmitting"
						@click="submitRefund"
					>
						Issue refund
					</UiActionButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

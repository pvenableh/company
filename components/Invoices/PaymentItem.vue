<script setup>
const props = defineProps({
	payment: {
		type: Object,
		required: true,
	},
});

const chargeDetails = ref(null);
const payoutDetails = ref(null);
const isLoading = ref(false);
const showDetails = ref(false);
const { getCharge } = useStripeCharge();
const { getPayout } = useStripePayout();
const toast = useToast();

const formatDate = (dateString) => {
	return new Date(dateString).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
};

const formatAmount = (amount) => {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(amount / 100); // Stripe amounts are in cents
};

const getStatusColor = (status) => {
	const statusColors = {
		succeeded: 'green',
		pending: 'yellow',
		failed: 'red',
		processing: 'blue',
		paid: 'green',
		in_transit: 'blue',
		canceled: 'red',
		failed: 'red',
	};
	return statusColors[status] || 'gray';
};

const loadDetails = async () => {
	if (!props.payment.charge_id || (chargeDetails.value && payoutDetails.value)) return;

	isLoading.value = true;
	try {
		const [charge, payout] = await Promise.all([
			getCharge(props.payment.charge_id),
			getPayout(props.payment.charge_id),
		]);

		chargeDetails.value = charge;
		payoutDetails.value = payout;
	} catch (error) {
		console.error('Error loading payment details:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to load payment details',
			color: 'red',
		});
	} finally {
		isLoading.value = false;
	}
};

// Watch for details panel expansion
watch(showDetails, async (newValue) => {
	if (newValue) {
		await loadDetails();
	}
});
</script>

<template>
	<div class="border dark:border-gray-700 rounded-lg p-4 mb-4">
		<!-- Payment Header -->
		<div class="flex justify-between items-start mb-4">
			<div>
				<div class="flex items-center gap-2">
					<UIcon
						:name="payment.payment_method === 'card' ? 'i-heroicons-credit-card' : 'i-heroicons-building-library'"
						class="w-5 h-5"
					/>
					<span class="text-sm font-medium">Payment on {{ formatDate(payment.date_created) }}</span>
				</div>
				<div class="text-xs text-gray-500 mt-1">Method: {{ payment.payment_method }}</div>
			</div>
			<UBadge
				:color="getStatusColor(payment.stripe_status)"
				:variant="payment.stripe_status === 'succeeded' ? 'solid' : 'soft'"
			>
				{{ payment.stripe_status }}
			</UBadge>
		</div>

		<!-- Payment Amount -->
		<div class="flex justify-between items-center mb-4">
			<div class="text-lg font-medium">${{ payment.amount }}</div>
			<div class="flex gap-2">
				<UButton
					v-if="payment.receipt_url"
					icon="i-heroicons-receipt-percent-solid"
					:to="payment.receipt_url"
					target="_blank"
					size="xs"
					color="gray"
					variant="outline"
					class="flex items-center gap-2"
					:ui="{ rounded: 'rounded-full' }"
				>
					Receipt
				</UButton>
			</div>
		</div>

		<div v-if="payment.charge_id" class="space-y-2 text-sm">
			<div v-if="isLoading" class="flex justify-center py-4">
				<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
			</div>

			<div v-else-if="chargeDetails">
				<!-- Card Details -->
				<div v-if="chargeDetails.card">
					<p class="text-sm font-medium text-gray-500 dark:text-gray-100 mb-2 uppercase font-bold">Card Details</p>
					<div class="grid grid-cols-2 gap-2 text-xs">
						<div>
							<UIcon :name="`i-logos-${chargeDetails.card.brand}`" class="w-8 h-6 mr-1 shadow border border-gray-100" />
							Last 4: •••• {{ chargeDetails.card.last4 }}
						</div>
						<div>Expires: {{ chargeDetails.card.exp_month }}/{{ chargeDetails.card.exp_year }}</div>
					</div>
				</div>

				<!-- Bank Account Details -->
				<div v-else-if="chargeDetails.bank_account">
					<p class="text-sm font-medium text-gray-500 dark:text-gray-100 mb-2 uppercase font-bold">Bank Details</p>
					<div class="grid grid-cols-2 gap-2 text-xs">
						<div>Bank: {{ chargeDetails.bank_account.bank_name }}</div>
						<div>Account: •••• {{ chargeDetails.bank_account.last4 }}</div>
					</div>
				</div>

				<!-- Transaction Details -->
				<div class="">
					<p class="payment-item__subtitle">Transaction Details:</p>
					<div class="grid grid-cols-2 gap-2 text-xs">
						<div>Transaction ID: {{ chargeDetails.id }}</div>
						<div>Date: {{ formatDate(chargeDetails.created * 1000) }}</div>
						<div>Status: {{ chargeDetails.status }}</div>
					</div>
				</div>
				<!-- Payout Details -->
				<div v-if="payoutDetails?.payout" class="">
					<p class="payment-item__subtitle">Payout Details:</p>
					<div class="grid grid-cols-2 gap-2 text-xs">
						<div>Payout Amount: {{ formatAmount(payoutDetails.payout.amount) }}</div>
						<div>
							Status:
							<UBadge :color="getStatusColor(payoutDetails.payout.status)" class="ml-1">
								{{ payoutDetails.payout.status }}
							</UBadge>
						</div>
						<div>Expected Date: {{ formatDate(payoutDetails.payout.arrival_date * 1000) }}</div>
						<div>Type: {{ payoutDetails.payout.type }}</div>
					</div>

					<!-- Transaction Summary -->
					<div v-if="payoutDetails.transactions?.length" class="">
						<p class="payment-item__subtitle">Transaction Summary:</p>
						<div class="space-y-1">
							<div v-for="transaction in payoutDetails.transactions" :key="transaction.id" class="text-xs">
								{{ transaction.description }}: {{ formatAmount(transaction.amount) }}
							</div>
						</div>
					</div>
				</div>

				<!-- Transfer Details -->
				<div v-if="payoutDetails?.transfer" class="">
					<p class="payment-item__subtitle">Transfer Details:</p>
					<div class="grid grid-cols-2 gap-2 text-xs">
						<div>Transfer ID: {{ payoutDetails.transfer.id }}</div>
						<div>Amount: {{ formatAmount(payoutDetails.transfer.amount) }}</div>
						<div>Status: {{ payoutDetails.transfer.status }}</div>
						<div>Created: {{ formatDate(payoutDetails.transfer.created * 1000) }}</div>
					</div>
				</div>
			</div>
		</div>

		<InvoicesPaymentEvents v-if="payment.payment_intent" :payment-intent-id="payment.payment_intent" class="mt-8" />
	</div>
</template>
<style>
.payment-item {
	&__subtitle {
		@apply text-sm font-medium text-gray-500 dark:text-gray-100 mb-2 uppercase font-bold border-l-8 border-gray-500 leading-3 pl-1;
	}
}
</style>

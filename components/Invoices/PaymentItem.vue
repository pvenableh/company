<script setup>
const props = defineProps({
	payment: {
		type: Object,
		required: true,
	},
});

const chargeDetails = ref(null);
const isLoading = ref(false);
const showDetails = ref(false);
const { getCharge } = useStripeCharge();
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

const getStatusColor = (status) => {
	const statusColors = {
		succeeded: 'green',
		pending: 'yellow',
		failed: 'red',
		processing: 'blue',
	};
	return statusColors[status] || 'gray';
};

const loadChargeDetails = async () => {
	if (!props.payment.charge_id || chargeDetails.value) return;

	isLoading.value = true;
	try {
		chargeDetails.value = await getCharge(props.payment.charge_id);
	} catch (error) {
		console.error('Error loading charge details:', error);
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
		await loadChargeDetails();
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
					icon="i-heroicons-receipt"
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

		<!-- Expandable Details -->
		<div v-if="payment.charge_id">
			<UButton
				size="xs"
				color="gray"
				variant="ghost"
				:loading="isLoading"
				class="flex items-center gap-2 w-full justify-start"
				@click="showDetails = !showDetails"
			>
				<UIcon :name="showDetails ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-4 h-4" />
				{{ showDetails ? 'Hide' : 'Show' }} Details
			</UButton>

			<div v-if="showDetails" class="mt-4 space-y-2 text-sm">
				<div v-if="isLoading" class="flex justify-center py-4">
					<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
				</div>

				<template v-else-if="chargeDetails">
					<!-- Card Details -->
					<template v-if="chargeDetails.card">
						<p class="text-gray-500">Card Details</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							<div>Card Type: {{ chargeDetails.card.brand }}</div>
							<div>Last 4: •••• {{ chargeDetails.card.last4 }}</div>
							<div>Expires: {{ chargeDetails.card.exp_month }}/{{ chargeDetails.card.exp_year }}</div>
						</div>
					</template>

					<!-- Bank Account Details -->
					<template v-else-if="chargeDetails.bank_account">
						<p class="text-gray-500">Bank Details</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							<div>Bank: {{ chargeDetails.bank_account.bank_name }}</div>
							<div>Account: •••• {{ chargeDetails.bank_account.last4 }}</div>
						</div>
					</template>

					<!-- Transaction Details -->
					<div class="mt-4 pt-4 border-t dark:border-gray-700">
						<p class="text-gray-500 mb-2">Transaction Details</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							<div>Transaction ID: {{ chargeDetails.id }}</div>
							<div>Date: {{ formatDate(chargeDetails.created * 1000) }}</div>
							<div>Status: {{ chargeDetails.status }}</div>
						</div>
					</div>
				</template>
			</div>
		</div>
	</div>
</template>

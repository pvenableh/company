<script setup>
const props = defineProps({
	payment: {
		type: Object,
		required: true,
	},
});

// Uses formatDateWithTime from utils/dates.ts
const formatDate = (dateString) => formatDateWithTime(dateString);

const { getStatusColorName: getStatusColor } = useStatusStyle();

// Manual rows have no Stripe identifiers
const isManual = computed(() => !props.payment?.payment_intent && !props.payment?.charge_id);

const methodIcon = computed(() => {
	const m = (props.payment?.payment_method || '').toLowerCase();
	if (m === 'check') return 'i-heroicons-document-check';
	if (m === 'zelle') return 'i-heroicons-paper-airplane';
	if (m === 'venmo') return 'i-heroicons-device-phone-mobile';
	if (m === 'cash') return 'i-heroicons-banknotes';
	if (m === 'card') return 'i-heroicons-credit-card';
	if (m === 'us_bank_account') return 'i-heroicons-building-library';
	return 'i-heroicons-wallet';
});

const methodLabel = computed(() => {
	const m = (props.payment?.payment_method || '').toLowerCase();
	if (m === 'check') return 'Check';
	if (m === 'zelle') return 'Zelle';
	if (m === 'venmo') return 'Venmo';
	if (m === 'cash') return 'Cash';
	if (m === 'card') return 'Card';
	if (m === 'us_bank_account') return 'Bank';
	if (!m) return 'Payment';
	return props.payment.payment_method;
});
</script>

<template>
	<div class="border dark:border-gray-700 rounded-lg p-4 mb-4">
		<!-- Payment Header -->
		<div class="flex justify-between items-start mb-4">
			<div>
				<div class="flex items-center gap-2">
					<UIcon :name="methodIcon" class="w-5 h-5" />
					<span class="text-sm font-medium">
						{{ methodLabel }} on {{ formatDate(payment.date_received || payment.date_created) }}
					</span>
				</div>
				<div v-if="payment.reference" class="text-xs text-gray-500 mt-1">Reference: {{ payment.reference }}</div>
				<div v-if="isManual && payment.note" class="text-xs text-gray-500 mt-1 italic">{{ payment.note }}</div>
			</div>
			<UBadge
				v-if="payment.stripe_status"
				:color="getStatusColor(payment.stripe_status)"
				:variant="payment.stripe_status === 'succeeded' ? 'solid' : 'soft'"
			>
				{{ payment.stripe_status }}
			</UBadge>
			<UBadge
				v-else
				:color="getStatusColor(payment.status)"
				:variant="payment.status === 'paid' ? 'solid' : 'soft'"
			>
				{{ payment.status }}
			</UBadge>
		</div>

		<!-- Payment Amount + Receipt -->
		<div class="flex justify-between items-center">
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

		<InvoicesPaymentEvents v-if="payment.payment_intent" :payment-intent-id="payment.payment_intent" class="mt-8" />
	</div>
</template>

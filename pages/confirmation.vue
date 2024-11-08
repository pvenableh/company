<template>
	<div class="relative flex items-center justify-center flex-col px-6 pt-12 pb-24 min-h-screen">
		<!-- Loading State -->
		<div v-if="isLoading" class="w-full flex flex-col items-center justify-center">
			<p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Processing your payment...</p>
		</div>

		<!-- Error State -->
		<div v-else-if="error" class="w-full max-w-md">
			<UAlert type="error" :title="error.title" :description="error.message" class="mb-4">
				<template #icon>
					<Icon name="heroicons:exclamation-circle" />
				</template>
				<template #footer>
					<UButton v-if="error.recoverable" size="sm" @click="retryConfirmation">Retry</UButton>
				</template>
			</UAlert>
			<div class="text-center">
				<UButton to="/support" variant="link" class="text-sm">Need help? Contact support</UButton>
			</div>
		</div>

		<!-- Success State -->
		<div v-else class="w-full max-w-md">
			<div class="text-center mb-8">
				<UIcon name="heroicons:check-circle" class="h-12 w-12 text-green-500 mx-auto mb-4" />
				<h1 class="text-2xl font-bold uppercase tracking-wider mb-2">Thank you for your payment</h1>
				<p class="text-gray-600 dark:text-gray-400">Your transaction has been completed</p>
			</div>

			<!-- Payment Details Card -->
			<UCard class="mb-6">
				<template #header>
					<div class="flex justify-between items-center">
						<h3 class="text-sm font-medium uppercase">Payment Details</h3>
						<UBadge :color="paymentStatusColor" :variant="paymentStatusVariant">
							{{ formatPaymentStatus }}
						</UBadge>
					</div>
				</template>

				<div class="space-y-4">
					<div v-for="(detail, index) in paymentDetails" :key="index" class="flex justify-between text-sm">
						<span class="text-gray-600 dark:text-gray-400">{{ detail.label }}</span>
						<span class="font-medium">{{ detail.value }}</span>
					</div>
				</div>

				<template #footer>
					<p class="text-xs text-gray-500">Payment ID: {{ paymentIntent?.id }}</p>
				</template>
			</UCard>

			<!-- Receipt Card -->
			<UCard v-if="receiptUrl" class="mb-6">
				<template #header>
					<div class="flex justify-between items-center">
						<h3 class="text-sm font-medium uppercase">Receipt</h3>
						<Icon name="heroicons:document-text" class="h-5 w-5 text-gray-400" />
					</div>
				</template>

				<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
					View or download your payment receipt for your records.
				</p>

				<UButton :href="receiptUrl" target="_blank" block>
					<template #leading>
						<Icon name="heroicons:receipt" />
					</template>
					View Receipt
				</UButton>
			</UCard>

			<!-- Action Buttons -->
			<div class="flex flex-col gap-4">
				<UButton v-if="payment?.invoice?.id" :to="`/invoices/${payment.invoice.id}`" block>
					<template #leading>
						<Icon name="heroicons:document-text" />
					</template>
					View Invoice
				</UButton>
				<UButton to="/dashboard" variant="ghost" block>
					<template #leading>
						<Icon name="heroicons:home" />
					</template>
					Return to Dashboard
				</UButton>
			</div>
		</div>
	</div>
</template>

<script setup>
import { loadStripe } from '@stripe/stripe-js';

const route = useRoute();
const config = useRuntimeConfig();
const toast = useToast();

// State
const isLoading = ref(true);
const error = ref(null);
const paymentIntent = ref(null);
const payment = useState('payment', () => ({}));
const clientSecret = computed(() => route.query.payment_intent_client_secret);

// Stripe instance
let stripe = null;

// Computed
const receiptUrl = computed(() => {
	return paymentIntent.value?.latest_charge?.receipt_url || null;
});

const paymentStatusColor = computed(() => {
	const statusColors = {
		succeeded: 'green',
		processing: 'blue',
		requires_payment_method: 'yellow',
		default: 'gray',
	};
	return statusColors[paymentIntent.value?.status] || statusColors.default;
});

const paymentStatusVariant = computed(() => (paymentIntent.value?.status === 'succeeded' ? 'solid' : 'soft'));

const formatPaymentStatus = computed(() => {
	const status = paymentIntent.value?.status || '';
	return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
});

const paymentDetails = computed(() => {
	if (!paymentIntent.value) return [];

	return [
		{
			label: 'Amount',
			value: formatCurrency(paymentIntent.value.amount / 100),
		},
		{
			label: 'Date',
			value: formatDate(paymentIntent.value.created * 1000),
		},
		{
			label: 'Email',
			value: paymentIntent.value.receipt_email,
		},
		payment.value?.bill_to && {
			label: 'Billed To',
			value: payment.value.bill_to,
		},
		payment.value?.invoice?.id && {
			label: 'Invoice ID',
			value: payment.value.invoice.id,
		},
	].filter(Boolean);
});

// Methods
const formatCurrency = (amount) => {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(amount);
};

const formatDate = (timestamp) => {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'America/New_York',
	}).format(new Date(timestamp));
};

const handleError = (err, recoverable = true) => {
	console.error('Payment Confirmation Error:', err);
	error.value = {
		title: 'Payment Confirmation Error',
		message: err.message || 'An error occurred while confirming your payment.',
		recoverable,
	};
	isLoading.value = false;
};

const getPaymentData = () => {
	try {
		const storedPayment = window?.localStorage?.getItem('payment');
		if (!storedPayment) {
			throw new Error('Payment information not found');
		}
		payment.value = JSON.parse(storedPayment);
	} catch (err) {
		handleError(err, false);
		return false;
	}
	return true;
};

const confirmPayment = async () => {
	try {
		if (!clientSecret.value) {
			throw new Error('Invalid payment session');
		}

		if (!getPaymentData()) return;

		// Initialize Stripe if not already done
		if (!stripe) {
			stripe = await loadStripe(config.public.stripePublic);
		}

		const { error: stripeError, paymentIntent: intent } = await stripe.retrievePaymentIntent(clientSecret.value, {
			expand: ['payment_method', 'latest_charge'],
		});

		if (stripeError) throw stripeError;

		paymentIntent.value = intent;

		// Send notification email
		await sendPaymentNotification(payment.value);

		// Record payment in Directus
		await recordPayment(intent);

		// Clean up
		cleanupPaymentData();

		isLoading.value = false;
	} catch (err) {
		handleError(err);
	}
};

const sendPaymentNotification = async (paymentData) => {
	const { error } = await useFetch('/api/paymentnotification', {
		method: 'POST',
		body: paymentData,
	});

	if (error.value) {
		toast.add({
			title: 'Notification Warning',
			description: 'Payment successful, but confirmation email could not be sent.',
			type: 'warning',
		});
	}
};

const recordPayment = async (intent) => {
	try {
		const { $directus } = useNuxtApp();
		await $directus.items('payments_received').createOne({
			status: 'published',
			name: payment.value.user?.name,
			email: payment.value.email,
			service: payment.value.id,
			date_received: new Date().toISOString(),
			payment_intent: intent.id,
			payment_total: payment.value.amount,
			metadata: {
				stripe_status: intent.status,
				payment_method: intent.payment_method?.type,
				charge_id: intent.latest_charge?.id,
				receipt_url: intent.latest_charge?.receipt_url,
			},
		});
	} catch (err) {
		console.error('Failed to record payment:', err);
	}
};

const cleanupPaymentData = () => {
	window.localStorage.removeItem('payment');
	// Keep payment.value for displaying confirmation details
};

const retryConfirmation = () => {
	error.value = null;
	isLoading.value = true;
	confirmPayment();
};

// Lifecycle
onMounted(() => {
	confirmPayment();
});

// Navigation guard
onBeforeRouteLeave((to, from, next) => {
	if (paymentIntent.value?.status === 'succeeded') {
		next();
	} else {
		// Show confirmation dialog before leaving
		if (window.confirm('Are you sure you want to leave? Payment confirmation is still in progress.')) {
			next();
		} else {
			next(false);
		}
	}
});
</script>

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

				<UButton :to="receiptUrl" target="_blank" icon="i-heroicons-document-text" class="text-center" block>
					View Receipt
				</UButton>
			</UCard>
			<!-- Action Buttons -->
			<div class="flex flex-col gap-4">
				<UButton v-if="invoiceID" :to="`/invoices/preview/${invoiceID}`" block>
					<template #leading>
						<Icon name="heroicons:document-text" />
					</template>
					View Invoice
				</UButton>
				<UButton to="/dashboard" variant="outline" block>
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
definePageMeta({
	middleware: ['auth'],
});

import { loadStripe } from '@stripe/stripe-js';

const { user } = useDirectusAuth();
const route = useRoute();
const config = useRuntimeConfig();
const toast = useToast();
const { readItems, createItem } = useDirectusItems();

// State
const isLoading = ref(true);
const error = ref(null);
const paymentIntent = ref(null);
const payment = useState('payment', () => ({}));
const clientSecret = computed(() => route.query.payment_intent_client_secret);
const invoiceID = ref(null);

// Stripe instance
let stripe = null;

const baseUrl = computed(() => {
	// Check if we're in development mode
	if (process.dev) {
		return 'http://localhost:3000';
	}
	// Production URL
	return 'https://huestudios.company';
});

const receiptUrl = computed(() => {
	// Check if we have the full charge details fetched from the API
	if (paymentIntent.value?.latest_charge?.receipt_url) {
		return paymentIntent.value.latest_charge.receipt_url;
	}
	// If we only have the charge ID, return null
	return null;
});

// For debugging, you can add this watcher
watch(
	paymentIntent,
	(newVal) => {
		console.log('Payment Intent Updated:', {
			hasLatestCharge: !!newVal?.latest_charge,
			latestCharge: newVal?.latest_charge,
			receiptUrl: receiptUrl.value,
		});
	},
	{ deep: true },
);

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
	console.log(paymentIntent.value);
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
			value: payment.value.bill_to.name,
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

const getPaymentData = async () => {
	try {
		console.log('Attempting to retrieve payment data...');

		// First try localStorage
		const storedPayment = window?.localStorage?.getItem('payment');
		if (storedPayment) {
			payment.value = JSON.parse(storedPayment);
			return true;
		}

		// If no localStorage data, try to get from payment intent
		if (clientSecret.value) {
			// Extract payment intent ID from client secret
			const piId = clientSecret.value.split('_secret_')[0];
			console.log('Extracted Payment Intent ID:', piId);

			// Get payment intent details from Stripe
			const { error: stripeError, paymentIntent: intent } = await stripe.retrievePaymentIntent(clientSecret.value);

			if (stripeError) throw stripeError;

			console.log(intent);

			// Create minimal payment data from intent
			payment.value = {
				email: intent.receipt_email,
				amount: intent.amount,
				id: piId,
			};

			console.log('Created payment data from intent:', payment.value);
			return true;
		}

		throw new Error('No payment information found');
	} catch (err) {
		console.error('Payment Data Error:', err);
		handleError(err, false);
		return false;
	}
};

const confirmPayment = async () => {
	try {
		if (!clientSecret.value) {
			throw new Error('Invalid payment session');
		}

		// Initialize Stripe if not already done
		if (!stripe) {
			stripe = await loadStripe(config.public.stripePublic);
		}

		// Now get payment data after Stripe is initialized
		if (!(await getPaymentData())) return;

		// Get payment intent
		const { error: stripeError, paymentIntent: intent } = await stripe.retrievePaymentIntent(clientSecret.value);

		if (stripeError) {
			console.error('Stripe Error:', stripeError);
			throw stripeError;
		}

		if (!intent.latest_charge) {
			try {
				const chargeDetails = await $fetch(`/api/stripe/charges`, {
					params: {
						payment_id: intent.id,
					},
				});

				// Update the latest_charge with the full charge details
				intent.latest_charge = chargeDetails;

				console.log('Updated Intent with Charge Details:', {
					chargeId: intent.latest_charge.id,
					receiptUrl: intent.latest_charge.receipt_url,
				});
			} catch (chargeError) {
				console.error('Failed to retrieve charge details:', chargeError);
			}
		} else {
			console.warn('No charge details found in payment intent');
		}

		// Now set the payment intent with the updated charge details
		paymentIntent.value = intent;

		// Record payment in Directus
		await recordPayment(intent);

		// Send notification email

		// Clean up
		cleanupPaymentData();

		isLoading.value = false;
	} catch (err) {
		console.error('Payment Confirmation Failed:', err);
		handleError(err);
	}
};

const recordPayment = async (intent, chargeDetails) => {
	try {
		console.log('Checking for existing payment with Payment Intent ID:', intent.id);

		await $fetch('/api/email/test', {
			method: 'POST',
		});

		// Check if a payment with the given payment_intent already exists
		const existingPayments = await readItems('payments_received', {
			filter: { payment_intent: { _eq: intent.id } },
			limit: 1,
		});

		if (existingPayments.length > 0) {
			if (!invoiceID.value && !payment.value.invoice_id) {
				invoiceID.value = existingPayments[0].invoice_id;
			}
			console.log('Payment already recorded:', existingPayments[0]);
			return; // Payment already exists, no need to create a new record
		}

		// console.log('Recording payment with data:', {
		// 	paymentIntent: intent.id,
		// 	chargeId: intent.latest_charge,
		// 	receiptUrl: intent.latest_charge.receipt_url,
		// });

		console.log(new Date().toISOString());

		await createItem('payments_received', {
			status: 'published',
			user_id: payment.value.user?.id,
			email: payment.value.email,
			date_received: new Date().toISOString(),
			invoice_id: payment.value.invoice_id,
			payment_intent: intent.id,
			amount: (payment.value.amount / 100).toFixed(2),
			stripe_status: intent.status,
			charge_id: intent.latest_charge.id,
			receipt_url: intent.latest_charge.receipt_url,
			payment_method: intent.latest_charge.payment_method_details.type,
			organization: payment.value.bill_to,
		});

		await sendPaymentNotification(payment.value);
	} catch (err) {
		console.error('Failed to record payment:', err);
	}
};

const sendPaymentNotification = async (paymentData) => {
	console.log('Sending payment notification email...');
	console.log(paymentData.email);
	console.log(paymentData);

	try {
		// Validate required payment data
		if (!paymentData?.email || !user?.value.email) {
			throw new Error('Missing required email information');
		}

		// Deduplicate emails and remove any empty values
		const emails = [...new Set([paymentData.email, user.value.email])].filter((email) => email && email.trim());

		console.log(emails);

		if (emails.length === 0) {
			throw new Error('No valid email addresses provided');
		}

		const notificationData = {
			emails,
			amount: formatAmount(paymentData.stripeAmount),
			invoice: paymentData.invoice_code,
			company: paymentData.bill_to,
			id: paymentData.invoice_id,
			first_name: paymentData.user.first_name,
		};

		console.log('Sending payment notification:', notificationData);

		const response = await $fetch('/api/email/paymentnotification', {
			method: 'POST',
			body: notificationData,
		});

		if (response.error) {
			throw new Error(response.error);
		}

		toast.add({
			title: 'Notification Sent',
			description: `Payment confirmation sent to ${emails.length} recipient${emails.length > 1 ? 's' : ''}.`,
			type: 'success',
			timeout: 5000,
		});

		return { success: true, emails };
	} catch (error) {
		console.error('Payment notification error:', error);

		toast.add({
			title: 'Notification Warning',
			description: 'Payment successful, but there was an issue sending the confirmation email.',
			type: 'warning',
			timeout: 8000,
		});

		return {
			success: false,
			error: error.message,
			emails: emails || [],
		};
	}
};

const formatAmount = (amount) => {
	if (typeof amount === 'number') {
		// If amount is in cents, convert to dollars
		const dollars = amount >= 100 ? amount / 100 : amount;
		return dollars.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
		});
	}
	return amount;
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

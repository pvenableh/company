<template>
	<div class="relative flex items-center justify-center flex-col px-6 pt-12 pb-24 min-h-screen">
		<h1 class="mb-6 uppercase text-center tracking-wider">Thank you.</h1>
		<div class="w-full uppercase text-center tracking-wider text-sm">
			<p v-for="(message, index) in messages" :key="index" class="mb-4">{{ message }}</p>
		</div>
	</div>
</template>

<script setup>
const route = useRoute();
const config = useRuntimeConfig();
import { loadStripe } from '@stripe/stripe-js';

const toast = useToast();
const messages = ref([]);
const clientSecret = ref(route.query.payment_intent_client_secret);
const payment = useState('payment', () => ({}));

// Initialize stripe outside of ref since it's not reactive
let stripe;

const handlePaymentStatus = (status) => {
	const statusMessages = {
		succeeded: 'Payment succeeded!',
		processing: 'Your payment is processing.',
		requires_payment_method: 'Your payment was not successful, please try again.',
		default: 'Something went wrong.',
	};

	toast.add({ title: statusMessages[status] || statusMessages.default });
};

const sendPaymentNotification = async (paymentData) => {
	try {
		const response = await useFetch('/api/paymentnotification', {
			method: 'POST',
			body: {
				user: paymentData.user,
				email: paymentData.email,
				bill_to: paymentData.bill_to,
				invoice: paymentData.invoice,
				amount: paymentData.amount,
				stripeAmount: paymentData.stripeAmount,
				id: paymentData.id,
			},
		});

		if (response.error.value) {
			console.error('Notification Error:', response.error.value);
			toast.add({
				title: 'Error sending notification',
				description: 'Your payment was successful, but there was an error sending the confirmation email.',
				type: 'error',
			});
			return false;
		}

		return true;
	} catch (error) {
		console.error('Notification Error:', error);
		toast.add({
			title: 'Error sending notification',
			description: 'Your payment was successful, but there was an error sending the confirmation email.',
			type: 'error',
		});
		return false;
	}
};

const getNewYorkDate = () => {
	const date = new Date();
	const newYorkTimezoneOffset = -240;
	return new Date(date.getTime() + newYorkTimezoneOffset * 60 * 1000);
};

// Use onMounted for client-side initialization
onMounted(async () => {
	try {
		// Get payment data from localStorage
		const storedPayment = window?.localStorage?.getItem('payment');
		if (storedPayment) {
			payment.value = JSON.parse(storedPayment);
		}

		if (!payment.value || Object.keys(payment.value).length === 0) {
			toast.add({
				title: 'Payment information not found',
				type: 'error',
			});
			return;
		}

		// Initialize Stripe
		stripe = await loadStripe(config.public.stripePublic);

		// Retrieve payment intent
		const { error: stripeError, paymentIntent } = await stripe.retrievePaymentIntent(clientSecret.value, {
			expand: ['payment_method', 'latest_charge'],
		});

		if (stripeError) {
			messages.value.push(stripeError.message);
			return;
		}

		// Handle payment status
		handlePaymentStatus(paymentIntent.status);

		// Add messages
		messages.value = [
			`Payment of $${parseFloat(paymentIntent.amount * 0.01).toFixed(2)} ${paymentIntent.status}.`,
			`An email receipt was sent to ${paymentIntent.receipt_email}.`,
		];

		// Send notification email
		const notificationSent = await sendPaymentNotification(payment.value);

		if (notificationSent) {
			// Optional: Record payment in Directus
			/* 
		await $directus.items('payments_received').createOne({
		  status: 'published',
		  name: payment.value.name,
		  email: payment.value.email,
		  address: payment.value.address,
		  service: payment.value.id,
		  date_received: getNewYorkDate().toISOString(),
		  payment_intent: paymentIntent.id,
		  payment_total: payment.value.amount,
		});
		*/
			// Clear payment data
			// payment.value = {};
			// window.localStorage.removeItem('payment');
		}
	} catch (error) {
		console.error('Payment Confirmation Error:', error);
		toast.add({
			title: 'Error processing payment confirmation',
			description: error.message,
			type: 'error',
		});
	}
});
</script>

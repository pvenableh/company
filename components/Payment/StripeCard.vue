<template>
	<form id="payment-form" @submit.prevent="handleSubmit">
		<div v-if="error" class="mb-4">
			<UAlert type="error" :title="error.title" :description="error.message">
				<template #icon>
					<Icon name="heroicons:exclamation-circle" />
				</template>
			</UAlert>
		</div>

		<div v-if="isElementLoading" class="w-full flex justify-center items-center py-12">
			<UButton loading>Loading payment form...</UButton>
		</div>

		<div v-show="!isElementLoading">
			<div id="payment-element" />

			<div class="mt-6 space-y-4">
				<UButton type="submit" block :loading="isSubmitting" :disabled="!isElementReady || isSubmitting">
					<template #leading>
						<Icon name="heroicons:lock-closed" />
					</template>
					{{ submitButtonText }}
				</UButton>

				<p v-if="isElementReady" class="text-xs text-gray-500 text-center">
					<Icon name="heroicons:shield-check" class="inline-block w-4 h-4 mr-1" />
					Secure payment processed by Stripe
				</p>
			</div>
		</div>
	</form>
</template>

<script setup>
import { loadStripe } from '@stripe/stripe-js';
import { loader, openScreen, closeScreen } from '~/composables/useScreen';

const props = defineProps({
	paymentType: {
		type: String,
		default: null,
		validator: (value) => ['card', 'us_bank_account'].includes(value),
	},
	email: {
		type: String,
		required: true,
		validator: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
	},
	amount: {
		type: [Number, String],
		required: true,
		validator: (value) => Number(value) > 0,
	},
	invoice: {
		type: Object,
		default: () => null,
	},
});

const config = useRuntimeConfig();

console.log('Stripe Config:', {
	publicKey: config.public.stripePublic,
	exists: !!config.public.stripePublic,
});

// State
const isElementLoading = ref(true);
const isElementReady = ref(false);
const isSubmitting = ref(false);
const error = ref(null);
let stripe = null;
let elements = null;

// Computed
const submitButtonText = computed(() => {
	if (isSubmitting.value) return `Processing Payment...`;
	return `Pay ${formatAmount(props.amount)}`;
});

// Methods
const formatAmount = (amount) => {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(amount / 100);
};

const handleError = (message, err = null) => {
	console.error('Payment Error:', err || message);
	error.value = {
		title: 'Payment Error',
		message: message,
	};
	isSubmitting.value = false;
	loader.value = false;
	closeScreen();
};

const createPaymentIntent = async () => {
	try {
		const data = await $fetch('/api/stripe/paymentintent', {
			method: 'POST',
			body: {
				amount: props.amount,
				email: props.email,
				paymentType: props.paymentType,
				invoiceId: props.invoice?.id,
			},
		});

		console.log('Payment Intent Response:', data);
		return data;
	} catch (err) {
		console.error('Payment Intent Error:', err);
		handleError('Failed to create payment intent', err);
		throw err;
	}
};

const setupStripeElement = async (clientSecret) => {
	if (!clientSecret) {
		throw new Error('Missing client secret for Stripe Elements');
	}

	try {
		const options = {
			clientSecret,
			appearance: {
				variables: {
					colorPrimary: '#502989',
					colorBackground: '#ffffff',
					colorText: '#502989',
					colorDanger: '#df1b41',
					fontFamily: 'Proxima Nova W01 Regular, -apple-system, Roboto, Helvetica Neue, Helvetica, sans-serif',
					borderRadius: '2px',
				},
				rules: {
					'.Label': {
						textTransform: 'uppercase',
						letterSpacing: '0.2em',
						fontSize: '10px',
					},
					'.Error': {
						textTransform: 'uppercase',
						letterSpacing: '0.05em',
						fontSize: '8px',
					},
					'.Input': {
						letterSpacing: '0.1em',
						// textTransform: 'uppercase',
					},
				},
			},
			fields: {
				billingDetails: {
					email: props.email,
				},
			},
		};

		elements = stripe.elements(options);
		const paymentElement = elements.create('payment');

		paymentElement.on('ready', () => {
			isElementReady.value = true;
			isElementLoading.value = false;
		});

		paymentElement.on('change', (event) => {
			if (event.error) {
				handleError(event.error.message);
			} else {
				error.value = null;
			}
		});

		paymentElement.mount('#payment-element');
	} catch (err) {
		handleError('Failed to setup payment form', err);
		throw err;
	}
};

const handleSubmit = async () => {
	try {
		if (!stripe || !elements) {
			throw new Error('Stripe not initialized');
		}

		if (isSubmitting.value) {
			return;
		}

		error.value = null;
		isSubmitting.value = true;
		loader.value = true;
		openScreen();

		const { error: stripeError } = await stripe.confirmPayment({
			elements,
			confirmParams: {
				return_url: `${window.location.origin}/confirmation`,
				payment_method_data: {
					billing_details: {
						email: props.email,
					},
				},
			},
		});

		if (stripeError) {
			throw stripeError;
		}
	} catch (err) {
		handleError(err.message || 'Payment failed', err);
	}
};

// Initialize
onMounted(async () => {
	try {
		// Initialize Stripe
		console.log('Initializing Stripe with key:', config.public.stripePublic);
		stripe = await loadStripe(config.public.stripePublic);
		if (!stripe) {
			throw new Error('Failed to load Stripe');
		}

		// Create payment intent and get client secret
		const paymentIntent = await createPaymentIntent();

		// Setup Stripe Elements with client secret
		await setupStripeElement(paymentIntent.clientSecret);
	} catch (err) {
		isElementLoading.value = false;
		handleError('Payment setup failed', err);
	}
});

// Cleanup
onBeforeUnmount(() => {
	if (elements) {
		elements.getElement('payment')?.destroy();
	}
});

const formatNumber = (value) => {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
};
</script>

<style>
#payment-form {
	width: 100%;
	@apply max-w-xl mx-auto;
}

#payment-element {
	min-height: 100px;
}

/* Dark mode support */
:root[class~='dark'] #payment-element {
	--StripeElement-backgroundColor: rgba(255, 255, 255, 0.05);
	--StripeElement-color: #fff;
}
</style>

<template>
	<form id="payment-form" @submit.prevent="handleSubmit">
		<div class="uppercase tracking-wide text-xs mb-6 flex flex-row items-center justify-between"></div>
		<div id="payment-element" />
		<FormVButton id="submit" class="w-full my-6" type="submit" :disabled="isLoading">Submit Payment</FormVButton>
		<div id="error-message">
			<p v-for="(message, index) in messages">{{ message }}</p>
		</div>
	</form>
</template>

<script setup>
const config = useRuntimeConfig();
import { loadStripe } from '@stripe/stripe-js';
import { openScreen, loader, closeScreen } from '~/composables/useScreen';
const props = defineProps({
	paymentType: {
		type: String,
		default: null,
	},
	email: {
		type: String,
		default: null,
	},
	amount: {
		type: [Number, String],
		default: 0,
	},
});
const response = reactive({});
const clientSecret = ref('');
const isLoading = ref(false);
const messages = ref([]);
let stripe;
let elements;

onMounted(async () => {
	stripe = await loadStripe(config.public.stripePublic);
	const { data, pending, error, refresh } = await useFetch(
		'/api/stripe/paymentintent?amount=' +
			props.amount +
			'&customer=&email=' +
			props.email +
			'&paymentType=' +
			props.paymentType,
		{
			onResponse({ request, response, options }) {
				return response._data;
			},
		},
	);

	response.value = data;

	clientSecret.value = response.value.client_secret;

	const options = {
		clientSecret: clientSecret.value,
		fields: {
			billingDetails: {
				email: props.email,
			},
		},
		style: {
			base: {
				letterSpacing: '0.1em',
				textTransform: 'uppercase',
			},
		},
		appearance: {
			// theme: 'none',

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
			},
		},
	};
	elements = stripe.elements(options);
	const paymentElement = elements.create('payment');
	paymentElement.mount('#payment-element');
	isLoading.value = false;
	paymentElement.on('change', function (event) {
		console.log(event);
	});
});

const handleSubmit = async () => {
	loader.value = true;
	openScreen();
	if (isLoading.value) {
		return;
	}
	isLoading.value = true;
	const { error } = await stripe.confirmPayment({
		elements: elements,
		confirmParams: {
			return_url: 'http://huestudios.company/confirmation',
		},
	});
	if (error) {
		messages.value.push(error.message);
		closeScreen();
	}
	isLoading.value = false;
	closeScreen();
};
</script>
<style>
#payment-form {
	width: 100%;
	@media (min-width: theme('screens.sm')) {
		/* max-width: 550px; */
	}
	#payment-element {
		/* min-height: 335px; */
	}
}
</style>

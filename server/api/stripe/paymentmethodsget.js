import Stripe from 'stripe';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const stripeSecretKey = process.env.NODE_ENV === 'production'
		? config.stripeSecretKeyLive
		: config.stripeSecretKeyTest;

	const query = getQuery(event);
	const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-10-28.acacia' });

	const paymentMethods = await stripe.customers.listPaymentMethods(query.customer, {
		type: 'card',
	});
	return paymentMethods;
});

import Stripe from 'stripe';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const stripeSecretKey = process.env.NODE_ENV === 'production'
		? config.stripeSecretKeyLive
		: config.stripeSecretKeyTest;

	const body = await readBody(event);

	const stripe = new Stripe(stripeSecretKey, {
		apiVersion: '2024-10-28.acacia',
	});
	const customer = await stripe.customers.search({
		query: `email: "${body.email}"`,
	});

	return customer;
});

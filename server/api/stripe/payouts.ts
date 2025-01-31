import Stripe from 'stripe';
import { defineEventHandler } from 'h3';

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();
		const stripeSecretKey =
			process.env.NODE_ENV === 'production' ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

		if (!stripeSecretKey) {
			throw new Error('Stripe secret key is not configured');
		}

		const stripe = new Stripe(stripeSecretKey as string, {
			apiVersion: '2023-10-16',
			maxNetworkRetries: 2,
		});

		// Fetch payouts list
		const payouts = await stripe.payouts.list({ limit: 10 });

		return payouts.data;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
		return { error: errorMessage };
	}
});

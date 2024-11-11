// server/api/stripe/charge.get.js

import Stripe from 'stripe';

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();
		const query = getQuery(event);

		// Log the incoming request
		console.log('payment Request:', {
			paymentId: query.payment_id,
			timestamp: new Date().toISOString(),
		});

		if (!query.payment_id) {
			throw createError({
				statusCode: 400,
				message: 'Payment ID is required',
			});
		}

		// Initialize Stripe
		const stripeSecretKey =
			process.env.NODE_ENV === 'production' ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

		if (!stripeSecretKey) {
			throw new Error('Stripe secret key is not configured');
		}

		const stripe = new Stripe(stripeSecretKey, {
			apiVersion: '2024-10-28.acacia',
			maxNetworkRetries: 2,
		});

		// Retrieve the charge
		const charges = await stripe.charges.list({
			payment_intent: query.payment_id,
		});

		if (!charges.data.length) {
			throw createError({
				statusCode: 404,
				message: 'No charges found for this Payment Intent',
			});
		}

		const charge = charges.data[0];

		console.log('Charges Retrieved:', {
			id: charge.id,
			hasReceipt: !!charge.receipt_url,
			timestamp: new Date().toISOString(),
		});

		// Return only the necessary charge details
		return {
			id: charge.id,
			amount: charge.amount,
			status: charge.status,
			receipt_url: charge.receipt_url,
			payment_method_details: charge.payment_method_details,
			invoice_id: charge.metadata.invoice_id,
		};
	} catch (error) {
		console.error('Charge Retrieval Error:', {
			error: error.message,
			code: error.code,
			type: error.type,
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
			timestamp: new Date().toISOString(),
		});

		// Handle Stripe specific errors
		if (error instanceof Stripe.errors.StripeError) {
			throw createError({
				statusCode: error.statusCode || 400,
				message: error.message,
				data: {
					code: error.code,
					type: error.type,
					param: error.param,
				},
			});
		}

		// Handle other errors
		throw createError({
			statusCode: error.statusCode || 500,
			message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to retrieve charge',
			data: process.env.NODE_ENV === 'development' ? error.stack : undefined,
		});
	}
});

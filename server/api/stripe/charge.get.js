// server/api/stripe/charge.get.js

import Stripe from 'stripe';

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();
		const query = getQuery(event);

		// Log the incoming request
		console.log('Charge Request:', {
			chargeId: query.charge_id,
			timestamp: new Date().toISOString(),
		});

		if (!query.charge_id) {
			throw createError({
				statusCode: 400,
				message: 'Charge ID is required',
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
		const charge = await stripe.charges.retrieve(query.charge_id);

		console.log('Charge Retrieved:', {
			id: charge.id,
			hasReceipt: !!charge.receipt_url,
			timestamp: new Date().toISOString(),
		});

		// Return only the necessary charge details
		return {
			id: charge.id,
			amount: charge.amount / 100, // Convert from cents to dollars
			payment_method: charge.payment_method_details?.type,
			status: charge.status,
			receipt_url: charge.receipt_url,
			created: charge.created,
			card: charge.payment_method_details?.card
				? {
						last4: charge.payment_method_details.card.last4,
						brand: charge.payment_method_details.card.brand,
						exp_month: charge.payment_method_details.card.exp_month,
						exp_year: charge.payment_method_details.card.exp_year,
					}
				: null,
			bank_account: charge.payment_method_details?.ach_debit
				? {
						bank_name: charge.payment_method_details.ach_debit.bank_name,
						last4: charge.payment_method_details.ach_debit.last4,
					}
				: null,
			payment_method_details: charge.payment_method_details,
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

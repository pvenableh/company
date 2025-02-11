// server/api/stripe/events/[id].js
import Stripe from 'stripe';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const stripeSecretKey =
		process.env.NODE_ENV === 'production' ? config.stripeSecretKeyLive : config.stripeSecretKeyTest;

	if (!stripeSecretKey) {
		throw new Error('Stripe secret key is not configured');
	}

	const stripe = new Stripe(stripeSecretKey, {
		apiVersion: '2023-10-16',
	});

	const paymentId = getRouterParam(event, 'id');

	await logger.logEvent('Stripe Events Request', { paymentId });

	if (!paymentId) {
		throw createError({
			statusCode: 400,
			message: 'Payment Intent ID is required',
		});
	}

	try {
		// 1. Retrieve the Payment Intent to ensure it exists
		const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);

		// 2. List events for the last 30 days (Stripe default)
		const events = await stripe.events.list({
			limit: 100,
			created: {
				// Get events from the last 30 days
				gte: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60,
			},
		});

		// Filter events related to this payment intent
		const relevantEvents = events.data.filter((event) => {
			// For payment_intent events
			if (event.type.startsWith('payment_intent.')) {
				return event.data.object.id === paymentId;
			}
			// For charge events
			if (event.type.startsWith('charge.')) {
				return event.data.object.payment_intent === paymentId;
			}
			return false;
		});

		const sortedEvents = relevantEvents.sort((a, b) => b.created - a.created);

		await logger.logEvent('Stripe Events Retrieved', {
			paymentIntentId: paymentId,
			eventCount: sortedEvents.length,
		});

		// Return a consistent response structure
		return {
			success: true,
			data: {
				paymentIntent: {
					id: paymentIntent.id,
					amount: paymentIntent.amount,
					currency: paymentIntent.currency,
					status: paymentIntent.status,
					created: paymentIntent.created,
					// Add other relevant payment intent fields you need
				},
				events: sortedEvents.map((event) => ({
					id: event.id,
					type: event.type,
					created: event.created,
					data: event.data.object,
				})),
			},
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
		await logger.logError(error instanceof Error ? error : new Error(errorMessage), {
			paymentIntentId: paymentId,
		});

		// Return a consistent error response structure
		throw createError({
			statusCode: error.statusCode || 500,
			message: errorMessage,
			data: {
				paymentIntentId: paymentId,
				success: false,
			},
		});
	}
});

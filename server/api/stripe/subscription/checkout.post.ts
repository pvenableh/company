// POST /api/stripe/subscription/checkout
// Creates a Stripe Checkout Session for subscription signup
import Stripe from 'stripe';

export default defineEventHandler(async (event) => {
	const stripe = useStripe();
	const body = await readBody(event);
	const { email, customerId, priceId, successUrl, cancelUrl } = body;

	if (!email) {
		throw createError({ statusCode: 400, message: 'Email is required' });
	}

	if (!priceId) {
		throw createError({ statusCode: 400, message: 'Price ID is required' });
	}

	try {
		// Find or create customer
		let customer = customerId;
		if (!customer) {
			const existing = await stripe.customers.search({
				query: `email:"${email}"`,
			});
			if (existing.data.length > 0) {
				customer = existing.data[0].id;
			} else {
				const newCustomer = await stripe.customers.create({
					email,
					metadata: { source: 'earnest_subscription' },
				});
				customer = newCustomer.id;
			}
		}

		const session = await stripe.checkout.sessions.create({
			customer,
			mode: 'subscription',
			payment_method_types: ['card'],
			line_items: [{ price: priceId, quantity: 1 }],
			success_url: successUrl || `${process.env.APP_URL || 'http://localhost:3000'}/account/subscription?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: cancelUrl || `${process.env.APP_URL || 'http://localhost:3000'}/account/subscription`,
			subscription_data: {
				metadata: {
					earnest_email: email,
				},
			},
		});

		return { sessionId: session.id, url: session.url };
	} catch (error: any) {
		console.error('Subscription checkout error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to create checkout session',
		});
	}
});

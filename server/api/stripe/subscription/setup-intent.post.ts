// POST /api/stripe/subscription/setup-intent
// Creates a SetupIntent for adding a payment method without charging
export default defineEventHandler(async (event) => {
	const stripe = useStripe();
	const body = await readBody(event);
	const { customerId } = body;

	if (!customerId) {
		throw createError({ statusCode: 400, message: 'Customer ID is required' });
	}

	try {
		const setupIntent = await stripe.setupIntents.create({
			customer: customerId,
			payment_method_types: ['card'],
		});

		return {
			clientSecret: setupIntent.client_secret,
			id: setupIntent.id,
		};
	} catch (error: any) {
		console.error('Setup intent error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to create setup intent',
		});
	}
});

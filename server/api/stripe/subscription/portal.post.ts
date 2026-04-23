// POST /api/stripe/subscription/portal
// Creates a Stripe Customer Portal session for self-service management
export default defineEventHandler(async (event) => {
	await requireOrgRole(event, ['owner', 'admin']);

	const stripe = useStripe();
	const body = await readBody(event);
	const { customerId, returnUrl } = body;

	if (!customerId) {
		throw createError({ statusCode: 400, message: 'Customer ID is required' });
	}

	try {
		const session = await stripe.billingPortal.sessions.create({
			customer: customerId,
			return_url: returnUrl || `${process.env.APP_URL || 'http://localhost:3000'}/account/subscription`,
		});

		return { url: session.url };
	} catch (error: any) {
		console.error('Portal session error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to create portal session',
		});
	}
});

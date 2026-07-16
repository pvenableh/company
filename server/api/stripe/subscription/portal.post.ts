// POST /api/stripe/subscription/portal
// Creates a Stripe Customer Portal session for self-service management
export default defineEventHandler(async (event) => {
	await requireOrgRole(event, ['owner', 'admin']);

	const stripe = useStripe();
	const body = await readBody(event);
	const { customerId, email, returnUrl } = body as { customerId?: string; email?: string; returnUrl?: string };

	if (!customerId && !email) {
		throw createError({ statusCode: 400, message: 'customerId or email is required' });
	}

	try {
		// Resolve (or lazily create) the Stripe customer. A brand-new org that has
		// never subscribed has no customer yet, but "Add payment method" must still
		// open the portal — so find-or-create by email rather than 400ing (which is
		// what made the button silently no-op). find-first avoids duplicate rows;
		// the status endpoint resolves the same customer via customers.list({ email }).
		let resolvedCustomerId = customerId;
		if (!resolvedCustomerId && email) {
			const existing = await stripe.customers.list({ email, limit: 1 });
			resolvedCustomerId =
				existing.data.find((c) => !(c as any).deleted)?.id ||
				(await stripe.customers.create({ email })).id;
		}

		const session = await stripe.billingPortal.sessions.create({
			customer: resolvedCustomerId as string,
			return_url: returnUrl || `${getAppBaseUrl(event)}/account/subscription`,
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

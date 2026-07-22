// POST /api/stripe/subscription/portal
// Creates a Stripe Customer Portal session for self-service management.
// Org-owned: the portal opens the ORGANIZATION's customer (find-or-created from
// the org id), so "Add payment method" works even before the org subscribes and
// every admin manages the same customer.
export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const { organizationId, customerId, email, returnUrl } = body as {
		organizationId?: string;
		customerId?: string;
		email?: string;
		returnUrl?: string;
	};

	if (!organizationId && !customerId && !email) {
		throw createError({ statusCode: 400, message: 'organizationId, customerId, or email is required' });
	}

	// Org-scoped authorization when we have an org; otherwise fall back to the
	// any-org owner/admin check for legacy callers.
	if (organizationId) {
		await requireOrgPermission(event, organizationId, 'org_settings', 'update');
	} else {
		await requireOrgRole(event, ['owner', 'admin']);
	}

	const stripe = useStripe();

	try {
		// Prefer the org's own customer (created on demand). Legacy callers may
		// still pass customerId/email directly.
		let resolvedCustomerId = customerId || null;
		if (!resolvedCustomerId && organizationId) {
			// revalidate: the id is passed straight to billingPortal.sessions.create,
			// so a stale/deleted stored customer must self-heal (else Stripe 400s).
			resolvedCustomerId = await getOrCreateOrgStripeCustomer(organizationId, {
				emailFallback: email,
				revalidate: true,
			});
		}
		if (!resolvedCustomerId && email) {
			const existing = await stripe.customers.list({ email, limit: 1 });
			resolvedCustomerId =
				existing.data.find((c) => !(c as any).deleted)?.id ||
				(await stripe.customers.create({ email })).id;
		}

		const session = await stripe.billingPortal.sessions.create({
			customer: resolvedCustomerId as string,
			return_url: returnUrl || `${getAppBaseUrl(event)}/apps/organization?floor=billing`,
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

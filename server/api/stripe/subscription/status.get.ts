// GET /api/stripe/subscription/status?email=...&customerId=...
// Returns current subscription status for a user
export default defineEventHandler(async (event) => {
	const stripe = useStripe();
	const query = getQuery(event);
	const { email, customerId } = query as { email?: string; customerId?: string };

	if (!email && !customerId) {
		throw createError({ statusCode: 400, message: 'Email or customerId is required' });
	}

	try {
		// Find customer.
		// NOTE: use customers.list({ email }) rather than customers.search. The
		// Search API relies on an eventually-consistent index that isn't populated
		// on a freshly-provisioned account, so it returns a 400
		// (StripeInvalidRequestError) — which is what surfaced after the
		// Earnest-platform Stripe migration and cascaded into empty billing history,
		// missing payment methods, and a dead "Add payment method" button (customerId
		// never resolved). list with an exact email filter is deterministic, available
		// on every account, and avoids interpolating the email into a query string.
		let customer;
		if (customerId) {
			customer = await stripe.customers.retrieve(customerId as string);
		} else {
			const list = await stripe.customers.list({ email: email as string, limit: 100 });
			// Newest non-deleted match (list returns most-recent first), tolerant of
			// duplicate customer rows for the same email.
			customer = list.data.find((c) => !(c as any).deleted) || null;
		}

		if (!customer || (customer as any).deleted) {
			return {
				status: 'no_customer',
				subscription: null,
				customer: null,
			};
		}

		// Get active subscriptions.
		// NOTE: do NOT expand `data.items.data.price.product` — from a list that's a
		// 5-level path and Stripe caps expansion at 4 levels, so it 400s the whole
		// request ("cannot expand more than 4 levels"). We resolve the product name
		// for just the selected subscription below instead.
		const subscriptions = await stripe.subscriptions.list({
			customer: customer.id,
			status: 'all',
			limit: 5,
			expand: ['data.default_payment_method'],
		});

		// Find the most relevant subscription (active > past_due > canceled)
		const priorityOrder = ['active', 'trialing', 'past_due', 'canceled', 'incomplete'];
		const sorted = subscriptions.data.sort((a, b) => {
			return priorityOrder.indexOf(a.status) - priorityOrder.indexOf(b.status);
		});

		const subscription = sorted[0] || null;

		// Resolve a display product for the chosen subscription without the illegal
		// deep expand: retrieve the product by id (one call), falling back to the
		// Earnest plan name mapped from the price id. Shape stays `{ id, name }` so
		// the client's planName (which checks `product?.name`) is unchanged.
		let resolvedProduct: { id: string | null; name: string } | string | null =
			subscription?.items?.data?.[0]?.price?.product ?? null;
		if (subscription) {
			const price = subscription.items.data[0]?.price;
			const productId = typeof price?.product === 'string' ? price.product : (price?.product as any)?.id ?? null;
			let name: string | null = null;
			if (productId) {
				try {
					const product = await stripe.products.retrieve(productId);
					name = (product as any)?.name ?? null;
				} catch {
					/* fall through to plan-map */
				}
			}
			if (!name && price?.id) {
				const planId = planFromPriceId(price.id);
				name = planId ? EARNEST_PLANS[planId]?.name ?? null : null;
			}
			resolvedProduct = { id: productId, name: name || 'Earnest plan' };
		}

		// Get payment methods
		const paymentMethods = await stripe.customers.listPaymentMethods(customer.id, {
			type: 'card',
		});

		// Get recent invoices
		const invoices = await stripe.invoices.list({
			customer: customer.id,
			limit: 10,
		});

		return {
			status: subscription?.status || 'none',
			subscription: subscription
				? {
						id: subscription.id,
						status: subscription.status,
						current_period_start: subscription.current_period_start,
						current_period_end: subscription.current_period_end,
						cancel_at_period_end: subscription.cancel_at_period_end,
						canceled_at: subscription.canceled_at,
						plan: {
							id: subscription.items.data[0]?.price?.id,
							amount: subscription.items.data[0]?.price?.unit_amount,
							interval: subscription.items.data[0]?.price?.recurring?.interval,
							product: resolvedProduct,
						},
						default_payment_method: subscription.default_payment_method,
					}
				: null,
			customer: {
				id: customer.id,
				email: (customer as any).email,
			},
			paymentMethods: paymentMethods.data.map((pm) => ({
				id: pm.id,
				brand: pm.card?.brand,
				last4: pm.card?.last4,
				exp_month: pm.card?.exp_month,
				exp_year: pm.card?.exp_year,
			})),
			invoices: invoices.data.map((inv) => ({
				id: inv.id,
				number: inv.number,
				amount_due: inv.amount_due,
				amount_paid: inv.amount_paid,
				status: inv.status,
				created: inv.created,
				hosted_invoice_url: inv.hosted_invoice_url,
				invoice_pdf: inv.invoice_pdf,
			})),
		};
	} catch (error: any) {
		console.error('Subscription status error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to fetch subscription status',
		});
	}
});

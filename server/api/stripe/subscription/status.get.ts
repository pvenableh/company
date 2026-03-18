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
		// Find customer
		let customer;
		if (customerId) {
			customer = await stripe.customers.retrieve(customerId as string);
		} else {
			const search = await stripe.customers.search({
				query: `email:"${email}"`,
			});
			customer = search.data[0] || null;
		}

		if (!customer || (customer as any).deleted) {
			return {
				status: 'no_customer',
				subscription: null,
				customer: null,
			};
		}

		// Get active subscriptions
		const subscriptions = await stripe.subscriptions.list({
			customer: customer.id,
			status: 'all',
			limit: 5,
			expand: ['data.default_payment_method', 'data.items.data.price.product'],
		});

		// Find the most relevant subscription (active > past_due > canceled)
		const priorityOrder = ['active', 'trialing', 'past_due', 'canceled', 'incomplete'];
		const sorted = subscriptions.data.sort((a, b) => {
			return priorityOrder.indexOf(a.status) - priorityOrder.indexOf(b.status);
		});

		const subscription = sorted[0] || null;

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
							product: subscription.items.data[0]?.price?.product,
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

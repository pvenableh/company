// POST /api/stripe/subscription/cancel
// Cancels a subscription (at period end by default)
export default defineEventHandler(async (event) => {
	const stripe = useStripe();
	const body = await readBody(event);
	const { subscriptionId, immediate } = body;

	if (!subscriptionId) {
		throw createError({ statusCode: 400, message: 'Subscription ID is required' });
	}

	try {
		let subscription;
		if (immediate) {
			subscription = await stripe.subscriptions.cancel(subscriptionId);
		} else {
			// Cancel at end of current billing period
			subscription = await stripe.subscriptions.update(subscriptionId, {
				cancel_at_period_end: true,
			});
		}

		return {
			id: subscription.id,
			status: subscription.status,
			cancel_at_period_end: subscription.cancel_at_period_end,
			current_period_end: subscription.current_period_end,
		};
	} catch (error: any) {
		console.error('Subscription cancel error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to cancel subscription',
		});
	}
});

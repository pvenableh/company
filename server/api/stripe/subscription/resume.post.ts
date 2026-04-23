// POST /api/stripe/subscription/resume
// Resumes a subscription that was set to cancel at period end
export default defineEventHandler(async (event) => {
	await requireOrgRole(event, ['owner', 'admin']);

	const stripe = useStripe();
	const body = await readBody(event);
	const { subscriptionId } = body;

	if (!subscriptionId) {
		throw createError({ statusCode: 400, message: 'Subscription ID is required' });
	}

	try {
		const subscription = await stripe.subscriptions.update(subscriptionId, {
			cancel_at_period_end: false,
		});

		return {
			id: subscription.id,
			status: subscription.status,
			cancel_at_period_end: subscription.cancel_at_period_end,
		};
	} catch (error: any) {
		console.error('Subscription resume error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to resume subscription',
		});
	}
});

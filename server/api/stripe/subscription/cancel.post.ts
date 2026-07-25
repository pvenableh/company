// POST /api/stripe/subscription/cancel
// Cancels a subscription (at period end by default)
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	await requireNotDemoSession(event);

	const stripe = useStripe();
	const body = await readBody(event);
	const { subscriptionId, immediate } = body;

	if (!subscriptionId) {
		throw createError({ statusCode: 400, message: 'Subscription ID is required' });
	}

	// Bind the subscription id to its owning org and require the caller to be an
	// owner/admin of THAT org. Previously the guard only checked the caller was
	// owner/admin of *some* org, so an attacker-supplied subscriptionId could
	// cancel (and force-downgrade) another org's subscription.
	const owningOrgs = await getTypedDirectus().request(
		readItems('organizations', {
			filter: { stripe_subscription_id: { _eq: subscriptionId } },
			fields: ['id'],
			limit: 1,
		}),
	) as Array<{ id: string }>;
	const owningOrgId = owningOrgs?.[0]?.id;
	if (!owningOrgId) {
		throw createError({ statusCode: 404, message: 'Subscription not found for any organization' });
	}
	await requireOrgPermission(event, owningOrgId, 'org_settings', 'update');

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

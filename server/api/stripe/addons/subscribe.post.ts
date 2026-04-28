// server/api/stripe/addons/subscribe.post.ts
// Add a recurring add-on to the org's existing Stripe subscription.

import { readItems } from '@directus/sdk';
import { EARNEST_ADDONS } from '~~/server/utils/stripe';
import type { EarnestAddonId } from '~~/server/utils/stripe';

interface SubscribeBody {
	addonId: EarnestAddonId;
	orgId: string;
	// Optional Stripe Checkout Session id. When the wizard returns from a fresh
	// paid signup, the `customer.subscription.created` webhook may not have
	// linked `directus_users.stripe_subscription_id` yet. Passing the session
	// id lets us resolve the subscription directly from Stripe.
	sessionId?: string;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<SubscribeBody>(event);

	if (!body.addonId || !EARNEST_ADDONS[body.addonId]) {
		throw createError({ statusCode: 400, message: 'Invalid addonId' });
	}
	if (!body.orgId) {
		throw createError({ statusCode: 400, message: 'orgId is required' });
	}

	const addon = EARNEST_ADDONS[body.addonId];
	if (!addon.stripePriceId) {
		throw createError({ statusCode: 500, message: `Stripe price not configured for add-on: ${body.addonId}` });
	}

	try {
		const stripe = useStripe();
		const directus = getTypedDirectus();

		// Find the user's existing Stripe subscription
		const users = await directus.request(
			readItems('directus_users', {
				filter: { id: { _eq: userId } },
				fields: ['stripe_subscription_id'],
				limit: 1,
			})
		) as any[];

		let subscriptionId: string | null = users[0]?.stripe_subscription_id || null;

		// Wizard fallback: if the webhook hasn't linked the sub yet, resolve it
		// from the just-completed Checkout Session.
		if (!subscriptionId && body.sessionId) {
			try {
				const checkoutSession = await stripe.checkout.sessions.retrieve(body.sessionId);
				if (typeof checkoutSession.subscription === 'string') {
					subscriptionId = checkoutSession.subscription;
				} else if (checkoutSession.subscription && typeof checkoutSession.subscription === 'object') {
					subscriptionId = (checkoutSession.subscription as any).id || null;
				}
			} catch (lookupErr: any) {
				console.warn('[stripe/addons/subscribe] sessionId lookup failed:', lookupErr?.message);
			}
		}

		if (!subscriptionId) {
			throw createError({
				statusCode: 400,
				message: 'No active subscription found. Subscribe to a plan first.',
			});
		}

		// Add the add-on as a new line item on the existing subscription
		const subscriptionItem = await stripe.subscriptionItems.create({
			subscription: subscriptionId,
			price: addon.stripePriceId,
			quantity: 1,
		});

		// The webhook (customer.subscription.updated) will sync active_addons to the org

		return {
			success: true,
			data: {
				addonId: body.addonId,
				subscriptionItemId: subscriptionItem.id,
			},
		};
	} catch (error: any) {
		console.error('[stripe/addons/subscribe] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to subscribe to add-on',
		});
	}
});

// server/api/stripe/addons/subscribe.post.ts
// Add a recurring add-on to the org's existing Stripe subscription.

import { readItem } from '@directus/sdk';
import { EARNEST_ADDONS } from '~~/server/utils/stripe';
import type { EarnestAddonId } from '~~/server/utils/stripe';

interface SubscribeBody {
	addonId: EarnestAddonId;
	orgId: string;
	// Optional Stripe Checkout Session id (legacy redirect flow).
	sessionId?: string;
	// Optional Stripe Subscription id (in-page Elements flow). When set, skip
	// the webhook-linked lookup entirely — the wizard knows the sub from the
	// /subscription/create response.
	subscriptionId?: string;
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

		// In-page Elements flow: the wizard already knows the subscription id
		// from /subscription/create — skip the lookup entirely.
		let subscriptionId: string | null = body.subscriptionId || null;

		if (!subscriptionId) {
			// Org-owned billing: the subscription lives on the organization record.
			const org = await directus.request(
				readItem('organizations', body.orgId, {
					fields: ['stripe_subscription_id', 'plan'],
				})
			) as any;

			// Enterprise/wholesale orgs (e.g. hue) are entitled to every add-on with
			// no Stripe subscription — mirror the client-side `hasAddon` bypass so
			// the two sides agree. Nothing to charge; the add-on is already included.
			if (org?.plan === 'enterprise') {
				return {
					success: true,
					data: { addonId: body.addonId, subscriptionItemId: null, included: true },
				};
			}

			subscriptionId = org?.stripe_subscription_id || null;
		}

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

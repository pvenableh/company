// server/api/stripe/addons/cancel.post.ts
// Remove a recurring add-on from the org's Stripe subscription.

import { readItem } from '@directus/sdk';
import { EARNEST_ADDONS } from '~/server/utils/stripe';
import type { EarnestAddonId } from '~/server/utils/stripe';

interface CancelBody {
	addonId: EarnestAddonId;
	orgId: string;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<CancelBody>(event);

	if (!body.addonId || !EARNEST_ADDONS[body.addonId]) {
		throw createError({ statusCode: 400, message: 'Invalid addonId' });
	}
	if (!body.orgId) {
		throw createError({ statusCode: 400, message: 'orgId is required' });
	}

	try {
		const stripe = useStripe();
		const directus = getTypedDirectus();

		// Get the org's active_addons to find the subscription item ID
		const org = await directus.request(
			readItem('organizations', body.orgId, {
				fields: ['active_addons'],
			})
		) as any;

		const addonData = org.active_addons?.[body.addonId];
		if (!addonData?.stripe_subscription_item_id) {
			throw createError({
				statusCode: 400,
				message: `Add-on ${body.addonId} is not active on this organization.`,
			});
		}

		// Remove the subscription item from Stripe
		await stripe.subscriptionItems.del(addonData.stripe_subscription_item_id);

		// Handle post-cancellation cleanup for specific add-ons
		if (body.addonId === 'communications') {
			// Suspend the Twilio sub-account
			try {
				await suspendSubAccount(body.orgId);
			} catch (err) {
				console.warn('[stripe/addons/cancel] Failed to suspend Twilio sub-account:', err);
			}
		}

		// The webhook (customer.subscription.updated) will sync active_addons

		return {
			success: true,
			data: { addonId: body.addonId, cancelled: true },
		};
	} catch (error: any) {
		console.error('[stripe/addons/cancel] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to cancel add-on',
		});
	}
});

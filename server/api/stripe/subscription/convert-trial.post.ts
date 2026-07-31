// POST /api/stripe/subscription/convert-trial
//
// Converts a no-card free trial into a paying subscription once the owner adds
// a card on the upgrade screen (app/pages/organization/upgrade.vue). The client
// first confirms a SetupIntent (see setup-intent.post.ts) to get a reusable
// `paymentMethodId`, then calls this with it.
//
// Steps: attach the card to the org's Stripe customer, make it the default for
// both the customer (invoice settings) and the subscription, then RESUME the
// subscription if the trial already lapsed to `paused`. Stripe then emits
// `customer.subscription.updated` → the webhook (paymentchange.ts) flips the
// org's mirrored `subscription_status` back to `active`/`trialing`, which clears
// the trial-expiry gate.
import { readItem, updateItem } from '@directus/sdk';
import { EARNEST_PLANS } from '~~/server/utils/stripe';
import type { EarnestPlanId } from '~~/server/utils/stripe';

interface ConvertBody {
	organizationId: string;
	paymentMethodId: string;
}

export default defineEventHandler(async (event) => {
	const body = await readBody<ConvertBody>(event);
	const { organizationId, paymentMethodId } = body;

	if (!organizationId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}
	if (!paymentMethodId) {
		throw createError({ statusCode: 400, message: 'A payment method is required' });
	}

	// Org-owned billing — only an owner/admin of THIS org may add its card.
	await requireOrgPermission(event, organizationId, 'org_settings', 'update');
	await requireNotDemoSession(event);

	const stripe = useStripe();
	const directus = getServerDirectus();

	const org = (await directus
		.request(
			readItem('organizations', organizationId, {
				fields: ['stripe_customer_id', 'stripe_subscription_id', 'plan'],
			}),
		)
		.catch(() => null)) as any;

	const customerId = org?.stripe_customer_id;
	const subscriptionId = org?.stripe_subscription_id;
	if (!customerId || !subscriptionId) {
		throw createError({
			statusCode: 409,
			message: 'No trial subscription found for this organization. Start a plan first.',
		});
	}

	try {
		// 1. Attach the card and make it the default for future invoices.
		await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId }).catch((e: any) => {
			// Already attached to this customer is fine; anything else re-throws.
			if (e?.code !== 'payment_method_already_attached') throw e;
		});
		await stripe.customers.update(customerId, {
			invoice_settings: { default_payment_method: paymentMethodId },
		});
		await stripe.subscriptions.update(subscriptionId, {
			default_payment_method: paymentMethodId,
		});

		// 2. If the trial already lapsed to `paused` (missing_payment_method:'pause'),
		//    resume billing now so the org becomes active immediately. A still-
		//    `trialing` sub needs nothing more — it converts automatically at
		//    trial end now that a default card is on file.
		const sub = await stripe.subscriptions.retrieve(subscriptionId);
		let status = sub.status;
		if (status === 'paused') {
			const resumed = await stripe.subscriptions.resume(subscriptionId, {
				billing_cycle_anchor: 'now',
			});
			status = resumed.status;
		}

		// Adding a card unlocks the plan's FULL monthly AI allotment right away
		// (the no-card trial only had the bounded grant). The subscription.updated
		// webhook re-affirms this authoritatively; this optimistic write just
		// makes it instant.
		const planId = org?.plan as EarnestPlanId | undefined;
		const planDef = planId ? EARNEST_PLANS[planId] : null;
		if (planDef) {
			await directus.request(
				updateItem('organizations', organizationId, {
					ai_token_limit_monthly: planDef.aiTokens.monthlyAllotment,
					scan_credits_limit_monthly: planDef.scanCredits,
				}),
			).catch((e: any) => console.warn('[convert-trial] optimistic full grant failed (non-fatal):', e?.message));
		}

		return { subscriptionId, status };
	} catch (error: any) {
		if (error?.statusCode) throw error;
		console.error('[stripe/subscription/convert-trial] error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to add your card. Please try again.',
		});
	}
});

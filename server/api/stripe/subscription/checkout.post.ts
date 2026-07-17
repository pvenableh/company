// POST /api/stripe/subscription/checkout
// Creates a Stripe Checkout Session for subscription signup
import Stripe from 'stripe';
import { EARNEST_PLANS } from '~~/server/utils/stripe';
import type { EarnestPlanId } from '~~/server/utils/stripe';

export default defineEventHandler(async (event) => {
	const stripe = useStripe();
	const body = await readBody(event);
	const { organizationId, customerId, plan, interval, successUrl, cancelUrl } = body;
	let { email, priceId } = body;

	// Org-owned billing: the org is the billing entity. Scope authorization to the
	// target org when provided; fall back to the any-org owner/admin check for
	// legacy callers.
	if (organizationId) {
		await requireOrgPermission(event, organizationId, 'org_settings', 'update');
	} else {
		await requireOrgRole(event, ['owner', 'admin']);
	}

	// Default email to the authenticated user when client omits it (the wizard
	// flow doesn't have it client-side and shouldn't need to send it).
	if (!email) {
		const session = await getUserSession(event);
		email = (session as any)?.user?.email;
	}
	if (!email) {
		throw createError({ statusCode: 400, message: 'Email is required' });
	}

	// Resolve priceId from `plan` + optional `interval` ('monthly'|'annual').
	// This lets the wizard call with `{ plan: 'solo', interval: 'monthly' }`
	// instead of leaking Stripe price IDs into client code.
	if (!priceId && plan) {
		const planDef = EARNEST_PLANS[plan as EarnestPlanId];
		if (!planDef) {
			throw createError({ statusCode: 400, message: `Unknown plan: ${plan}` });
		}
		priceId = interval === 'annual' ? planDef.stripePriceIdAnnual : planDef.stripePriceId;
		if (!priceId) {
			throw createError({
				statusCode: 500,
				message: `Stripe price not configured for ${plan} ${interval || 'monthly'}`,
			});
		}
	}

	if (!priceId) {
		throw createError({ statusCode: 400, message: 'Price ID or plan is required' });
	}

	try {
		// Resolve the ORG's Stripe customer (created on demand, tagged with the org
		// id). Legacy callers may still pass a customerId directly.
		let customer = customerId || null;
		if (!customer && organizationId) {
			customer = await getOrCreateOrgStripeCustomer(organizationId, { emailFallback: email });
		}
		if (!customer) {
			// Legacy fallback: list-by-email (never search — 400s on new accounts).
			const existing = await stripe.customers.list({ email, limit: 1 });
			customer =
				existing.data.find((c) => !(c as any).deleted)?.id ||
				(await stripe.customers.create({ email, metadata: { source: 'earnest_subscription' } })).id;
		}

		const session = await stripe.checkout.sessions.create({
			customer,
			mode: 'subscription',
			payment_method_types: ['card'],
			line_items: [{ price: priceId, quantity: 1 }],
			success_url: successUrl || `${getAppBaseUrl(event)}/apps/organization?floor=billing&session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: cancelUrl || `${getAppBaseUrl(event)}/apps/organization?floor=billing`,
			subscription_data: {
				metadata: {
					earnest_email: email,
					// Authoritative org link for the webhook (no customer→user walk).
					...(organizationId ? { organization_id: organizationId } : {}),
				},
			},
		});

		return { sessionId: session.id, url: session.url };
	} catch (error: any) {
		console.error('Subscription checkout error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to create checkout session',
		});
	}
});

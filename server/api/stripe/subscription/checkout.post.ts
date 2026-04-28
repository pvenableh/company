// POST /api/stripe/subscription/checkout
// Creates a Stripe Checkout Session for subscription signup
import Stripe from 'stripe';
import { EARNEST_PLANS } from '~~/server/utils/stripe';
import type { EarnestPlanId } from '~~/server/utils/stripe';

export default defineEventHandler(async (event) => {
	// Caller must be owner/admin of *some* org. The wizard creates the org
	// before invoking checkout, so the new owner membership satisfies this.
	await requireOrgRole(event, ['owner', 'admin']);

	const stripe = useStripe();
	const body = await readBody(event);
	const { customerId, plan, interval, successUrl, cancelUrl } = body;
	let { email, priceId } = body;

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
		// Find or create customer
		let customer = customerId;
		if (!customer) {
			const existing = await stripe.customers.search({
				query: `email:"${email}"`,
			});
			if (existing.data.length > 0) {
				customer = existing.data[0].id;
			} else {
				const newCustomer = await stripe.customers.create({
					email,
					metadata: { source: 'earnest_subscription' },
				});
				customer = newCustomer.id;
			}
		}

		const session = await stripe.checkout.sessions.create({
			customer,
			mode: 'subscription',
			payment_method_types: ['card'],
			line_items: [{ price: priceId, quantity: 1 }],
			success_url: successUrl || `${process.env.APP_URL || 'http://localhost:3000'}/account/subscription?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: cancelUrl || `${process.env.APP_URL || 'http://localhost:3000'}/account/subscription`,
			subscription_data: {
				metadata: {
					earnest_email: email,
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

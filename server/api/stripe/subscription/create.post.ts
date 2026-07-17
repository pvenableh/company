// POST /api/stripe/subscription/create
// In-page subscription creation for the org-signup wizard.
// Creates a Stripe Subscription with `payment_behavior: 'default_incomplete'`
// and returns the embedded PaymentIntent's `clientSecret` so the client can
// confirm the first invoice via Stripe Elements (no redirect to Checkout).
//
// On successful confirmation the existing webhook chain
// (customer.subscription.created / .updated → handleSubscriptionChange)
// syncs the org's plan, token allotment, scan credits, and addons.
import { readUsers, updateUser } from '@directus/sdk';
import Stripe from 'stripe';
import { EARNEST_PLANS } from '~~/server/utils/stripe';
import type { EarnestPlanId } from '~~/server/utils/stripe';

interface CreateBody {
	plan: EarnestPlanId;
	interval?: 'monthly' | 'annual';
	termsAcceptedAt?: string;
	organizationId?: string;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	const email = (session as any).user?.email;
	if (!userId || !email) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<CreateBody>(event);
	const { plan, interval, termsAcceptedAt, organizationId } = body;

	// Org-owned billing: authorize against the target org when provided; the
	// wizard creates the org before this call so the new owner satisfies the check.
	if (organizationId) {
		await requireOrgPermission(event, organizationId, 'org_settings', 'update');
	} else {
		await requireOrgRole(event, ['owner', 'admin']);
	}

	const planDef = EARNEST_PLANS[plan];
	if (!planDef) {
		throw createError({ statusCode: 400, message: `Unknown plan: ${plan}` });
	}
	const priceId = interval === 'annual' ? planDef.stripePriceIdAnnual : planDef.stripePriceId;
	if (!priceId) {
		throw createError({
			statusCode: 500,
			message: `Stripe price not configured for ${plan} ${interval || 'monthly'}`,
		});
	}

	const stripe = useStripe();
	const directus = getServerDirectus();

	try {
		// Resolve the ORG's Stripe customer (created on demand, tagged with the org
		// id). Org-owned billing: the subscription belongs to the organization, not
		// the individual who ran the wizard. Legacy path (no orgId) falls back to a
		// user-level customer so pre-migration callers keep working.
		let customerId: string;
		if (organizationId) {
			customerId = await getOrCreateOrgStripeCustomer(organizationId, { emailFallback: email });
		} else {
			const users = await directus.request(
				readUsers({
					filter: { id: { _eq: userId } },
					fields: ['id', 'stripe_customer_id', 'email', 'first_name', 'last_name'],
					limit: 1,
				})
			);
			const user = users[0];
			if (!user) {
				throw createError({ statusCode: 404, message: 'User not found' });
			}
			customerId = user.stripe_customer_id || '';
			if (!customerId) {
				const customer = await stripe.customers.create({
					email,
					name: [user.first_name, user.last_name].filter(Boolean).join(' ') || undefined,
					metadata: { directus_user_id: userId, source: 'earnest_subscription_create' },
				});
				customerId = customer.id;
				await directus.request(updateUser(userId, { stripe_customer_id: customerId }));
			}
		}

		// Persist terms-acceptance timestamp on the user when supplied. This is
		// the wizard's payment-step checkbox; the registration page captures
		// the original consent. Both values are stored on the same field.
		if (termsAcceptedAt) {
			try {
				await directus.request(
					updateUser(userId, { terms_accepted_at: termsAcceptedAt })
				);
			} catch (e: any) {
				console.warn('[stripe/subscription/create] terms_accepted_at update failed (non-fatal):', e?.message);
			}
		}

		// Create the subscription with default_incomplete so the first invoice's
		// PaymentIntent is exposed for client-side confirmation.
		const subscription = await stripe.subscriptions.create({
			customer: customerId,
			items: [{ price: priceId, quantity: 1 }],
			payment_behavior: 'default_incomplete',
			payment_settings: {
				save_default_payment_method: 'on_subscription',
				payment_method_types: ['card'],
			},
			expand: ['latest_invoice.payment_intent'],
			metadata: {
				earnest_email: email,
				directus_user_id: userId,
				// Authoritative org link for the webhook (no customer→user walk).
				...(organizationId ? { organization_id: organizationId } : {}),
			},
		});

		const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
		const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent | null;
		const clientSecret = paymentIntent?.client_secret;

		if (!clientSecret) {
			// Should not happen with default_incomplete + a priced plan, but
			// surface clearly rather than handing the client an empty secret.
			throw createError({
				statusCode: 500,
				message: 'Stripe did not return a client secret for the subscription invoice',
			});
		}

		return {
			subscriptionId: subscription.id,
			clientSecret,
			customerId,
		};
	} catch (error: any) {
		if (error?.statusCode) throw error;
		console.error('[stripe/subscription/create] error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to create subscription',
		});
	}
});

// POST /api/stripe/subscription/create
// In-page subscription creation for the org-signup wizard.
//
// Starts a 14-day, NO-CARD free trial: the Stripe Subscription is created in
// `trialing` status with `trial_period_days: 14` and NO up-front payment
// method. `trial_settings.end_behavior.missing_payment_method: 'pause'` means
// that if the org never adds a card, Stripe transitions the subscription to
// `paused` at day 14 (rather than charging or cancelling) — the app then locks
// to the upgrade screen until a card is added (see convert-trial.post.ts).
//
// Because a trialing sub has no first invoice, there is NO PaymentIntent /
// clientSecret to confirm — the wizard skips the Stripe Elements step entirely.
// The existing webhook chain (customer.subscription.created / .updated →
// handleSubscriptionChange) syncs the org's plan, token allotment, scan
// credits, addons, and mirrors subscription_status + trial_ends_at onto the org.
import { readUsers, updateUser, readItem, updateItem } from '@directus/sdk';
import { EARNEST_PLANS, TRIAL_AI_TOKEN_GRANT } from '~~/server/utils/stripe';
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
	// Demo accounts (agency demo is Admin) must never create real subscriptions.
	await requireNotDemoSession(event);

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

		// Idempotency guard: if the org already has a live subscription, don't
		// create a second one. Re-running the wizard or a double submit would
		// otherwise bill the org for two plans and orphan the first (the webhook
		// only stores the latest subscription id).
		if (organizationId) {
			const orgRow = await directus.request(
				readItem('organizations', organizationId, { fields: ['stripe_subscription_id'] }),
			).catch(() => null) as any;
			const existingSub = orgRow?.stripe_subscription_id;
			if (existingSub) {
				const sub = await stripe.subscriptions.retrieve(existingSub).catch(() => null);
				if (sub && ['active', 'trialing', 'past_due', 'incomplete'].includes(sub.status)) {
					throw createError({
						statusCode: 409,
						message: 'This organization already has an active subscription.',
					});
				}
			}
		}

		// Create a NO-CARD 14-day trial. With `trial_period_days` and no default
		// payment method, Stripe requires `trial_settings.end_behavior.
		// missing_payment_method` — 'pause' transitions the sub to `paused` at
		// trial end instead of charging/cancelling, so the app can lock to the
		// upgrade screen and the same subscription resumes once a card is added.
		// `save_default_payment_method: 'on_subscription'` means the card added
		// later (via convert-trial) becomes the default for real billing.
		const subscription = await stripe.subscriptions.create({
			customer: customerId,
			items: [{ price: priceId, quantity: 1 }],
			trial_period_days: 14,
			trial_settings: { end_behavior: { missing_payment_method: 'pause' } },
			payment_settings: {
				save_default_payment_method: 'on_subscription',
				payment_method_types: ['card'],
			},
			metadata: {
				earnest_email: email,
				directus_user_id: userId,
				// Authoritative org link for the webhook (no customer→user walk).
				...(organizationId ? { organization_id: organizationId } : {}),
			},
		});

		// Optimistically mirror status + trial end onto the org so the trial-expiry
		// gate clears immediately — the authoritative `customer.subscription.created`
		// webhook (which also raises plan + token limits) can lag a few seconds, and
		// without this the org still reads `subscription_status: 'incomplete'` and
		// bounces the just-subscribed owner back to the wizard.
		if (organizationId) {
			await directus.request(
				updateItem('organizations', organizationId, {
					plan,
					subscription_status: subscription.status,
					trial_ends_at: subscription.trial_end
						? new Date(subscription.trial_end * 1000).toISOString()
						: null,
					// This endpoint always starts a NO-CARD trial, so grant the
					// bounded trial token allotment (not the full plan) — adding a
					// card later unlocks the full amount. Scan credits stay at plan
					// level. The webhook re-affirms these authoritatively.
					ai_token_limit_monthly: TRIAL_AI_TOKEN_GRANT,
					scan_credits_limit_monthly: planDef.scanCredits,
				}),
			).catch((e: any) => {
				console.warn('[stripe/subscription/create] optimistic org status update failed (non-fatal):', e?.message);
			});
		}

		return {
			subscriptionId: subscription.id,
			customerId,
			status: subscription.status, // 'trialing'
			trialEnd: subscription.trial_end
				? new Date(subscription.trial_end * 1000).toISOString()
				: null,
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

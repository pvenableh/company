// /server/api/stripe/paymentchange.ts
// Stripe webhook handler for payment and subscription events
import { defineEventHandler, getHeader, readBody } from 'h3';
import Stripe from 'stripe';
import { updateItems, updateItem, readItems, createItem } from '@directus/sdk';
import { EARNEST_PLANS, EARNEST_ADDONS, planFromPriceId, addonFromPriceId, earnestPlanToOrgPlan } from '~~/server/utils/stripe';
import type { EarnestPlanId, EarnestAddonId } from '~~/server/utils/stripe';

export default defineEventHandler(async (event) => {
	try {
		const stripe = useStripe();
		const payload = await readBody(event);
		const signature = getHeader(event, 'stripe-signature') || '';

		const config = useRuntimeConfig();
		const endpointSecret = config.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';
		let stripeEvent: Stripe.Event;

		// Verify webhook signature
		try {
			stripeEvent = stripe.webhooks.constructEvent(JSON.stringify(payload), signature, endpointSecret);
		} catch (err) {
			console.error('Stripe webhook verification error:', err);
			return { statusCode: 400, message: 'Webhook verification failed' };
		}

		console.log(`[Stripe Webhook] Event: ${stripeEvent.type}`);

		// ── Payment Intent Events ──
		if (stripeEvent.type === 'payment_intent.succeeded') {
			const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
			await handlePaymentIntentSucceeded(paymentIntent);
		}

		if (stripeEvent.type === 'payment_intent.payment_failed') {
			const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
			await handlePaymentIntentFailed(paymentIntent);
		}

		// ── Subscription Events ──
		if (stripeEvent.type === 'customer.subscription.created') {
			const subscription = stripeEvent.data.object as Stripe.Subscription;
			await handleSubscriptionChange(subscription, 'created');
		}

		if (stripeEvent.type === 'customer.subscription.updated') {
			const subscription = stripeEvent.data.object as Stripe.Subscription;
			await handleSubscriptionChange(subscription, 'updated');
		}

		if (stripeEvent.type === 'customer.subscription.deleted') {
			const subscription = stripeEvent.data.object as Stripe.Subscription;
			await handleSubscriptionChange(subscription, 'deleted');
		}

		// ── Invoice Events (subscription billing) ──
		if (stripeEvent.type === 'invoice.payment_succeeded') {
			const invoice = stripeEvent.data.object as Stripe.Invoice;
			if (invoice.subscription) {
				await handleSubscriptionInvoicePaid(invoice);
			}
		}

		if (stripeEvent.type === 'invoice.payment_failed') {
			const invoice = stripeEvent.data.object as Stripe.Invoice;
			if (invoice.subscription) {
				await handleSubscriptionInvoiceFailed(invoice);
			}
		}

		// ── Checkout Session Completed ──
		if (stripeEvent.type === 'checkout.session.completed') {
			const session = stripeEvent.data.object as Stripe.Checkout.Session;
			if (session.mode === 'subscription') {
				await handleCheckoutCompleted(session);
			}
		}

		return { statusCode: 200, message: 'Event received' };
	} catch (error) {
		console.error('Error handling Stripe webhook:', error);
		return { statusCode: 500, message: 'Server error' };
	}
});

// ── Payment Intent Handlers ──

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
	try {
		const directus = getTypedDirectus();
		const invoiceId = paymentIntent.metadata?.invoice_id;

		if (invoiceId) {
			// Update invoice status
			await directus.request(
				updateItems('invoices', [invoiceId], {
					status: 'paid',
					payment_intent: paymentIntent.id,
				})
			);
		}

		// Record payment
		await directus.request(
			createItem('payments_received', {
				payment_intent: paymentIntent.id,
				stripe_status: 'succeeded',
				amount: paymentIntent.amount,
				email: paymentIntent.receipt_email,
				invoice_id: invoiceId || null,
				status: 'paid',
				date_received: new Date().toISOString(),
			})
		);

		console.log(`[Stripe] Payment succeeded: ${paymentIntent.id}`);
	} catch (error) {
		console.error('[Stripe] Error handling payment success:', error);
	}
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
	try {
		const directus = getTypedDirectus();
		const invoiceId = paymentIntent.metadata?.invoice_id;

		if (invoiceId) {
			await directus.request(
				updateItems('invoices', [invoiceId], {
					status: 'failed',
				})
			);
		}

		console.log(`[Stripe] Payment failed: ${paymentIntent.id}`);
	} catch (error) {
		console.error('[Stripe] Error handling payment failure:', error);
	}
}

// ── Shared Helpers ──

/** Find the primary org for a Stripe customer by looking up their user → org_membership */
async function findOrgForCustomer(
	directus: ReturnType<typeof getTypedDirectus>,
	customerId: string
): Promise<{ userId: string; orgId: string | null }> {
	// Find user by stripe_customer_id
	const users = await directus.request(
		readItems('directus_users', {
			filter: { stripe_customer_id: { _eq: customerId } },
			fields: ['id', 'email'],
			limit: 1,
		})
	);

	if (users.length === 0 || !users[0]) {
		console.warn(`[Stripe] No user found for customer: ${customerId}`);
		return { userId: '', orgId: null };
	}

	const userId = users[0].id;

	// Find user's primary org (where they are owner or admin)
	const memberships = await directus.request(
		readItems('org_memberships', {
			filter: {
				user: { _eq: userId },
				status: { _eq: 'active' },
				role: { slug: { _in: ['owner', 'admin'] } },
			},
			fields: ['organization'],
			limit: 1,
		})
	);

	const orgId = memberships[0]?.organization
		? (typeof memberships[0].organization === 'string'
			? memberships[0].organization
			: (memberships[0].organization as any).id)
		: null;

	return { userId, orgId };
}

/** Resolve the Earnest plan from a subscription's first line item */
function resolvePlanFromSubscription(subscription: Stripe.Subscription): {
	planId: EarnestPlanId | null;
	plan: typeof EARNEST_PLANS[EarnestPlanId] | null;
} {
	const priceId = subscription.items.data[0]?.price?.id || '';
	const planId = planFromPriceId(priceId);
	const plan = planId ? EARNEST_PLANS[planId] : null;
	return { planId, plan };
}

// ── Subscription Handlers ──

async function handleSubscriptionChange(
	subscription: Stripe.Subscription,
	action: 'created' | 'updated' | 'deleted'
) {
	try {
		const directus = getTypedDirectus();
		const customerId = typeof subscription.customer === 'string'
			? subscription.customer
			: subscription.customer.id;

		const { userId, orgId } = await findOrgForCustomer(directus, customerId);
		if (!userId) return;

		// ── Update user record ──
		const subscriptionData: Record<string, any> = {
			stripe_subscription_id: subscription.id,
			subscription_status: subscription.status,
			subscription_plan: subscription.items.data[0]?.price?.id || null,
			subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
		};

		if (action === 'deleted') {
			subscriptionData.subscription_status = 'canceled';
			subscriptionData.stripe_subscription_id = null;
		}

		await directus.request(
			updateItems('directus_users', [userId], subscriptionData)
		);

		// ── Sync organization plan & limits ──
		if (orgId) {
			if (action === 'deleted') {
				await directus.request(
					updateItem('organizations', orgId, {
						plan: 'free',
						ai_token_limit_monthly: 0,
						ai_token_balance: 0,
						scan_credits_limit_monthly: 0,
						scan_credits_balance: 0,
						active_addons: null,
					})
				);
			} else {
				const { planId, plan } = resolvePlanFromSubscription(subscription);
				const orgUpdate: Record<string, any> = {};

				if (planId && plan) {
					orgUpdate.plan = earnestPlanToOrgPlan(planId);
					orgUpdate.ai_token_limit_monthly = plan.aiTokens.monthlyAllotment;
					orgUpdate.scan_credits_limit_monthly = plan.scanCredits;
				}

				// Detect add-on line items on the subscription
				const addons: Record<string, any> = {};
				for (const item of subscription.items.data) {
					const addonId = addonFromPriceId(item.price.id);
					if (addonId) {
						addons[addonId] = {
							stripe_subscription_item_id: item.id,
							active_since: new Date((item as any).created * 1000).toISOString(),
						};
					}
				}
				orgUpdate.active_addons = Object.keys(addons).length > 0 ? addons : null;

				await directus.request(
					updateItem('organizations', orgId, orgUpdate)
				);
			}
		}

		console.log(`[Stripe] Subscription ${action} for user ${userId} (org: ${orgId ?? 'none'}): ${subscription.status}`);
	} catch (error) {
		console.error(`[Stripe] Error handling subscription ${action}:`, error);
	}
}

async function handleSubscriptionInvoicePaid(invoice: Stripe.Invoice) {
	try {
		const directus = getTypedDirectus();
		const customerId = typeof invoice.customer === 'string'
			? invoice.customer
			: (invoice.customer as Stripe.Customer)?.id;

		if (!customerId) {
			console.warn(`[Stripe] No customer ID on invoice: ${invoice.id}`);
			return;
		}

		const { userId, orgId } = await findOrgForCustomer(directus, customerId);
		if (!userId || !orgId) {
			console.warn(`[Stripe] Invoice paid but no org found for customer: ${customerId}`);
			return;
		}

		// Resolve plan from the subscription attached to this invoice
		const stripe = useStripe();
		const subscriptionId = typeof invoice.subscription === 'string'
			? invoice.subscription
			: (invoice.subscription as Stripe.Subscription)?.id;

		if (!subscriptionId) return;

		const subscription = await stripe.subscriptions.retrieve(subscriptionId);
		const { plan } = resolvePlanFromSubscription(subscription);

		if (!plan) {
			console.warn(`[Stripe] Invoice paid but could not resolve plan for subscription: ${subscriptionId}`);
			return;
		}

		// Reset usage counters for the new billing period
		await directus.request(
			updateItem('organizations', orgId, {
				ai_tokens_used_this_period: 0,
				ai_token_balance: plan.aiTokens.monthlyAllotment,
				ai_billing_period_start: new Date().toISOString(),
				scans_used_this_period: 0,
				scan_credits_balance: plan.scanCredits,
			})
		);

		console.log(`[Stripe] Billing period reset for org ${orgId}: ${plan.aiTokens.monthlyAllotment} tokens, ${plan.scanCredits} scans`);
	} catch (error) {
		console.error('[Stripe] Error handling subscription invoice paid:', error);
	}
}

async function handleSubscriptionInvoiceFailed(invoice: Stripe.Invoice) {
	try {
		console.log(`[Stripe] Subscription invoice failed: ${invoice.id} for subscription ${invoice.subscription}`);
		// Stripe will automatically update the subscription status to past_due
		// which triggers customer.subscription.updated webhook
	} catch (error) {
		console.error('[Stripe] Error handling subscription invoice failure:', error);
	}
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
	try {
		const directus = getTypedDirectus();
		const customerId = typeof session.customer === 'string'
			? session.customer
			: (session.customer as Stripe.Customer)?.id;
		const subscriptionId = typeof session.subscription === 'string'
			? session.subscription
			: (session.subscription as Stripe.Subscription)?.id;

		if (!customerId || !subscriptionId) return;

		// Find user by email or stripe_customer_id and link subscription
		const email = session.customer_details?.email || session.metadata?.earnest_email;
		let users = await directus.request(
			readItems('directus_users', {
				filter: { stripe_customer_id: { _eq: customerId } },
				fields: ['id'],
				limit: 1,
			})
		);

		if (users.length === 0 && email) {
			users = await directus.request(
				readItems('directus_users', {
					filter: { email: { _eq: email } },
					fields: ['id'],
					limit: 1,
				})
			);
		}

		if (users.length > 0 && users[0]) {
			const userId = users[0].id;

			// Link subscription to user
			await directus.request(
				updateItems('directus_users', [userId], {
					stripe_customer_id: customerId,
					stripe_subscription_id: subscriptionId,
					subscription_status: 'active',
				})
			);

			// Set initial plan & token allocation on the org
			const { orgId } = await findOrgForCustomer(directus, customerId);
			if (orgId) {
				const stripe = useStripe();
				const subscription = await stripe.subscriptions.retrieve(subscriptionId);
				const { planId, plan } = resolvePlanFromSubscription(subscription);

				if (planId && plan) {
					await directus.request(
						updateItem('organizations', orgId, {
							plan: earnestPlanToOrgPlan(planId),
							ai_token_limit_monthly: plan.aiTokens.monthlyAllotment,
							ai_token_balance: plan.aiTokens.monthlyAllotment,
							ai_tokens_used_this_period: 0,
							ai_billing_period_start: new Date().toISOString(),
							scan_credits_limit_monthly: plan.scanCredits,
							scan_credits_balance: plan.scanCredits,
							scans_used_this_period: 0,
						})
					);
				}
			}

			console.log(`[Stripe] Checkout completed — linked subscription ${subscriptionId} to user ${userId} (org: ${orgId ?? 'none'})`);
		}
	} catch (error) {
		console.error('[Stripe] Error handling checkout completed:', error);
	}
}

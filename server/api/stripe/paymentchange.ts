// /server/api/stripe/paymentchange.ts
// Stripe webhook handler for payment and subscription events
import { defineEventHandler, getHeader, readRawBody } from 'h3';
import Stripe from 'stripe';
import { updateItems, updateItem, readItem, readItems, createItem, readUsers, updateUser } from '@directus/sdk';
import { EARNEST_PLANS, EARNEST_ADDONS, planFromPriceId, addonFromPriceId } from '~~/server/utils/stripe';
import type { EarnestPlanId, EarnestAddonId } from '~~/server/utils/stripe';
import { recomputeInvoiceStatus } from '~~/server/utils/recompute-invoice-status';
import { applyRefundAdjustment } from '~~/server/utils/apply-refund-adjustment';
import { handleDisputeCreated, handleDisputeClosed } from '~~/server/utils/apply-dispute-adjustment';
import { handlePlatformChargeRefund, handlePlatformDispute } from '~~/server/utils/apply-platform-reversal';
import { notifyEvent } from '~~/server/utils/notify-event';
import { fulfillTokenPurchase } from '~~/server/utils/fulfill-token-purchase';

export default defineEventHandler(async (event) => {
	try {
		const stripe = useStripe();
		// Stripe signs the *raw* request bytes — readBody → JSON.stringify
		// produces a different byte sequence (key order, whitespace) that
		// fails verification every time. Use readRawBody to keep the bytes
		// Stripe sent.
		const payload = await readRawBody(event, 'utf-8');
		const signature = getHeader(event, 'stripe-signature') || '';

		const config = useRuntimeConfig();
		const endpointSecret = config.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';
		let stripeEvent: Stripe.Event;

		// Verify webhook signature
		try {
			stripeEvent = stripe.webhooks.constructEvent(payload || '', signature, endpointSecret);
		} catch (err: any) {
			console.error('Stripe webhook verification error:', err?.message || err);
			throw createError({ statusCode: 400, message: 'Webhook verification failed' });
		}

		console.log(`[Stripe Webhook] Event: ${stripeEvent.type}`);

		// Connect events arrive with `event.account` set (the connected acct_…)
		// and are owned by /api/stripe/connect-webhook. Skip here so we don't
		// double-write payments_received rows when both webhooks receive the
		// same event (e.g. via `stripe listen` forwarding both scopes).
		if ((stripeEvent as any).account) {
			console.log(`[Stripe Webhook] Skipping connect event ${stripeEvent.type} for ${(stripeEvent as any).account}`);
			return { received: true, skipped: 'connect-event' };
		}

		// ── Payment Intent Events ──
		if (stripeEvent.type === 'payment_intent.succeeded') {
			const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
			await handlePaymentIntentSucceeded(paymentIntent);
		}

		if (stripeEvent.type === 'payment_intent.payment_failed') {
			const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
			await handlePaymentIntentFailed(paymentIntent);
		}

		// ── Refunds ──
		// Platform-scoped charges only (connect events already returned above).
		// First try the client-invoice path: books a negative adjustment row +
		// recomputes the invoice so a refund drops it back to processing/pending.
		// orgId is null here — legacy platform payment rows aren't org-stamped;
		// the adjustment inherits the original row's org.
		if (stripeEvent.type === 'charge.refunded') {
			const charge = stripeEvent.data.object as Stripe.Charge;
			const inv = await applyRefundAdjustment(charge, null);
			// No client-invoice payment row matched → this is one of Earnest's OWN
			// platform charges (AI token purchase or subscription). Reconcile it
			// platform-side: claw back tokens / flag the subscription.
			if (!inv.applied && inv.reason === 'no-original-row') {
				await handlePlatformChargeRefund(charge);
			}
		}

		// ── Disputes (chargebacks) on platform charges ──
		// Route the same way as refunds: a legacy client-invoice charge on the
		// platform account reconciles through the invoice dispute handlers; an
		// Earnest token/subscription charge reconciles platform-side.
		if (stripeEvent.type === 'charge.dispute.created') {
			const dispute = stripeEvent.data.object as Stripe.Dispute;
			if (await disputeMapsToInvoicePayment(dispute)) await handleDisputeCreated(dispute, null);
			else await handlePlatformDispute(dispute, 'created');
		}

		if (stripeEvent.type === 'charge.dispute.closed') {
			const dispute = stripeEvent.data.object as Stripe.Dispute;
			if (await disputeMapsToInvoicePayment(dispute)) await handleDisputeClosed(dispute, null);
			else await handlePlatformDispute(dispute, 'closed');
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
			} else if (session.mode === 'payment' && session.metadata?.type === 'token_purchase') {
				// Reliable server-side token crediting — fires even if the buyer
				// closed the success tab before the client fulfill call ran.
				const result = await fulfillTokenPurchase(session);
				if (result.success && !result.alreadyFulfilled) {
					console.log(`[Stripe] Token purchase fulfilled via webhook for org ${result.organizationId}: +${result.tokensAdded}`);
				}
			}
		}

		return { received: true };
	} catch (error: any) {
		// Re-throw createError() so the response status is correct (otherwise
		// the wrapping try/catch would swallow the 400 verification error).
		if (error?.statusCode) throw error;
		console.error('Error handling Stripe webhook:', error);
		throw createError({ statusCode: 500, message: 'Server error' });
	}
});

// ── Dispute routing ──

/**
 * Does this dispute map to a client-invoice `payments_received` row? True for a
 * legacy platform-account invoice charge (route to the invoice dispute
 * handlers); false for an Earnest token/subscription charge (route platform-side).
 */
async function disputeMapsToInvoicePayment(dispute: Stripe.Dispute): Promise<boolean> {
	const directus = getTypedDirectus();
	const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id || null;
	const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id || null;
	if (!chargeId && !piId) return false;
	const rows = (await directus.request(
		readItems('payments_received', {
			filter: {
				_or: [
					...(piId ? [{ payment_intent: { _eq: piId } } as any] : []),
					...(chargeId ? [{ charge_id: { _eq: chargeId } } as any] : []),
				],
			},
			fields: ['id'],
			limit: 1,
		}),
	)) as Array<{ id: string }>;
	return rows.length > 0;
}

// ── Payment Intent Handlers ──

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
	try {
		const directus = getTypedDirectus();
		const invoiceId = paymentIntent.metadata?.invoice_id;

		// `payments_received` is the org's CLIENT-revenue ledger (money received
		// against an invoice). A payment intent with no `invoice_id` is not a client
		// payment — it's the org paying Earnest (token top-ups, subscription
		// charges). Those are fulfilled elsewhere (fulfillTokenPurchase / the
		// subscription webhook) and show in the org's Stripe billing history, so we
		// must NOT record them here — otherwise they pollute the Payments list,
		// inflate "Total Received", and (being org-less) leak across orgs.
		if (!invoiceId) {
			console.log(`[Stripe] PI ${paymentIntent.id} has no invoice_id — not a client payment, skipping payments_received.`);
			return;
		}

		// Record the payment FIRST. Stripe amounts are minor units (cents); the
		// column stores dollars as a 2-decimal string.
		await directus.request(
			createItem('payments_received', {
				payment_intent: paymentIntent.id,
				stripe_status: 'succeeded',
				amount: (paymentIntent.amount / 100).toFixed(2),
				email: paymentIntent.receipt_email,
				invoice_id: invoiceId,
				status: 'paid',
				date_received: new Date().toISOString(),
				// Stripe test-mode payments (dev keys) are excluded from Money reporting.
				livemode: paymentIntent.livemode,
			})
		);

		// Stamp the PI ref (useful lookup), then let the payment total drive the
		// status. A PARTIAL payment must NOT mark the whole invoice paid —
		// recomputeInvoiceStatus sums payments_received and sets
		// paid / processing / pending accordingly.
		await directus.request(
			updateItems('invoices', [invoiceId], { payment_intent: paymentIntent.id })
		);
		const result = await recomputeInvoiceStatus(invoiceId);

		// Return leg: notify the agency only when the invoice actually became
		// fully paid (staff-only; the client isn't emailed this sprint).
		if (result.changed && result.newStatus === 'paid') {
			await notifyInvoicePaid(directus, invoiceId, result.previousStatus);
		}

		console.log(`[Stripe] Payment succeeded: ${paymentIntent.id} (invoice ${invoiceId})`);
	} catch (error) {
		console.error('[Stripe] Error handling payment success:', error);
	}
}

/**
 * Fire the inline "invoice paid" staff notification. Reads the invoice's org +
 * client so the resolver can fan out to org admins. Fire-and-forget: a notify
 * failure never rolls back the payment. The paid event still surfaces on the
 * client Activity tab via the read-time composer (no timeline row needed —
 * it's derivable), so we only handle notification here.
 */
async function notifyInvoicePaid(directus: any, invoiceId: string, previousStatus: string | null) {
	try {
		const inv = (await directus.request(
			(readItem as any)('invoices', invoiceId, { fields: ['id', 'invoice_code', 'title', 'client', 'organization'] })
		)) as any;
		const orgId = typeof inv?.organization === 'object' ? inv.organization?.id : inv?.organization;
		void notifyEvent({
			directus,
			collection: 'invoices',
			action: 'update',
			item: {
				status: 'paid',
				client: inv?.client,
				invoice_code: inv?.invoice_code,
				title: inv?.title,
				organization: orgId,
			},
			previousItem: { status: previousStatus || 'processing' },
			itemId: String(invoiceId),
			userId: '',
			orgId,
			staffOnly: true,
		}).catch((e) => console.warn('[Stripe] invoice-paid notify failed:', e));
	} catch (err) {
		console.warn('[Stripe] could not load invoice for paid notify:', err);
	}
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
	// Leave invoice.status as 'pending' so the customer can retry — there's
	// no 'failed' state in the invoices enum, and a failed attempt doesn't
	// invalidate the invoice. We log for observability only.
	console.log(`[Stripe] Payment failed: ${paymentIntent.id} (invoice ${paymentIntent.metadata?.invoice_id || 'n/a'})`);
}

// ── Shared Helpers ──

/** Find the primary org for a Stripe customer by looking up their user → org_membership */
async function findOrgForCustomer(
	directus: ReturnType<typeof getTypedDirectus>,
	customerId: string
): Promise<{ userId: string; orgId: string | null }> {
	// Find user by stripe_customer_id. directus_users is a system collection,
	// so it must be queried via readUsers (/users endpoint) not readItems
	// (/items/directus_users 403's).
	const users = await directus.request(
		readUsers({
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

		// Org-owned billing: prefer the authoritative org id stamped on the
		// subscription metadata (set by create/checkout). Fall back to the legacy
		// customer→user→membership walk for pre-migration subscriptions.
		const metaOrgId = (subscription.metadata?.organization_id as string | undefined) || null;
		const { userId, orgId: walkedOrgId } = await findOrgForCustomer(directus, customerId);
		const orgId = metaOrgId || walkedOrgId;
		if (!userId && !orgId) return;

		// ── Update user record (best-effort; only when the customer maps to one) ──
		if (userId) {
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
				updateUser(userId, subscriptionData)
			);
		}

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
						stripe_subscription_id: null,
					})
				);
			} else {
				const { planId, plan } = resolvePlanFromSubscription(subscription);
				const orgUpdate: Record<string, any> = {
					stripe_subscription_id: subscription.id,
					// Keep the org's billing customer authoritative.
					stripe_customer_id: customerId,
				};

				if (planId && plan) {
					orgUpdate.plan = planId;
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

		// Find user by email or stripe_customer_id and link subscription.
		// readUsers/updateUser route to /users; readItems/updateItems on
		// directus_users would 403 (system collection).
		const email = session.customer_details?.email || session.metadata?.earnest_email;
		let users = await directus.request(
			readUsers({
				filter: { stripe_customer_id: { _eq: customerId } },
				fields: ['id'],
				limit: 1,
			})
		);

		if (users.length === 0 && email) {
			users = await directus.request(
				readUsers({
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
				updateUser(userId, {
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
							plan: planId,
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

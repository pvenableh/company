// /server/api/stripe/paymentchange.ts
// Stripe webhook handler for payment and subscription events
import { defineEventHandler, getHeader, readBody } from 'h3';
import Stripe from 'stripe';
import { updateItems, readItems, createItem } from '@directus/sdk';

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

		// Find user by stripe_customer_id
		const users = await directus.request(
			readItems('directus_users', {
				filter: { stripe_customer_id: { _eq: customerId } },
				fields: ['id', 'email'],
				limit: 1,
			})
		);

		if (users.length === 0) {
			console.warn(`[Stripe] No user found for customer: ${customerId}`);
			return;
		}

		const userId = users[0].id;
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

		console.log(`[Stripe] Subscription ${action} for user ${userId}: ${subscription.status}`);
	} catch (error) {
		console.error(`[Stripe] Error handling subscription ${action}:`, error);
	}
}

async function handleSubscriptionInvoicePaid(invoice: Stripe.Invoice) {
	try {
		console.log(`[Stripe] Subscription invoice paid: ${invoice.id} for subscription ${invoice.subscription}`);
		// The subscription.updated event will handle status updates
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

		if (users.length > 0) {
			await directus.request(
				updateItems('directus_users', [users[0].id], {
					stripe_customer_id: customerId,
					stripe_subscription_id: subscriptionId,
					subscription_status: 'active',
				})
			);
			console.log(`[Stripe] Checkout completed — linked subscription ${subscriptionId} to user ${users[0].id}`);
		}
	} catch (error) {
		console.error('[Stripe] Error handling checkout completed:', error);
	}
}

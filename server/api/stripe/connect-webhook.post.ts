// POST /api/stripe/connect-webhook
//
// Phase 4 of Stripe Connect Express. Receives events for ALL connected
// accounts at this single endpoint — Stripe identifies the source account
// via `event.account` (acct_…) at the top level of every Connect event.
// This is the org-scoped counterpart to /api/stripe/paymentchange (which
// only handles platform-level events: Earnest's own subscriptions).
//
// Events handled:
//   account.updated          → mirror stripe_account_status onto the org row
//   payment_intent.succeeded → invoice paid, write payments_received row
//   payment_intent.payment_failed → log only (invoice stays pending)
//   charge.refunded          → mirror onto matching payments_received row
//   payout.paid / payout.failed   → log (notification surface lives in BillingSurface)
//   charge.dispute.created   → log (admin notification deferred)
//
// Signature is verified with STRIPE_CONNECT_WEBHOOK_SECRET — distinct from
// the platform webhook's STRIPE_WEBHOOK_SECRET. Both endpoints share the
// same Stripe SDK + API version.
import { defineEventHandler, getHeader, readRawBody } from 'h3';
import Stripe from 'stripe';
import { createItem, readItems, updateItem, updateItems } from '@directus/sdk';
import { useStripe } from '~~/server/utils/stripe';

type ConnectStatus = 'none' | 'pending' | 'active' | 'restricted';

function deriveStatus(account: Stripe.Account): ConnectStatus {
	if (!account) return 'none';
	if (account.charges_enabled && account.payouts_enabled) return 'active';
	const reqs = account.requirements || ({} as any);
	const hasDisablingReqs =
		(reqs.disabled_reason && reqs.disabled_reason !== 'requirements.pending_verification') ||
		(Array.isArray(reqs.currently_due) && reqs.currently_due.length > 0 && account.details_submitted);
	if (hasDisablingReqs) return 'restricted';
	return 'pending';
}

async function findOrgByStripeAccount(accountId: string | null | undefined): Promise<string | null> {
	if (!accountId) return null;
	const directus = getTypedDirectus();
	const orgs = (await directus.request(
		readItems('organizations', {
			filter: { stripe_account_id: { _eq: accountId } },
			fields: ['id'],
			limit: 1,
		}),
	)) as Array<{ id: string }>;
	return orgs?.[0]?.id || null;
}

export default defineEventHandler(async (event) => {
	try {
		const stripe = useStripe();
		// Stripe signs the *raw* request bytes — must use readRawBody.
		const payload = await readRawBody(event, 'utf-8');
		const signature = getHeader(event, 'stripe-signature') || '';

		const config = useRuntimeConfig();
		const endpointSecret =
			config.stripeConnectWebhookSecret || process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '';
		if (!endpointSecret) {
			throw createError({
				statusCode: 500,
				message: 'STRIPE_CONNECT_WEBHOOK_SECRET is not configured',
			});
		}

		let stripeEvent: Stripe.Event;
		try {
			stripeEvent = stripe.webhooks.constructEvent(payload || '', signature, endpointSecret);
		} catch (err: any) {
			console.error('[Stripe Connect] Webhook verification failed:', err?.message);
			throw createError({ statusCode: 400, message: 'Webhook verification failed' });
		}

		// Every Connect event has `account` (acct_…) at the top level; that's
		// the connected account that produced the event. Resolve it to an org
		// up-front for downstream handlers.
		const connectedAccountId = (stripeEvent as any).account as string | undefined;
		const orgId = await findOrgByStripeAccount(connectedAccountId);

		switch (stripeEvent.type) {
			case 'account.updated': {
				const account = stripeEvent.data.object as Stripe.Account;
				if (!orgId) {
					console.warn(`[Stripe Connect] account.updated for unknown acct: ${account.id}`);
					break;
				}
				const newStatus = deriveStatus(account);
				const directus = getTypedDirectus();
				await directus.request(
					updateItem('organizations', orgId, {
						stripe_account_status: newStatus,
					}),
				);
				console.log(`[Stripe Connect] account.updated: org ${orgId} → ${newStatus}`);
				break;
			}

			case 'payment_intent.succeeded': {
				const pi = stripeEvent.data.object as Stripe.PaymentIntent;
				await handlePaymentSucceeded(pi, orgId);
				break;
			}

			case 'payment_intent.payment_failed': {
				const pi = stripeEvent.data.object as Stripe.PaymentIntent;
				console.log(
					`[Stripe Connect] payment_intent.payment_failed: ${pi.id} (org ${orgId || 'unknown'}, invoice ${pi.metadata?.invoice_id || 'n/a'})`,
				);
				break;
			}

			case 'charge.refunded': {
				const charge = stripeEvent.data.object as Stripe.Charge;
				await handleChargeRefunded(charge);
				break;
			}

			case 'payout.paid':
			case 'payout.failed': {
				const payout = stripeEvent.data.object as Stripe.Payout;
				console.log(
					`[Stripe Connect] ${stripeEvent.type}: ${payout.id} (org ${orgId || 'unknown'}, ${(payout.amount / 100).toFixed(2)} ${payout.currency})${payout.failure_message ? ` — ${payout.failure_message}` : ''}`,
				);
				break;
			}

			case 'charge.dispute.created': {
				const dispute = stripeEvent.data.object as Stripe.Dispute;
				console.warn(
					`[Stripe Connect] charge.dispute.created: ${dispute.id} (org ${orgId || 'unknown'}, ${(dispute.amount / 100).toFixed(2)} ${dispute.currency}, reason: ${dispute.reason})`,
				);
				break;
			}

			default:
				console.log(`[Stripe Connect] Unhandled event: ${stripeEvent.type}`);
		}

		return { received: true };
	} catch (error: any) {
		if (error?.statusCode) throw error;
		console.error('[Stripe Connect] Webhook error:', error);
		throw createError({ statusCode: 500, message: 'Server error' });
	}
});

// ── Handlers ───────────────────────────────────────────────────────────────

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent, orgId: string | null) {
	try {
		const directus = getTypedDirectus();
		const invoiceId = paymentIntent.metadata?.invoice_id || null;
		const charge = paymentIntent.latest_charge as Stripe.Charge | string | null;
		const chargeId = typeof charge === 'string' ? charge : charge?.id || null;
		const receiptUrl = typeof charge === 'object' && charge ? charge.receipt_url : null;

		// Idempotency: skip if we've already written a row for this PI (the
		// manual refund route or a webhook retry could have beat us to it).
		const existing = (await directus.request(
			readItems('payments_received', {
				filter: { payment_intent: { _eq: paymentIntent.id } },
				fields: ['id'],
				limit: 1,
			}),
		)) as Array<{ id: string }>;

		if (!existing?.length) {
			await directus.request(
				createItem('payments_received', {
					payment_intent: paymentIntent.id,
					charge_id: chargeId,
					receipt_url: receiptUrl,
					stripe_status: 'succeeded',
					amount: (paymentIntent.amount / 100).toFixed(2),
					invoice_id: invoiceId,
					organization: orgId,
					status: 'paid',
					payment_method:
						(typeof charge === 'object' && charge?.payment_method_details?.type) ||
						paymentIntent.payment_method_types?.[0] ||
						null,
					date_received: new Date().toISOString(),
				}),
			);
		}

		if (invoiceId) {
			await directus.request(
				updateItems('invoices', [invoiceId], {
					status: 'paid',
				}),
			);
		}

		console.log(`[Stripe Connect] payment succeeded: ${paymentIntent.id} (org ${orgId || 'unknown'}, invoice ${invoiceId || 'n/a'})`);
	} catch (error) {
		console.error('[Stripe Connect] Error handling payment success:', error);
	}
}

async function handleChargeRefunded(charge: Stripe.Charge) {
	try {
		const directus = getTypedDirectus();
		const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id || null;

		const matches = (await directus.request(
			readItems('payments_received', {
				filter: {
					_or: [
						...(piId ? [{ payment_intent: { _eq: piId } } as any] : []),
						...(charge.id ? [{ charge_id: { _eq: charge.id } } as any] : []),
					],
				},
				fields: ['id', 'note', 'amount'],
				limit: 1,
			}),
		)) as Array<{ id: string; note?: string | null; amount?: string | null }>;

		const match = matches?.[0];
		if (!match) {
			console.warn(`[Stripe Connect] charge.refunded but no payments_received row for ${charge.id}`);
			return;
		}

		const fullyRefunded =
			!match.amount || Math.round(parseFloat(match.amount) * 100) === charge.amount_refunded;
		const note = [
			match.note?.trim(),
			`Refund recorded ${new Date().toISOString().slice(0, 10)}: $${(charge.amount_refunded / 100).toFixed(2)}`,
		]
			.filter(Boolean)
			.join('\n');

		await directus.request(
			updateItem('payments_received', match.id, {
				stripe_status: fullyRefunded ? 'refunded' : 'partially_refunded',
				note,
			}),
		);

		console.log(`[Stripe Connect] charge.refunded mirrored: ${charge.id} → ${match.id} (${fullyRefunded ? 'full' : 'partial'})`);
	} catch (error) {
		console.error('[Stripe Connect] Error handling charge.refunded:', error);
	}
}

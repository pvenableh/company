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
//   charge.dispute.created   → mark payment disputed + notify org admins
//   charge.dispute.closed    → won: restore; lost: reverse funds + reopen invoice
//
// Signature is verified with STRIPE_CONNECT_WEBHOOK_SECRET — distinct from
// the platform webhook's STRIPE_WEBHOOK_SECRET. Both endpoints share the
// same Stripe SDK + API version.
import { defineEventHandler, getHeader, readRawBody } from 'h3';
import Stripe from 'stripe';
import { createItem, readItem, readItems, updateItem, updateItems } from '@directus/sdk';
import { useStripe } from '~~/server/utils/stripe';
import { finalizeBooking } from '~~/server/utils/scheduler-finalize';
import { recomputeInvoiceStatus } from '~~/server/utils/recompute-invoice-status';
import { applyRefundAdjustment } from '~~/server/utils/apply-refund-adjustment';
import { handleDisputeCreated, handleDisputeClosed } from '~~/server/utils/apply-dispute-adjustment';
import { sendInvoicePaymentEmails } from '~~/server/utils/payment-receipt-email';
import { notifyEvent } from '~~/server/utils/notify-event';

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
				await handlePaymentSucceeded(pi, orgId, connectedAccountId || null);
				break;
			}

			case 'checkout.session.completed': {
				// Stage 5: paid scheduler bookings finalize here when the visitor
				// closes the tab before hitting the success URL. Idempotent —
				// finalizeBooking dedupes on payment_session_id.
				const session = stripeEvent.data.object as Stripe.Checkout.Session;
				if (session.metadata?.kind === 'scheduler_booking' && session.payment_status === 'paid') {
					await handleSchedulerBookingPaid(session, orgId);
				}
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
				await applyRefundAdjustment(charge, orgId);
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
				// Money is held (not yet lost) — mark the payment disputed + alert the
				// org's admins. No invoice change until the dispute closes.
				const dispute = stripeEvent.data.object as Stripe.Dispute;
				await handleDisputeCreated(dispute, orgId);
				break;
			}

			case 'charge.dispute.closed': {
				// won → payment stands; lost → reverse the funds like a refund and
				// reopen the invoice. Requires this event to be subscribed on the
				// Stripe webhook endpoint (verify in the dashboard).
				const dispute = stripeEvent.data.object as Stripe.Dispute;
				await handleDisputeClosed(dispute, orgId);
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

async function handlePaymentSucceeded(
	paymentIntent: Stripe.PaymentIntent,
	orgId: string | null,
	connectedAccountId: string | null,
) {
	try {
		const directus = getTypedDirectus();
		const invoiceId = paymentIntent.metadata?.invoice_id || null;
		const charge = paymentIntent.latest_charge as Stripe.Charge | string | null;
		const chargeId = typeof charge === 'string' ? charge : charge?.id || null;

		// Stripe webhook payloads send `latest_charge` as a string ID, not an
		// expanded object — so receipt_url and payment_method_details aren't
		// in the payload. Fetch the charge from the connected account to
		// hydrate them. Best-effort: a fetch failure shouldn't block writing
		// the row.
		let receiptUrl: string | null = typeof charge === 'object' && charge ? charge.receipt_url : null;
		let paymentMethodType: string | null =
			(typeof charge === 'object' && charge?.payment_method_details?.type) ||
			paymentIntent.payment_method_types?.[0] ||
			null;
		if (chargeId && connectedAccountId && (!receiptUrl || !paymentMethodType)) {
			try {
				const stripe = useStripe();
				const fetched = await stripe.charges.retrieve(chargeId, { stripeAccount: connectedAccountId });
				receiptUrl = receiptUrl || fetched.receipt_url || null;
				paymentMethodType = paymentMethodType || fetched.payment_method_details?.type || null;
			} catch (err) {
				console.warn(`[Stripe Connect] Could not retrieve charge ${chargeId} for receipt_url:`, err);
			}
		}

		// Idempotency: skip if we've already written a row for this PI (the
		// manual refund route or a webhook retry could have beat us to it).
		const existing = (await directus.request(
			readItems('payments_received', {
				filter: { payment_intent: { _eq: paymentIntent.id } },
				fields: ['id'],
				limit: 1,
			}),
		)) as Array<{ id: string }>;

		const wroteRow = !existing?.length;
		if (wroteRow) {
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
					payment_method: paymentMethodType,
					date_received: new Date().toISOString(),
				}),
			);
		}

		if (invoiceId) {
			// Recompute from the payment total instead of force-flipping to paid —
			// a partial payment must leave the invoice in 'processing', not 'paid'.
			const result = await recomputeInvoiceStatus(invoiceId);

			// Load the invoice once — reused by the branded receipt and the
			// paid-transition staff notify below. IMPORTANT: the getTypedDirectus
			// service token (DIRECTUS_SERVER_TOKEN) has NO field-read on
			// invoices.title / .organization — requesting them 403s the whole read
			// → inv=null → the receipt is silently skipped. Only request readable
			// fields; org comes from the already-resolved `orgId`, the label from
			// invoice_code.
			let inv: any = null;
			if (wroteRow || (result.changed && result.newStatus === 'paid')) {
				inv = (await directus
					.request(
						readItem('invoices', invoiceId, {
							fields: ['id', 'invoice_code', 'client', 'billing_email'],
						}),
					)
					.catch(() => null)) as any;
			}

			// Branded "payment received" receipt → payer + org owners/admins.
			// Fires once per payment (only when we wrote a new row, so webhook
			// retries don't re-send). AWAITED — a fire-and-forget promise can be
			// frozen when the serverless function returns before it completes.
			if (wroteRow && inv) {
				await sendInvoicePaymentEmails({
					orgId,
					invoice: inv,
					payerEmail: paymentIntent.receipt_email || null,
					amountDollars: paymentIntent.amount / 100,
					method: paymentMethodType,
					receiptUrl,
					dateIso: new Date().toISOString(),
				}).catch((e) => console.warn('[Stripe Connect] payment receipt send failed:', e));
			}

			// Return leg: notify the agency only on a genuine paid transition
			// (staff-only; client isn't emailed this sprint). The paid event
			// itself surfaces on the client Activity tab via the read-time
			// composer, so no timeline row is written here.
			if (result.changed && result.newStatus === 'paid' && inv) {
				try {
					await notifyEvent({
						directus,
						collection: 'invoices',
						action: 'update',
						item: {
							status: 'paid',
							client: inv?.client,
							invoice_code: inv?.invoice_code,
							organization: orgId,
						},
						previousItem: { status: result.previousStatus || 'processing' },
						itemId: String(invoiceId),
						userId: '',
						orgId,
						staffOnly: true,
						// The branded "payment received" staff confirmation (above)
						// is the email for this event — keep the bell, drop the
						// generic notification email to avoid double-emailing staff.
						skipEmail: true,
					}).catch((e) => console.warn('[Stripe Connect] invoice-paid notify failed:', e));
				} catch (err) {
					console.warn('[Stripe Connect] could not load invoice for paid notify:', err);
				}
			}
		}

		console.log(`[Stripe Connect] payment succeeded: ${paymentIntent.id} (org ${orgId || 'unknown'}, invoice ${invoiceId || 'n/a'})`);
	} catch (error) {
		console.error('[Stripe Connect] Error handling payment success:', error);
	}
}

function reassemble(meta: Record<string, string>, key: string): string | null {
	if (meta[key]) return meta[key];
	const chunkCount = parseInt(meta[`${key}_chunks`] || '0', 10);
	if (!chunkCount) return null;
	let out = '';
	for (let i = 0; i < chunkCount; i++) {
		out += meta[`${key}_${i}`] || '';
	}
	return out;
}

async function handleSchedulerBookingPaid(session: Stripe.Checkout.Session, orgId: string | null) {
	try {
		const meta = (session.metadata || {}) as Record<string, string>;
		const intakeRaw = reassemble(meta, 'intake_responses');
		let intakeResponses: Record<string, any> | null = null;
		if (intakeRaw) {
			try { intakeResponses = JSON.parse(intakeRaw); } catch {}
		}

		// Resolve event type title for the meeting record.
		let eventTypeTitle: string | null = null;
		const eventTypeId = parseInt(meta.event_type_id || '0', 10) || null;
		if (eventTypeId) {
			try {
				const directus = getTypedDirectus();
				const et = (await directus.request(
					readItem('event_types' as any, eventTypeId, { fields: ['title'] } as any),
				)) as { title?: string } | null;
				eventTypeTitle = et?.title || null;
			} catch {}
		}

		await finalizeBooking({
			hostUserId: meta.host_user_id!,
			eventTypeId,
			title: eventTypeTitle
				? `${eventTypeTitle} with ${meta.invitee_name || meta.invitee_email}`
				: null,
			meetingType: 'consultation',
			scheduledStart: meta.scheduled_start!,
			scheduledEnd: meta.scheduled_end || null,
			durationMinutes: parseInt(meta.duration_minutes || '0', 10) || null,
			inviteeName: meta.invitee_name || null,
			inviteeEmail: meta.invitee_email!,
			inviteePhone: meta.invitee_phone || null,
			bookingNotes: reassemble(meta, 'booking_notes') || null,
			intakeResponses,
			paymentSessionId: session.id,
		});

		// payments_received row is written by the payment_intent.succeeded
		// handler that fires on the same Connect event stream — no need to
		// double-write here.

		console.log(`[Stripe Connect] scheduler booking finalized via webhook: ${session.id} (org ${orgId || 'unknown'})`);
	} catch (err: any) {
		console.error('[Stripe Connect] handleSchedulerBookingPaid error:', err);
	}
}


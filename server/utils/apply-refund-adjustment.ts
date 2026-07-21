/**
 * Apply a Stripe refund to the internal ledger and recompute the invoice.
 *
 * Called from both Stripe webhooks on `charge.refunded`
 * (server/api/stripe/connect-webhook.post.ts for connected accounts,
 * server/api/stripe/paymentchange.ts for platform charges).
 *
 * WHY a negative "adjustment" row instead of flipping the payment's status:
 * the `payments_received.status` enum is only `'paid' | 'pending'` — there is
 * no `'refunded'` value to move a row to. And `recomputeInvoiceStatus` sums
 * `amount` across every row with `status='paid'`. So the clean, schema-free way
 * to reduce an invoice's paid total is to write a SECOND `payments_received`
 * row with `status='paid'` and a NEGATIVE `amount`. Recompute nets it out and
 * drops the invoice back to `processing` (partial refund) or `pending` (full
 * refund). The original payment row is preserved untouched for audit; we only
 * mirror `stripe_status` onto it for display.
 *
 * Idempotency: Stripe sends `charge.amount_refunded` as the CUMULATIVE total
 * refunded on the charge (not the delta of this event), and `charge.refunded`
 * can fire multiple times (incremental partial refunds, webhook retries). We
 * therefore only ever write the DIFFERENCE between the cumulative refunded
 * amount and what we've already booked as adjustment rows. A retry or an
 * already-applied refund produces a zero/negative delta and is a no-op.
 *
 * Adjustment rows are marked `stripe_status='refund'` so they can be told apart
 * from the original `'succeeded'` payment (and from each other's sign).
 *
 * Uses the admin token (getTypedDirectus). Best-effort throughout — a failure
 * here must never 500 the webhook (Stripe would retry and we'd double-count if
 * the write half-succeeded), so callers wrap in try/catch and we swallow.
 */
import Stripe from 'stripe';
import { createItem, readItem, readItems, updateItem } from '@directus/sdk';
import { recomputeInvoiceStatus } from '~~/server/utils/recompute-invoice-status';
import { sendInvoiceRefundEmails } from '~~/server/utils/payment-receipt-email';

const REFUND_MARKER = 'refund';

const toCents = (amount: string | number | null | undefined): number =>
	Math.round(Number(amount || 0) * 100);

const idOf = (ref: any): string | null =>
	ref == null ? null : typeof ref === 'object' ? ref.id ?? null : String(ref);

export interface RefundAdjustmentResult {
	applied: boolean;
	reason?: string;
	adjustmentAmount?: number;
	fullyRefunded?: boolean;
	invoiceId?: string | null;
	newInvoiceStatus?: string | null;
}

export async function applyRefundAdjustment(
	charge: Stripe.Charge,
	orgId: string | null,
): Promise<RefundAdjustmentResult> {
	const directus = getTypedDirectus();

	const piId =
		typeof charge.payment_intent === 'string'
			? charge.payment_intent
			: charge.payment_intent?.id || null;
	const chargeId = charge.id || null;

	if (!piId && !chargeId) {
		console.warn('[Refund] charge.refunded with no payment_intent or charge id — skipping');
		return { applied: false, reason: 'no-charge-ref' };
	}

	// Pull every payments_received row tied to this charge/PI: the original
	// positive payment plus any prior negative adjustment rows.
	const rows = (await directus.request(
		readItems('payments_received', {
			filter: {
				_or: [
					...(piId ? [{ payment_intent: { _eq: piId } } as any] : []),
					...(chargeId ? [{ charge_id: { _eq: chargeId } } as any] : []),
				],
			},
			fields: ['id', 'invoice_id', 'amount', 'organization', 'note', 'stripe_status', 'livemode'],
			limit: -1,
		}),
	)) as Array<{
		id: string;
		invoice_id?: any;
		amount?: string | null;
		organization?: any;
		note?: string | null;
		stripe_status?: string | null;
	}>;

	// The original payment is the positive-amount row; adjustments are negative.
	const original = rows.find((r) => Number(r.amount || 0) > 0);
	if (!original) {
		console.warn(`[Refund] charge.refunded but no original payment row for ${chargeId || piId}`);
		return { applied: false, reason: 'no-original-row' };
	}

	const alreadyAdjustedCents = rows
		.filter((r) => Number(r.amount || 0) < 0)
		.reduce((sum, r) => sum + Math.abs(toCents(r.amount)), 0);

	// charge.amount_refunded is CUMULATIVE. Only book the new portion.
	const targetRefundedCents = charge.amount_refunded || 0;
	const deltaCents = targetRefundedCents - alreadyAdjustedCents;

	if (deltaCents <= 0) {
		console.log(
			`[Refund] no new refund to book for ${chargeId || piId} ` +
				`(cumulative ${targetRefundedCents}¢, already booked ${alreadyAdjustedCents}¢) — idempotent no-op`,
		);
		return { applied: false, reason: 'already-applied' };
	}

	const originalCents = toCents(original.amount);
	const fullyRefunded = targetRefundedCents >= originalCents;
	const deltaDollars = (deltaCents / 100).toFixed(2);
	const invoiceId = idOf(original.invoice_id);
	const rowOrg = orgId ?? idOf(original.organization);

	// Write the negative adjustment row. status='paid' is REQUIRED so recompute
	// includes it in the sum; the negative amount is what nets the invoice down.
	await directus.request(
		createItem('payments_received', {
			payment_intent: piId,
			charge_id: chargeId,
			stripe_status: REFUND_MARKER,
			amount: `-${deltaDollars}`,
			invoice_id: invoiceId,
			organization: rowOrg,
			status: 'paid',
			date_received: new Date().toISOString(),
			note: `Refund of $${deltaDollars} for charge ${chargeId || piId}`,
			// Inherit test/live so the negative row hides/shows with its original.
			livemode: (original as any).livemode ?? null,
		}),
	);

	// Mirror the refund state onto the original row for display (does NOT change
	// its status/amount, so recompute still counts the full original payment —
	// the negative adjustment row is what offsets it).
	const mirrorNote = [
		original.note?.trim(),
		`Refund recorded ${new Date().toISOString().slice(0, 10)}: $${deltaDollars}`,
	]
		.filter(Boolean)
		.join('\n');
	await directus
		.request(
			updateItem('payments_received', original.id, {
				stripe_status: fullyRefunded ? 'refunded' : 'partially_refunded',
				note: mirrorNote,
			}),
		)
		.catch((e) => console.warn('[Refund] could not mirror refund onto original row:', e));

	let newInvoiceStatus: string | null = null;
	if (invoiceId) {
		const recompute = await recomputeInvoiceStatus(invoiceId);
		newInvoiceStatus = recompute.newStatus;
		console.log(
			`[Refund] booked $${deltaDollars} (${fullyRefunded ? 'full' : 'partial'}) on charge ${chargeId} → ` +
				`invoice ${invoiceId} ${recompute.changed ? `now ${recompute.newStatus}` : `unchanged (${recompute.newStatus})`}`,
		);
	} else {
		console.log(`[Refund] booked $${deltaDollars} adjustment for ${chargeId} (no invoice attached)`);
	}

	// Branded refund receipt → payer + staff. Fires once per booked delta (this
	// path already short-circuited on an already-applied refund), so partial and
	// incremental refunds each send their own confirmation. Best-effort.
	if (invoiceId) {
		void (async () => {
			try {
				const inv = (await directus.request(
					readItem('invoices', invoiceId, { fields: ['id', 'invoice_code', 'title', 'billing_email'] }),
				)) as { id: string; invoice_code?: string | null; title?: string | null; billing_email?: string | null } | null;
				if (!inv) return;
				const payerEmail =
					(charge.billing_details?.email as string | null) || charge.receipt_email || inv.billing_email || null;
				await sendInvoiceRefundEmails({
					orgId: rowOrg,
					invoice: inv,
					payerEmail,
					payerName: (charge.billing_details?.name as string | null) || null,
					amountDollars: deltaCents / 100,
					dateIso: new Date().toISOString(),
				});
			} catch (e: any) {
				console.warn('[Refund] refund receipt send failed:', e?.message ?? e);
			}
		})();
	}

	return {
		applied: true,
		adjustmentAmount: deltaCents / 100,
		fullyRefunded,
		invoiceId,
		newInvoiceStatus,
	};
}

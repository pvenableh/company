/**
 * Recompute an invoice's status from the sum of its `payments_received` rows.
 *
 * Sums every `payments_received` row whose `status='paid'` and compares to
 * `invoice.total_amount`:
 *   - paid_total >= total  → status = 'paid'
 *   - paid_total >  0      → status = 'processing'
 *   - paid_total == 0      → status = 'pending'
 *
 * Because refunds + lost disputes are modeled as NEGATIVE `status='paid'` rows
 * (see apply-refund-adjustment.ts / apply-dispute-adjustment.ts), that sum
 * already nets them out — a full refund drops the invoice back to 'pending'.
 * But 'pending' then looks identical to "never paid", so we ALSO surface the
 * reconciliation state explicitly on the invoice:
 *   - refunded_total  cumulative refunded/reversed amount (abs of the negative
 *                     adjustment rows), so reporting can tell "refunded" from
 *                     "unpaid".
 *   - disputed        any dispute is/was open or lost on this invoice.
 * These two fields are additive (scripts/setup-invoice-refund-fields.ts). The
 * write that sets them is best-effort + isolated so a not-yet-migrated
 * environment still gets the core status update (deploy-order-safe).
 *
 * Only writes when something actually changed, so safe to call after every
 * create/edit/delete of a payment.
 *
 * Never overrides 'archived' — once an invoice is archived, payment activity
 * doesn't bring it back.
 *
 * Uses the admin token (getTypedDirectus). Callers are responsible for their
 * own auth; this is plumbing.
 */
import { readItem, readItems, updateItem } from '@directus/sdk';

export interface RecomputeResult {
	invoiceId: string;
	previousStatus: string | null;
	newStatus: string;
	paidTotal: number;
	invoiceTotal: number;
	changed: boolean;
	/** Cumulative amount refunded/reversed on this invoice (>= 0). */
	refundedTotal: number;
	/** A payment on this invoice is/was disputed. */
	disputed: boolean;
}

const isDisputeStatus = (s: string | null | undefined): boolean => {
	const v = String(s || '');
	return v === 'disputed' || v.startsWith('dispute');
};

export async function recomputeInvoiceStatus(invoiceId: string): Promise<RecomputeResult> {
	if (!invoiceId) throw new Error('invoiceId is required');
	const directus = getTypedDirectus();

	// Deliberately does NOT request refunded_total/disputed — keeping the read
	// free of the new fields means this works even before the migration runs.
	const invoice = (await directus.request(
		readItem('invoices', invoiceId, { fields: ['id', 'status', 'total_amount'] }),
	)) as { id: string; status: string | null; total_amount: number | null } | null;

	if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

	const invoiceTotal = Number(invoice.total_amount || 0);

	// Pull ALL rows for the invoice — the positive payments, the negative refund/
	// dispute adjustment rows, and their stripe_status — so we can both net the
	// paid total and derive the refunded_total / disputed reporting flags.
	const payments = (await directus.request(
		readItems('payments_received', {
			filter: { invoice_id: { _eq: invoiceId } },
			fields: ['id', 'amount', 'status', 'stripe_status'],
			limit: -1,
		}),
	)) as Array<{ id: string; amount: string | number | null; status: string | null; stripe_status: string | null }>;

	const paidRows = payments.filter((p) => p.status === 'paid');
	const paidTotal = paidRows.reduce((sum, p) => sum + Number(p.amount || 0), 0);

	// Refunded/reversed = the magnitude of the negative adjustment rows.
	const refundedTotal =
		Math.round(
			paidRows
				.filter((p) => Number(p.amount || 0) < 0)
				.reduce((sum, p) => sum + Math.abs(Number(p.amount || 0)), 0) * 100,
		) / 100;
	const disputed = payments.some((p) => isDisputeStatus(p.stripe_status));

	let newStatus: 'paid' | 'processing' | 'pending';
	if (paidTotal >= invoiceTotal && invoiceTotal > 0) {
		newStatus = 'paid';
	} else if (paidTotal > 0) {
		newStatus = 'processing';
	} else {
		newStatus = 'pending';
	}

	// Don't bring archived invoices back to life (and don't touch their fields).
	if (invoice.status === 'archived') {
		return {
			invoiceId,
			previousStatus: invoice.status,
			newStatus: invoice.status,
			paidTotal,
			invoiceTotal,
			changed: false,
			refundedTotal,
			disputed,
		};
	}

	const statusChanged = invoice.status !== newStatus;
	// Only touch the reconciliation fields when there's actual refund/dispute
	// activity — a plain unpaid/paid invoice never needs them written.
	const shouldWriteReconState = refundedTotal > 0 || disputed;

	if (!statusChanged && !shouldWriteReconState) {
		return {
			invoiceId,
			previousStatus: invoice.status,
			newStatus,
			paidTotal,
			invoiceTotal,
			changed: false,
			refundedTotal,
			disputed,
		};
	}

	const update: Record<string, any> = {};
	if (statusChanged) update.status = newStatus;
	if (shouldWriteReconState) {
		update.refunded_total = refundedTotal.toFixed(2);
		update.disputed = disputed;
	}

	try {
		await directus.request(updateItem('invoices', invoiceId, update));
	} catch (e: any) {
		// refunded_total/disputed may not be migrated yet — never let that block
		// the core status transition. Retry with status only.
		console.warn('[recompute] recon-field write failed (fields migrated?):', e?.message ?? e);
		if (statusChanged) {
			await directus
				.request(updateItem('invoices', invoiceId, { status: newStatus }))
				.catch((e2: any) => console.warn('[recompute] status-only retry failed:', e2?.message ?? e2));
		}
	}

	return {
		invoiceId,
		previousStatus: invoice.status,
		newStatus,
		paidTotal,
		invoiceTotal,
		changed: statusChanged,
		refundedTotal,
		disputed,
	};
}

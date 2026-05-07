/**
 * Recompute an invoice's status from the sum of its `payments_received` rows.
 *
 * Sums every `payments_received` row whose `status='paid'` and compares to
 * `invoice.total_amount`:
 *   - paid_total >= total  → status = 'paid'
 *   - paid_total >  0      → status = 'processing'
 *   - paid_total == 0      → status = 'pending'
 *
 * Only writes when the status actually changed, so safe to call after every
 * create/edit/delete of a manual payment.
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
}

export async function recomputeInvoiceStatus(invoiceId: string): Promise<RecomputeResult> {
	if (!invoiceId) throw new Error('invoiceId is required');
	const directus = getTypedDirectus();

	const invoice = (await directus.request(
		readItem('invoices', invoiceId, { fields: ['id', 'status', 'total_amount'] }),
	)) as { id: string; status: string | null; total_amount: number | null } | null;

	if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

	const invoiceTotal = Number(invoice.total_amount || 0);

	// Sum paid payments via aggregate API
	const payments = (await directus.request(
		readItems('payments_received', {
			filter: {
				_and: [
					{ invoice_id: { _eq: invoiceId } },
					{ status: { _eq: 'paid' } },
				],
			},
			fields: ['id', 'amount'],
			limit: -1,
		}),
	)) as Array<{ id: string; amount: string | number | null }>;

	const paidTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

	let newStatus: 'paid' | 'processing' | 'pending';
	if (paidTotal >= invoiceTotal && invoiceTotal > 0) {
		newStatus = 'paid';
	} else if (paidTotal > 0) {
		newStatus = 'processing';
	} else {
		newStatus = 'pending';
	}

	// Don't bring archived invoices back to life.
	if (invoice.status === 'archived') {
		return {
			invoiceId,
			previousStatus: invoice.status,
			newStatus: invoice.status,
			paidTotal,
			invoiceTotal,
			changed: false,
		};
	}

	if (invoice.status === newStatus) {
		return {
			invoiceId,
			previousStatus: invoice.status,
			newStatus,
			paidTotal,
			invoiceTotal,
			changed: false,
		};
	}

	await directus.request(updateItem('invoices', invoiceId, { status: newStatus }));

	return {
		invoiceId,
		previousStatus: invoice.status,
		newStatus,
		paidTotal,
		invoiceTotal,
		changed: true,
	};
}

/**
 * PATCH /api/invoices/:id/payments/:paymentId
 *
 * Edit a manual payment row. Stripe-driven rows (those with a
 * `payment_intent`) are read-only and refused with 409.
 *
 * Auth: invoices.update on the invoice's org + non-demo session.
 *
 * Editable fields:
 *   amount, payment_method, date_received, reference, note,
 *   check_image, deposit_date, status
 *
 * Side effects: invoice status is recomputed.
 */
import { readItem, updateItem } from '@directus/sdk';
import { requireOrgPermission, requireNotDemoSession } from '~~/server/utils/org-permissions';
import { recomputeInvoiceStatus } from '~~/server/utils/recompute-invoice-status';

const EDITABLE = new Set([
	'amount',
	'payment_method',
	'date_received',
	'reference',
	'note',
	'check_image',
	'deposit_date',
	'status',
]);

export default defineEventHandler(async (event) => {
	const paymentId = getRouterParam(event, 'paymentId');
	if (!paymentId) {
		throw createError({ statusCode: 400, message: 'paymentId is required' });
	}

	const directus = getTypedDirectus();
	const existing = (await directus
		.request(
			readItem('payments_received', paymentId, {
				fields: ['id', 'invoice_id', 'organization', 'payment_intent', 'charge_id'],
			}),
		)
		.catch(() => null)) as any;
	if (!existing) {
		throw createError({ statusCode: 404, message: 'Payment not found' });
	}

	if (existing.payment_intent || existing.charge_id) {
		throw createError({ statusCode: 409, message: 'Stripe-managed payments cannot be edited' });
	}

	const orgId = typeof existing.organization === 'object' ? existing.organization?.id : existing.organization;
	const invoiceId = typeof existing.invoice_id === 'object' ? existing.invoice_id?.id : existing.invoice_id;
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'Payment row has no organization' });
	}
	if (!invoiceId) {
		throw createError({ statusCode: 400, message: 'Payment row has no invoice' });
	}

	await requireNotDemoSession(event);
	await requireOrgPermission(event, orgId, 'invoices', 'update');

	const body = (await readBody(event)) || {};
	const patch: Record<string, any> = {};
	for (const [key, value] of Object.entries(body)) {
		if (!EDITABLE.has(key)) continue;
		if (key === 'amount') {
			const n = Number(value);
			if (!Number.isFinite(n) || n <= 0) {
				throw createError({ statusCode: 400, message: 'amount must be a positive number' });
			}
			patch.amount = String(n);
		} else {
			patch[key] = value;
		}
	}

	if (Object.keys(patch).length === 0) {
		throw createError({ statusCode: 400, message: 'No editable fields supplied' });
	}

	const updated = (await directus.request(updateItem('payments_received', paymentId, patch))) as any;
	const recompute = await recomputeInvoiceStatus(invoiceId);

	return { payment: updated, invoice: recompute };
});

/**
 * DELETE /api/invoices/:id/payments/:paymentId
 *
 * Delete a manual payment row. Stripe-driven rows (with `payment_intent`
 * or `charge_id`) are refused with 409.
 *
 * Auth: invoices.update on the invoice's org + non-demo session.
 *
 * Side effects: invoice status is recomputed.
 */
import { readItem, deleteItem } from '@directus/sdk';
import { requireOrgPermission, requireNotDemoSession } from '~~/server/utils/org-permissions';
import { recomputeInvoiceStatus } from '~~/server/utils/recompute-invoice-status';

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
		throw createError({ statusCode: 409, message: 'Stripe-managed payments cannot be deleted' });
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

	await directus.request(deleteItem('payments_received', paymentId));
	const recompute = await recomputeInvoiceStatus(invoiceId);

	return { deleted: true, invoice: recompute };
});

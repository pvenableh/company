/**
 * POST /api/invoices/:id/payments
 *
 * Record a manual payment (check / Zelle / Venmo / cash / other) against
 * an invoice. Stripe-driven rows are written by the webhook in
 * server/api/stripe/invoiceupdate.post.js — do not call this route from
 * Stripe flows.
 *
 * Auth:
 *   - Authenticated user with `invoices.update` on the invoice's org
 *   - Demo-workspace logins are hard-blocked
 *
 * Body fields (all optional unless noted):
 *   amount         number, required, > 0
 *   payment_method string, required (e.g. 'check', 'zelle', 'venmo', 'cash')
 *   date_received  ISO date, defaults to today
 *   reference      string  (check #, confirmation #, handle)
 *   note           string
 *   check_image    directus_files id (uuid)
 *   deposit_date   ISO date
 *
 * Side effects:
 *   - Sets `organization` on the row from the invoice (UI doesn't need to know)
 *   - Sets `user_id` to the calling user
 *   - Sets `status='paid'` (manual rows are recorded after-the-fact)
 *   - Recomputes the invoice's status via recomputeInvoiceStatus
 */
import { createItem, readItem } from '@directus/sdk';
import { requireOrgPermission, requireNotDemoSession } from '~~/server/utils/org-permissions';
import { recomputeInvoiceStatus } from '~~/server/utils/recompute-invoice-status';

export default defineEventHandler(async (event) => {
	const invoiceId = getRouterParam(event, 'id');
	if (!invoiceId) {
		throw createError({ statusCode: 400, message: 'Invoice id is required' });
	}

	const body = (await readBody(event)) || {};
	const amountNum = Number(body.amount);
	if (!Number.isFinite(amountNum) || amountNum <= 0) {
		throw createError({ statusCode: 400, message: 'amount must be a positive number' });
	}
	const paymentMethod = (body.payment_method || '').toString().trim();
	if (!paymentMethod) {
		throw createError({ statusCode: 400, message: 'payment_method is required' });
	}

	// Look up the invoice (admin token) to find its org
	const directus = getTypedDirectus();
	const invoice = (await directus
		.request(readItem('invoices', invoiceId, { fields: ['id', 'bill_to', 'total_amount', 'status'] }))
		.catch(() => null)) as { id: string; bill_to: string | null; total_amount: number | null; status: string | null } | null;
	if (!invoice) {
		throw createError({ statusCode: 404, message: 'Invoice not found' });
	}
	const orgId = typeof invoice.bill_to === 'object' ? (invoice.bill_to as any)?.id : invoice.bill_to;
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'Invoice is not bound to an organization' });
	}

	// Auth: must have invoices.update on this org, and not be a demo login
	await requireNotDemoSession(event);
	const { userId } = await requireOrgPermission(event, orgId, 'invoices', 'update');

	const today = new Date().toISOString().slice(0, 10);
	const payload: Record<string, any> = {
		invoice_id: invoiceId,
		organization: orgId,
		user_id: userId,
		amount: String(amountNum),
		status: 'paid',
		payment_method: paymentMethod,
		date_received: body.date_received || today,
	};
	if (body.reference) payload.reference = String(body.reference).trim();
	if (body.note) payload.note = String(body.note).trim();
	if (body.check_image) payload.check_image = body.check_image;
	if (body.deposit_date) payload.deposit_date = body.deposit_date;

	const created = (await directus.request(createItem('payments_received', payload))) as any;
	const recompute = await recomputeInvoiceStatus(invoiceId);

	return { payment: created, invoice: recompute };
});

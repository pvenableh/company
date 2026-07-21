// server/api/public/invoice/[id].get.ts
/**
 * GET /api/public/invoice/[id]
 *
 * Anonymous, read-only fetch of a single invoice for the public payment page.
 *
 * Why this exists: the Directus Public policy no longer grants anonymous `read`
 * on `invoices` (nor on its `clients` / `organizations` / line-item relations)
 * after the public-read exposure tightening. The generic `/api/directus/items`
 * proxy still falls through to the Public client for `invoices`, but Directus
 * itself now denies the read — so an emailed pay-link renders a 403 "Private"
 * page for the very person meant to pay it.
 *
 * This endpoint restores the intended behavior WITHOUT re-widening collection
 * perms: it reads exactly one invoice by its (unguessable, v4) UUID using the
 * admin token and returns only the fields the pay page + PaymentMethods need.
 * The invoice id functions as the capability token — the same trust model the
 * public page always relied on — while `invoices` stays unlistable anonymously.
 *
 * Mirrors the field contract of /api/portal/invoice/[id] (the portal-scoped
 * sibling). Keep the two field lists in sync when the pay surface changes.
 */

import { readItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Invoice id required' });
  }

  const directus = getServerDirectus();

  const invoice = (await directus
    .request(
      readItem('invoices', id, {
        fields: [
          'id', 'status', 'due_date', 'invoice_date', 'invoice_code', 'note', 'memo',
          'total_amount', 'billing_email', 'billing_name', 'billing_address', 'emails', 'melio',
          'bill_to.id', 'bill_to.name', 'bill_to.email', 'bill_to.emails',
          'bill_to.stripe_customer_id', 'bill_to.address', 'bill_to.phone',
          'bill_to.website', 'bill_to.logo', 'bill_to.plan', 'bill_to.whitelabel',
          'bill_to.pass_card_fee', 'bill_to.pass_ach_fee',
          'bill_to.document_theme', 'bill_to.document_accent', 'bill_to.document_theme_config',
          'client.id', 'client.name', 'client.organization',
          'client.billing_name', 'client.billing_email', 'client.billing_address',
          'client.billing_contacts',
          'line_items.id', 'line_items.description', 'line_items.quantity',
          'line_items.rate', 'line_items.amount', 'line_items.product.name',
          'payments.*',
        ],
      }),
    )
    .catch(() => null)) as any;

  if (!invoice) {
    throw createError({ statusCode: 404, message: 'Invoice not found' });
  }

  return invoice;
});

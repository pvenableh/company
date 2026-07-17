// server/api/portal/invoice/[id].get.ts
/**
 * GET /api/portal/invoice/[id]
 *
 * Returns a single invoice for the portal user, if (and only if) the invoice's
 * client falls within the user's portal scope (their root client + descendants
 * via parent_client).
 *
 * Why this exists separate from /api/directus/items: portal users have a
 * Directus session but their policy doesn't grant `invoices` read. The
 * generic items proxy prefers the user token whenever a session exists, so
 * portal users get a 403 even though the public payment page reads the same
 * collection anonymously. Routing portal traffic through here gives us
 * explicit scope enforcement (invoice.client ∈ scopedClientIds) backed by the
 * admin token — no perm widening needed.
 */

import { readItem } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
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

  const clientId = typeof invoice.client === 'object' ? invoice.client?.id : invoice.client;
  if (!clientId || !ctx.scopedClientIds.includes(clientId)) {
    // Don't leak existence — same shape as not-found.
    throw createError({ statusCode: 404, message: 'Invoice not found' });
  }

  return invoice;
});

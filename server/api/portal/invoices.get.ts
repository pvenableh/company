// server/api/portal/invoices.get.ts
/**
 * GET /api/portal/invoices?status=all|unpaid|paid
 *
 * Returns invoices belonging to the current portal user's client + descendant
 * clients. Uses the admin Directus token under the hood — Directus row-level
 * perms on the 'client' role are not required (and would be brittle to keep
 * in sync).
 */

import { readItems } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const query = getQuery(event);
  const filter = (query.status as string) || 'all';

  const directus = getServerDirectus();

  // `invoices` has no `organization` FK — scope is implied via `client.organization`.
  // We rely on the parent_client walk in requirePortalContext to keep cross-tenant
  // results out (clients are unique per org).
  const conditions: any[] = [
    { client: { _in: ctx.scopedClientIds } },
  ];

  if (filter === 'unpaid') {
    conditions.push({ status: { _in: ['pending', 'processing'] } });
  } else if (filter === 'paid') {
    conditions.push({ status: { _eq: 'paid' } });
  }

  const invoices = await directus.request(
    readItems('invoices', {
      filter: { _and: conditions },
      fields: [
        'id',
        'invoice_code',
        'status',
        'invoice_date',
        'due_date',
        'total_amount',
        'client.id',
        'client.name',
        'payments.id',
        'payments.status',
        'payments.amount',
      ],
      sort: ['-invoice_date'],
      limit: 100,
    })
  ) as any[];

  return { invoices };
});

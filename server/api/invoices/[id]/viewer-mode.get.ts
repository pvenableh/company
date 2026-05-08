// server/api/invoices/[id]/viewer-mode.get.ts
/**
 * GET /api/invoices/[id]/viewer-mode
 *
 * Classifies how the current viewer relates to a given invoice. The public
 * payment page uses this to:
 *   - redirect portal users to /portal/invoices/[id] (one canonical surface)
 *   - hide the payment form for staff (they'd be paying themselves)
 *
 * Modes:
 *   anonymous  — no session
 *   portal     — session user has a client_portal_users row for this
 *                invoice's (org, client). Caller should redirect to portal.
 *   staff      — session user has an org_memberships row in this invoice's
 *                org. Caller should hide the payment form.
 *   unrelated  — signed in, but no relationship to this invoice. Treat like
 *                anonymous (show payment form).
 *
 * Always uses the admin token internally so it works for portal-user sessions
 * (whose policy can't read invoices broadly) and for unauthenticated callers.
 */

import { readItem, readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Invoice id required' });
  }

  const session = await getUserSession(event);
  const userId = session?.user?.id as string | undefined;
  if (!userId) return { mode: 'anonymous' as const };

  const directus = getServerDirectus();

  const invoice = (await directus
    .request(
      readItem('invoices', id, {
        fields: ['id', 'client.id', 'client.organization'],
      }),
    )
    .catch(() => null)) as { id: string; client?: { id: string; organization?: string | { id: string } | null } | null } | null;

  if (!invoice?.client) return { mode: 'unrelated' as const };

  const clientId = invoice.client.id;
  const orgId = typeof invoice.client.organization === 'object'
    ? invoice.client.organization?.id
    : invoice.client.organization;

  if (!orgId) return { mode: 'unrelated' as const };

  // Portal-user check first — a user could theoretically have both a portal
  // row AND a staff membership (admin previewing); portal takes precedence so
  // the redirect lands them on the portal surface they'd see in real life.
  const portalRows = await directus.request(
    readItems('client_portal_users', {
      filter: {
        user: { _eq: userId },
        organization: { _eq: orgId },
        client: { _eq: clientId },
        status: { _eq: 'active' },
      },
      fields: ['id'],
      limit: 1,
    }),
  ) as Array<{ id: number }>;

  if (portalRows.length > 0) return { mode: 'portal' as const };

  const staffRows = await directus.request(
    readItems('org_memberships', {
      filter: {
        user: { _eq: userId },
        organization: { _eq: orgId },
        status: { _eq: 'active' },
      },
      fields: ['id'],
      limit: 1,
    }),
  ) as Array<{ id: string }>;

  if (staffRows.length > 0) return { mode: 'staff' as const };

  return { mode: 'unrelated' as const };
});

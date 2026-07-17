/**
 * Token purchase history for an org — who bought AI tokens, when, and how much.
 * Reads the `token_purchases` ledger (written by fulfillTokenPurchase) and
 * resolves each buyer's name/email server-side (directus_users can't be deep-read
 * from the client). Admin-only via the shared org-permission check.
 *
 * Query: organizationId (required)
 */
import { readItems, readUsers } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  await requireOrgPermission(event, organizationId, 'ai_usage', 'read');

  const directus = getTypedDirectus();

  const purchases = (await directus.request(
    readItems('token_purchases', {
      filter: { organization: { _eq: organizationId } },
      fields: ['id', 'tokens', 'amount_cents', 'currency', 'package_id', 'status', 'user_id', 'date_created'],
      sort: ['-date_created'],
      limit: 50,
    }),
  )) as any[];

  // Resolve buyer display names in one batched /users read.
  const userIds = [...new Set(purchases.map((p) => p.user_id).filter(Boolean))];
  const buyers = new Map<string, { id: string; name: string; email: string | null }>();
  if (userIds.length > 0) {
    try {
      const users = (await directus.request(
        readUsers({
          filter: { id: { _in: userIds } },
          fields: ['id', 'first_name', 'last_name', 'email'],
          limit: -1,
        }),
      )) as any[];
      for (const u of users) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
        buyers.set(u.id, { id: u.id, name: name || u.email || 'Unknown', email: u.email ?? null });
      }
    } catch (err: any) {
      console.warn('[ai/manage/purchases] buyer name resolution failed:', err?.message);
    }
  }

  return {
    purchases: purchases.map((p) => ({
      id: p.id,
      tokens: Number(p.tokens) || 0,
      amountCents: Number(p.amount_cents) || 0,
      currency: p.currency || 'usd',
      packageId: p.package_id || null,
      status: p.status || 'paid',
      dateCreated: p.date_created,
      buyer: p.user_id ? buyers.get(p.user_id) ?? { id: p.user_id, name: 'Unknown', email: null } : null,
    })),
  };
});

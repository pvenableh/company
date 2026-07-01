// server/api/ai/actions/expire-stale.ts
/**
 * Retire stale `pending` ai_actions so the auto-filling HITL queue (the notices
 * cron + chat both enqueue proposals without a user asking) doesn't accrue
 * forever.
 *
 * A proposal older than the expiry window is flipped to `rejected` and tagged
 *   error:  'auto-expired (stale <N> days)'
 *   result: { expired: true }
 * — NO new schema/enum value (reusing `rejected` keeps this a pure data change).
 * The activity feed renders "Expired" for a rejected row whose error starts with
 * 'auto-expired'. ONLY `pending` rows are touched — approved/executed/failed are
 * never swept.
 *
 * Window: AI_ACTION_EXPIRY_DAYS (default 14).
 *
 * Auth: cronSecret Bearer token OR admin user session — same as
 * server/api/ai/notices/check.ts.
 *
 * Method-agnostic so Vercel Cron (which issues GET) can drive it; POST may carry
 * a body { organizationId?: string } to scope the sweep to one org (omitted → all
 * orgs). Returns { expired: number, window_days: number }.
 */
import { readItems, updateItems } from '@directus/sdk';

const EXPIRY_BATCH = 500;

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const body = method === 'POST' ? (await readBody(event).catch(() => ({})) || {}) : {};
  const { organizationId } = body as { organizationId?: string };

  // Auth: accept cronSecret or an authenticated user session (mirrors notices/check.ts).
  const authHeader = getHeader(event, 'authorization');
  const config = useRuntimeConfig();
  const cronSecret = config.cronSecret || (config.public as any)?.cronSecret;

  if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
    // Authenticated via cron secret
  } else {
    const session = await requireUserSession(event);
    const userId = (session as any).user?.id;
    if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const days = Math.max(1, Number(process.env.AI_ACTION_EXPIRY_DAYS) || 14);
  const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const directus = getServerDirectus();

  const filter: any = {
    _and: [
      { status: { _eq: 'pending' } },
      { date_created: { _lte: cutoffIso } },
      ...(organizationId ? [{ organization: { _eq: organizationId } }] : []),
    ],
  };

  let expired = 0;
  try {
    // Page through the stale set and batch-update by keys. `(readItems as any)`
    // dodges the untyped-SDK `never` on ai_actions.
    for (;;) {
      const rows = (await directus.request(
        (readItems as any)('ai_actions', {
          filter,
          fields: ['id'],
          sort: ['date_created'],
          limit: EXPIRY_BATCH,
        }),
      )) as any[];
      const ids = (rows || []).map((r) => r.id).filter((v) => v != null);
      if (ids.length === 0) break;

      await directus.request(
        (updateItems as any)('ai_actions', ids, {
          status: 'rejected',
          error: `auto-expired (stale ${days} days)`,
          result: { expired: true },
        }),
      );
      expired += ids.length;

      if (ids.length < EXPIRY_BATCH) break;
    }
  } catch (err: any) {
    console.error('[ai/actions/expire-stale] failed:', err?.message);
    throw createError({ statusCode: 500, message: 'Failed to expire stale actions' });
  }

  return { expired, window_days: days };
});

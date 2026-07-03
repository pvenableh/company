// server/api/ai/director/history.get.ts
/**
 * Past Director's Office briefings for the org — the "meeting history" feed for
 * the /director page. Each row is one saved briefing (see director_briefings).
 *
 * Auth: session + org membership; reads via the admin client. Returns an empty
 * list (not an error) if the store isn't set up yet, so the page renders fine
 * before the collection migration is run.
 *
 * Query: organizationId (required), limit? (default 40, max 100)
 */
import { readItems } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const query = getQuery(event);
  const organizationId = (query.organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  await requireOrgMembership(event, organizationId);

  const limit = Math.min(Number(query.limit) || 40, 100);

  try {
    const directus = getTypedDirectus();
    const rows = await directus.request(
      readItems('director_briefings' as any, {
        filter: { organization: { _eq: organizationId } } as any,
        fields: ['id', 'subject', 'topic', 'scope_type', 'entity_type', 'entity_id', 'cache_key', 'step_count', 'intro', 'date_created'],
        sort: ['-date_created'],
        limit,
      }),
    ) as any[];
    return { meetings: rows || [] };
  } catch (err: any) {
    // Store not set up yet → no history, not an error.
    console.warn('[ai/director/history] store inert until collection is set up:', err?.message);
    return { meetings: [] };
  }
});

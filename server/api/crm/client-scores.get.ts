// server/api/crm/client-scores.get.ts
/**
 * Batch client A–F ratings for the whole org, keyed by client id. One request
 * powers every client card / detail badge (and a connected contact's company
 * reference) — the rating is computed with a constant number of bulk queries via
 * buildOrgClientScores, never per-client fan-out.
 *
 * Auth: session + org membership, then reads via the admin client (same pattern
 * as the other crm/ai endpoints).
 *
 * Query:
 *   organizationId (required)
 *   clientId?      — return just that client's score (still uses the batch)
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { buildOrgClientScores } from '~~/server/utils/client-scorecard';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const query = getQuery(event);
  const organizationId = (query.organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });
  const clientId = (query.clientId || '').toString().trim();

  await requireOrgMembership(event, organizationId);

  const directus = getServerDirectus();
  try {
    const scores = await buildOrgClientScores(directus, organizationId, new Date());
    if (clientId) {
      return { scores: scores[clientId] ? { [clientId]: scores[clientId] } : {} };
    }
    return { scores };
  } catch (error: any) {
    console.error('[crm/client-scores] Error:', error?.message);
    throw createError({ statusCode: 500, message: 'Failed to compute client scores' });
  }
});

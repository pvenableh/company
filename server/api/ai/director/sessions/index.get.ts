// server/api/ai/director/sessions/index.get.ts
/**
 * List the LIVE Director's Office meetings for an organization — the "join the
 * table" list. Any active org member may see (and join) a live session.
 *
 * Auth: session + org membership. Query: organizationId (required).
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { listLiveSessions } from '~~/server/utils/director-sessions';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const query = getQuery(event);
  const organizationId = (query.organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  await requireOrgMembership(event, organizationId);

  const sessions = await listLiveSessions(organizationId);
  return { sessions };
});

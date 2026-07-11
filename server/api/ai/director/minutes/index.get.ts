// server/api/ai/director/minutes/index.get.ts
/**
 * List the recorded decision records (director_minutes) for an org, newest
 * first — powers the "Decision records" section on /director.
 *
 * Auth: session + membership of the target org.
 * Query: organizationId (required), limit?
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { listMinutes } from '~~/server/utils/director-minutes';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const query = getQuery(event);
  const organizationId = (query.organizationId ?? '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  await requireOrgMembership(event, organizationId);

  const limit = Math.min(100, Math.max(1, Number(query.limit) || 40));
  const minutes = await listMinutes(organizationId, limit);
  return { minutes };
});

// server/api/ai/director/minutes/[id]/index.get.ts
/**
 * Load one decision record (director_minutes) for the read-only recap page
 * (/director/minutes/[id]). Read through the admin client, then gated on
 * membership of the record's org — so the recap works even before the
 * row-scoped read perm is granted.
 *
 * Auth: session + membership of the record's org.
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { loadMinutes } from '~~/server/utils/director-minutes';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'Minutes id is required' });

  const minutes = await loadMinutes(id);
  if (!minutes) throw createError({ statusCode: 404, message: 'Decision record not found' });

  await requireOrgMembership(event, String(minutes.organizationId));

  return { minutes };
});

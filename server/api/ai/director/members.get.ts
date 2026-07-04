// server/api/ai/director/members.get.ts
/**
 * The org's team members — candidates to invite to a live Director's Office
 * session (admins + members alike). Read via the admin client so the picker
 * gets a clean roster regardless of the caller's own field perms.
 *
 * Auth: session + org membership. Query: organizationId (required).
 */
import { readItems } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const meId = (session as any).user?.id;
  const query = getQuery(event);
  const organizationId = (query.organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  await requireOrgMembership(event, organizationId);

  const directus = getTypedDirectus();
  let rows: any[] = [];
  try {
    rows = await directus.request(readItems('org_memberships' as any, {
      filter: { _and: [{ organization: { _eq: organizationId } }, { status: { _eq: 'active' } }] } as any,
      fields: ['id', 'role', 'user.id', 'user.first_name', 'user.last_name', 'user.avatar', 'user.email'],
      limit: 200,
    })) as any[];
  } catch (err: any) {
    rows = [];
  }

  const seen = new Set<string>();
  const members = rows
    .map((r) => {
      const u = r.user;
      const uid = u?.id ?? (typeof u === 'string' ? u : null);
      if (!uid || seen.has(uid)) return null;
      seen.add(uid);
      return {
        userId: uid,
        name: [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() || u?.email || 'Teammate',
        avatar: u?.avatar ?? null,
        email: u?.email ?? null,
        role: r.role ?? null,
        isSelf: uid === meId,
      };
    })
    .filter(Boolean);

  return { members };
});

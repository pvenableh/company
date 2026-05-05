// server/api/org/list-portal-users.post.ts
/**
 * List `client_portal_users` rows for an org, scoped by optional clientId.
 *
 * Body: { organizationId, clientId? }
 *
 * Restricted to owner/admin/manager. Routes through admin token because the
 * user-policy read filter scopes rows to `user._eq:$CURRENT_USER` — staff
 * need to see ALL portal users in their org.
 */

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { organizationId, clientId } = body || {};

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  const session = await getUserSession(event);
  const currentUserId = session?.user?.id;
  if (!currentUserId) {
    throw createError({ statusCode: 401, message: 'Not authenticated' });
  }

  const directus = getServerDirectus();

  const requesterRows = await directus.request(
    readItems('org_memberships', {
      filter: {
        organization: { _eq: organizationId },
        user: { _eq: currentUserId },
        status: { _eq: 'active' },
      },
      fields: ['id', 'role.slug'],
      limit: 1,
    })
  ) as any[];

  const requesterRole = requesterRows[0]?.role?.slug;
  if (!requesterRole || !['owner', 'admin', 'manager'].includes(requesterRole)) {
    throw createError({
      statusCode: 403,
      message: 'Only owners, admins, and managers can list portal users',
    });
  }

  const filter: any = { organization: { _eq: organizationId } };
  if (clientId) filter.client = { _eq: clientId };

  const rows = await directus.request(
    readItems('client_portal_users', {
      filter,
      fields: [
        'id', 'status', 'invited_at',
        'user.id', 'user.first_name', 'user.last_name', 'user.email', 'user.last_access',
        'client.id', 'client.name',
      ],
      sort: ['-invited_at'],
      limit: -1,
    } as any)
  ) as any[];

  return rows;
});

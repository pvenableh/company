// server/api/org/portal-user-status.post.ts
/**
 * Update the status of a `client_portal_users` row (revoke/restore).
 *
 * Body: { portalUserId, organizationId, status: 'active' | 'suspended' }
 *
 * Restricted to owner/admin/manager of the org. Routed through admin token
 * because user-policy permissions on `client_portal_users` are read-only —
 * granting update would leak between Client Manager and Client (shared
 * policy).
 */

import { readItem, readItems, updateItem } from '@directus/sdk';

const ALLOWED = new Set(['active', 'suspended']);

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { portalUserId, organizationId, status } = body || {};

  if (!portalUserId || !organizationId || !status) {
    throw createError({
      statusCode: 400,
      message: 'portalUserId, organizationId, and status are required',
    });
  }
  if (!ALLOWED.has(status)) {
    throw createError({ statusCode: 400, message: 'status must be "active" or "suspended"' });
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
      message: 'Only owners, admins, and managers can manage portal users',
    });
  }

  const existing = await directus.request(
    readItem('client_portal_users', portalUserId, {
      fields: ['id', 'organization', 'status'],
    } as any)
  ) as any;

  const rowOrg = typeof existing?.organization === 'object' ? existing.organization?.id : existing?.organization;
  if (!existing || rowOrg !== organizationId) {
    throw createError({ statusCode: 404, message: 'Portal user not found in this organization' });
  }

  await directus.request(
    updateItem('client_portal_users', portalUserId, { status } as any)
  );

  return { success: true, status };
});

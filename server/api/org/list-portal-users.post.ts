// server/api/org/list-portal-users.post.ts
/**
 * List `client_portal_users` rows for an org, scoped by optional clientId.
 *
 * Body: { organizationId, clientId? }
 *
 * When clientId is provided we ALSO return rows scoped to ancestor clients
 * (parent_client walked up to 2 hops) tagged `inherited: true`. The Portal
 * Access card uses this to show "via {parent}" badges so staff understand
 * who has implicit access through the parent_client inheritance walk in
 * server/utils/portal-auth.ts.
 *
 * Restricted to owner/admin/manager. Routes through admin token because the
 * user-policy read filter scopes rows to `user._eq:$CURRENT_USER` — staff
 * need to see ALL portal users in their org.
 */

import { readItems, readItem } from '@directus/sdk';

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

  // Walk up parent_client up to 2 hops so the inherited flag mirrors the
  // descendant walk done in portal-auth.ts (which goes 2 levels deep).
  const ancestorIds: string[] = [];
  if (clientId) {
    let cursor: string | null = clientId;
    for (let depth = 0; depth < 2 && cursor; depth++) {
      try {
        const c = await directus.request(
          readItem('clients', cursor, { fields: ['parent_client'] } as any),
        ) as any;
        const parent = typeof c?.parent_client === 'object' ? c.parent_client?.id : c?.parent_client;
        if (!parent) break;
        ancestorIds.push(parent);
        cursor = parent;
      } catch {
        break;
      }
    }
  }

  const filter: any = { organization: { _eq: organizationId } };
  if (clientId) {
    const clientIds = [clientId, ...ancestorIds];
    filter.client = { _in: clientIds };
  }

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

  if (!clientId) return rows;

  // Tag inherited rows so the UI can show "via {parent}" badges and disable
  // direct revoke (the access lives on the parent row).
  return rows.map((r: any) => ({
    ...r,
    inherited: r.client?.id !== clientId,
  }));
});

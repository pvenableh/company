// server/api/org/portal-invite-candidates.post.ts
/**
 * List org contacts annotated with their portal-access status for a given
 * client. Powers the "pick a contact" tab on the InviteClientModal.
 *
 * Body: { organizationId, clientId }
 *
 * Returns each contact with:
 *   - accessStatus: 'direct' | 'inherited' | 'none'
 *   - inheritedFromName?: string  (when inherited via an ancestor)
 *
 * Restricted to owner/admin/manager.
 */

import { readItem, readItems } from '@directus/sdk';

interface CandidateContact {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  photo: string | null;
  userId: string | null;
  accessStatus: 'direct' | 'inherited' | 'none';
  inheritedFromName?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { organizationId, clientId } = body || {};

  if (!organizationId || !clientId) {
    throw createError({
      statusCode: 400,
      message: 'organizationId and clientId are required',
    });
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
      message: 'Only owners, admins, and managers can list portal invite candidates',
    });
  }

  // Walk parent_client up to 2 hops, mirroring the descendant walk in
  // server/utils/portal-auth.ts so the inherited annotation matches what
  // portal users actually see at runtime.
  const ancestors: Array<{ id: string; name: string }> = [];
  let cursor: string | null = clientId;
  for (let depth = 0; depth < 2 && cursor; depth++) {
    try {
      const c = await directus.request(
        readItem('clients', cursor, { fields: ['parent_client.id', 'parent_client.name'] } as any),
      ) as any;
      const parent = c?.parent_client;
      if (!parent || typeof parent !== 'object' || !parent.id) break;
      ancestors.push({ id: parent.id, name: parent.name });
      cursor = parent.id;
    } catch {
      break;
    }
  }

  const ancestorIds = ancestors.map((a) => a.id);
  const ancestorNameById = new Map(ancestors.map((a) => [a.id, a.name] as const));
  const allClientIds = [clientId, ...ancestorIds];

  // Active portal rows touching the client tree.
  const portalRows = await directus.request(
    readItems('client_portal_users', {
      filter: {
        organization: { _eq: organizationId },
        status: { _eq: 'active' },
        client: { _in: allClientIds },
      },
      fields: ['id', 'user', 'client'],
      limit: -1,
    } as any)
  ) as any[];

  // Index portal rows by user id. Direct (this client) wins over inherited.
  const accessByUser = new Map<string, { kind: 'direct' | 'inherited'; clientId: string }>();
  for (const r of portalRows) {
    const userId = typeof r.user === 'object' ? r.user?.id : r.user;
    const rowClientId = typeof r.client === 'object' ? r.client?.id : r.client;
    if (!userId || !rowClientId) continue;
    const kind = rowClientId === clientId ? 'direct' : 'inherited';
    const existing = accessByUser.get(userId);
    if (!existing || (existing.kind === 'inherited' && kind === 'direct')) {
      accessByUser.set(userId, { kind, clientId: rowClientId });
    }
  }

  // Pull org contacts via the contacts_organizations junction.
  const contacts = await directus.request(
    readItems('contacts', {
      filter: {
        organizations: { organizations_id: { _eq: organizationId } },
      },
      fields: ['id', 'email', 'first_name', 'last_name', 'title', 'photo', 'user'],
      sort: ['first_name', 'last_name'],
      limit: -1,
    } as any)
  ) as any[];

  const result: CandidateContact[] = contacts.map((c: any) => {
    const userId = typeof c.user === 'object' ? c.user?.id : c.user;
    let access: { kind: 'direct' | 'inherited'; clientId: string } | undefined;
    if (userId) access = accessByUser.get(userId);

    let accessStatus: CandidateContact['accessStatus'] = 'none';
    let inheritedFromName: string | undefined;
    if (access?.kind === 'direct') {
      accessStatus = 'direct';
    } else if (access?.kind === 'inherited') {
      accessStatus = 'inherited';
      inheritedFromName = ancestorNameById.get(access.clientId);
    }

    return {
      id: c.id,
      email: c.email ?? null,
      first_name: c.first_name ?? null,
      last_name: c.last_name ?? null,
      title: c.title ?? null,
      photo: c.photo ?? null,
      userId: userId ?? null,
      accessStatus,
      inheritedFromName,
    };
  });

  return result;
});

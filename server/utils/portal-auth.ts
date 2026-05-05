// server/utils/portal-auth.ts
/**
 * Resolve the current request's client-portal context.
 *
 * Returns the user's active row in `client_portal_users` (org + client +
 * scope). Used by every /api/portal/* endpoint to scope reads to the user's
 * client.
 *
 * Throws 401 if not logged in. Throws 403 if the user has no active portal
 * row. Returns the resolved client + descendant client IDs (1 hop via
 * `parent_client`, then 1 more) so the portal can show the user's scope plus
 * child clients in one query.
 */

import { readItems } from '@directus/sdk';

export interface PortalContext {
  userId: string;
  organizationId: string;
  membershipId: string;
  clientId: string;
  /** clientId + descendant client IDs (children + grandchildren). */
  scopedClientIds: string[];
}

export async function requirePortalContext(event: any): Promise<PortalContext> {
  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const directus = getServerDirectus();

  const portalRows = await directus.request(
    readItems('client_portal_users', {
      filter: {
        user: { _eq: userId },
        status: { _eq: 'active' },
      },
      fields: ['id', 'organization', 'client'],
      limit: 1,
    } as any)
  ) as any[];

  if (!portalRows.length) {
    throw createError({
      statusCode: 403,
      message: 'No active client portal membership',
    });
  }

  const m = portalRows[0];
  const organizationId = typeof m.organization === 'object' ? m.organization?.id : m.organization;
  const clientId = typeof m.client === 'object' ? m.client?.id : m.client;

  if (!organizationId || !clientId) {
    throw createError({
      statusCode: 403,
      message: 'Membership missing organization or client scope',
    });
  }

  // Walk descendant clients up to 2 levels (children + grandchildren)
  const scopedClientIds = await collectDescendantClients(directus, clientId, organizationId);

  return {
    userId,
    organizationId,
    membershipId: m.id,
    clientId,
    scopedClientIds,
  };
}

async function collectDescendantClients(
  directus: any,
  rootId: string,
  orgId: string,
): Promise<string[]> {
  const result = new Set<string>([rootId]);
  let frontier = [rootId];

  for (let depth = 0; depth < 2 && frontier.length > 0; depth++) {
    const children = await directus.request(
      readItems('clients', {
        filter: {
          organization: { _eq: orgId },
          parent_client: { _in: frontier },
        },
        fields: ['id'],
        limit: -1,
      })
    ) as any[];

    const newIds = children.map((c: any) => c.id).filter((id: string) => !result.has(id));
    if (newIds.length === 0) break;
    newIds.forEach((id: string) => result.add(id));
    frontier = newIds;
  }

  return Array.from(result);
}

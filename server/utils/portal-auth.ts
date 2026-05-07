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

import { readItems, readItem } from '@directus/sdk';

export interface PortalContext {
  userId: string;
  organizationId: string;
  membershipId: string;
  clientId: string;
  /** clientId + descendant client IDs (children + grandchildren). */
  scopedClientIds: string[];
  /** True when the caller is an admin previewing the portal as a client.
   * Mutations should be rejected when this is set so a preview never writes
   * data on behalf of the real client. */
  isPreview?: boolean;
}

export async function requirePortalContext(event: any): Promise<PortalContext> {
  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const directus = getServerDirectus();

  // Admin preview path — either `?previewAs=<clientId>` on the request URL
  // (used by direct `/api/portal/scope` calls from the picker) OR the
  // `portal_preview_as` cookie (set by the layout when entering preview mode
  // so every existing portal API call inherits the scope without changing).
  // We verify the user has admin/owner role in the client's org before
  // granting access. Preview contexts are flagged so write endpoints can
  // reject them.
  const query = getQuery(event);
  const previewClientId =
    (typeof query?.previewAs === 'string' && query.previewAs)
    || getCookie(event, 'portal_preview_as')
    || '';
  if (previewClientId) {
    const previewCtx = await tryResolvePreviewContext(directus, userId, previewClientId);
    if (previewCtx) return previewCtx;
    // If preview was requested but unauthorized, fall through to the normal
    // path so a portal-user-with-admin-elsewhere case still works.
  }

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

async function tryResolvePreviewContext(
  directus: any,
  userId: string,
  previewClientId: string,
): Promise<PortalContext | null> {
  let client: any;
  try {
    client = await directus.request(
      readItem('clients', previewClientId, { fields: ['id', 'organization'] }),
    );
  } catch {
    return null;
  }
  const organizationId = typeof client?.organization === 'object' ? client.organization?.id : client?.organization;
  if (!organizationId) return null;

  const memberships = await directus.request(
    readItems('org_memberships', {
      filter: {
        _and: [
          { user: { _eq: userId } },
          { organization: { _eq: organizationId } },
          { status: { _eq: 'active' } },
        ],
      },
      fields: ['id', 'role.slug'],
      limit: 1,
    }),
  ) as any[];
  const role = memberships?.[0]?.role?.slug;
  if (role !== 'admin' && role !== 'owner') return null;

  const scopedClientIds = await collectDescendantClients(directus, previewClientId, organizationId);
  return {
    userId,
    organizationId,
    membershipId: memberships[0].id,
    clientId: previewClientId,
    scopedClientIds,
    isPreview: true,
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

// server/api/portal/scope.get.ts
/**
 * GET /api/portal/scope
 *
 * Returns:
 *   - `roots`: every active root scope the portal user holds in the active
 *     org. Each root carries its own one-hop descendants.
 *   - `activeRootId`: which root is currently selected (matches the
 *     `portal_active_scope` cookie or the first row).
 *
 * Backwards-compatible shape: the legacy `root` + `descendants` fields point
 * at the active scope so the existing PortalClientSelect renders unchanged
 * when there's only one root.
 *
 * Uses the admin Directus client via `requirePortalContext` so the picker
 * doesn't depend on row-level perms being perfectly in sync for the 'client'
 * role.
 */

import { readItems } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const directus = getServerDirectus();

  const rootIds = ctx.availableScopes.map((s) => s.clientId);

  const clients = await directus.request(
    readItems('clients', {
      filter: {
        organization: { _eq: ctx.organizationId },
        _or: [
          { id: { _in: rootIds } },
          { parent_client: { _in: rootIds } },
        ],
      },
      fields: ['id', 'name', 'logo', 'parent_client'],
      limit: -1,
      sort: ['name'],
    })
  ) as any[];

  const display = (c: any) => ({ id: c.id, name: c.name, logo: c.logo ?? null });

  const roots = rootIds
    .map((rootId) => {
      const rootClient = clients.find((c) => c.id === rootId);
      if (!rootClient) return null;
      const descendants = clients
        .filter((c) => {
          const parentId = typeof c.parent_client === 'object' ? c.parent_client?.id : c.parent_client;
          return parentId === rootId;
        })
        .map(display);
      return { ...display(rootClient), descendants };
    })
    .filter((r): r is { id: string; name: string; logo: string | null; descendants: any[] } => r !== null);

  // Legacy fields — kept so older clients keep working until they're updated.
  const activeRoot = roots.find((r) => r.id === ctx.clientId) ?? roots[0] ?? null;

  return {
    activeRootId: ctx.clientId,
    roots,
    // legacy
    root: activeRoot ? { id: activeRoot.id, name: activeRoot.name, logo: activeRoot.logo } : null,
    descendants: activeRoot?.descendants ?? [],
  };
});

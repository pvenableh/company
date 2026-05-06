// server/api/portal/scope.get.ts
/**
 * GET /api/portal/scope
 *
 * Returns the portal user's root client + one-hop descendants with display
 * fields (name, logo). Powers the portal header's client picker.
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

  const clients = await directus.request(
    readItems('clients', {
      filter: {
        organization: { _eq: ctx.organizationId },
        _or: [
          { id: { _eq: ctx.clientId } },
          { parent_client: { _eq: ctx.clientId } },
        ],
      },
      fields: ['id', 'name', 'logo', 'parent_client'],
      limit: -1,
      sort: ['name'],
    })
  ) as any[];

  const root = clients.find((c) => c.id === ctx.clientId) ?? null;
  const descendants = clients
    .filter((c) => c.id !== ctx.clientId)
    .map((c) => ({ id: c.id, name: c.name, logo: c.logo ?? null }));

  return {
    root: root ? { id: root.id, name: root.name, logo: root.logo ?? null } : null,
    descendants,
  };
});

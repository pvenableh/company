// server/api/portal/account-team.get.ts
/**
 * GET /api/portal/account-team
 *
 * Returns the agency members a portal user may @mention — scoped to the people
 * actually working their account (assigned to any project in the user's client
 * scope). This deliberately does NOT return the whole org roster: clients only
 * see their own account team, not the agency's full staff list.
 *
 * Shape mirrors the mention-list rows the TipTap composer expects:
 *   { id, first_name, last_name, email, avatar }
 */
import { readItems } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const directus = getServerDirectus();

  const projects = (await directus
    .request(
      readItems('projects', {
        filter: { client: { _in: ctx.scopedClientIds } },
        fields: [
          'assigned_to.directus_users_id.id',
          'assigned_to.directus_users_id.first_name',
          'assigned_to.directus_users_id.last_name',
          'assigned_to.directus_users_id.email',
          'assigned_to.directus_users_id.avatar',
        ],
        limit: 200,
      }),
    )
    .catch(() => [])) as Array<{ assigned_to?: Array<{ directus_users_id?: any }> }>;

  const byId = new Map<string, any>();
  for (const p of projects) {
    for (const a of p.assigned_to ?? []) {
      const u = a?.directus_users_id;
      if (u?.id && !byId.has(u.id)) {
        byId.set(u.id, {
          id: u.id,
          first_name: u.first_name ?? '',
          last_name: u.last_name ?? '',
          email: u.email ?? '',
          avatar: u.avatar ?? null,
        });
      }
    }
  }

  return Array.from(byId.values());
});

/**
 * Resolve the user ids implied by a Team or Client audience shortcut, scoped to
 * an org the caller belongs to. Lets the create dialog / manage panel reflect
 * exactly who a shortcut will add before committing. (Phase F fast-follow.)
 *
 * Query: ?organization=<id>&team=<id> | ?organization=<id>&client=<id>
 */
import { readItems } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { resolveAudienceMembers } from '~~/server/utils/channel-members';

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const organization = q.organization?.toString();
  const team = q.team?.toString() || null;
  const client = q.client?.toString() || null;
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });
  if (!team && !client) throw createError({ statusCode: 400, message: 'team or client is required' });

  await requireOrgMembership(event, organization);

  const directus = getTypedDirectus();
  const ids = await resolveAudienceMembers(directus, organization, { team, client });
  if (!ids.length) return { users: [] };

  const users = await directus.request(
    readItems('directus_users', {
      filter: { id: { _in: ids } },
      fields: ['id', 'first_name', 'last_name', 'email'],
      limit: -1,
    }),
  ) as any[];

  return { users };
});

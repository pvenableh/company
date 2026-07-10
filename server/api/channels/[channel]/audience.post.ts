/**
 * Change a channel's audience after creation (organization ↔ restricted).
 * Manager-only. When switching TO restricted, the actor is seeded as a
 * moderator so they don't lock themselves out (access flows through a
 * role-bearing channel_members row). Optional team/client shortcuts bulk-seed
 * members at the same time. (See project_channels_apps_home → Phase F.)
 *
 * Body: { audience: 'organization' | 'restricted', team?, client?, members?: string[] }
 */
import { updateItem } from '@directus/sdk';
import { requireChannelManager, upsertMembership, resolveAudienceMembers } from '~~/server/utils/channel-members';

interface AudienceBody {
  audience?: 'organization' | 'restricted';
  team?: string | null;
  client?: string | null;
  members?: string[];
}

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channel');
  const { userId, organization } = await requireChannelManager(event, channelId!);

  const body = await readBody<AudienceBody>(event);
  const audience = body?.audience === 'restricted' ? 'restricted' : 'organization';

  const directus = getTypedDirectus();
  const now = new Date().toISOString();

  await directus.request(updateItem('channels', channelId!, { audience }));

  if (audience === 'restricted') {
    // Keep the actor in — as a moderator (upsert promotes an existing cursor row).
    await upsertMembership(directus, channelId!, userId, organization, { role: 'moderator' }, now);

    // Optional bulk seed from a team/client shortcut + explicit members.
    const explicit = (body?.members || []).map((u) => String(u).trim()).filter(Boolean);
    const resolved = await resolveAudienceMembers(directus, organization, { team: body?.team, client: body?.client });
    const seed = [...new Set([...explicit, ...resolved])].filter((u) => u !== userId);
    for (const u of seed) {
      await upsertMembership(directus, channelId!, u, organization, { role: 'member' }, now);
    }
  }

  return { audience };
});

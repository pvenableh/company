/**
 * Add member(s) to a channel's ACL, or change a member's role. Manager-only
 * (org owner/admin, channel creator, or a channel moderator). Upserts a
 * role-bearing channel_members row per user — the row doubles as the read
 * cursor, so an existing cursor-only row (role null) is promoted in place.
 * (Phase F, see project_channels_apps_home.)
 *
 * Body: { users: string[], role?: 'member' | 'moderator' }
 */
import { requireChannelManager, upsertMembership, getUserOrgIds, resolveAudienceMembers } from '~~/server/utils/channel-members';

interface AddMembersBody {
  users?: string[];
  role?: 'member' | 'moderator';
  team?: string | null; // shortcut — add all team members
  client?: string | null; // shortcut — add client-role users
}

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channel');
  const { organization } = await requireChannelManager(event, channelId!);

  const body = await readBody<AddMembersBody>(event);
  const role = body?.role === 'moderator' ? 'moderator' : 'member';
  const directus0 = getTypedDirectus();
  const resolved = await resolveAudienceMembers(directus0, organization, { team: body?.team, client: body?.client });
  const users = [...new Set([...(body?.users || []).map((u) => String(u).trim()), ...resolved].filter(Boolean))];
  if (!users.length) {
    // Distinguish "no target sent" from "a team/client shortcut resolved to
    // nobody" — the latter used to surface the confusing "users is required".
    if (body?.client) {
      throw createError({ statusCode: 400, message: 'That client has no active members to add yet.' });
    }
    if (body?.team) {
      throw createError({ statusCode: 400, message: 'That team has no members to add.' });
    }
    throw createError({ statusCode: 400, message: 'Select at least one person to add.' });
  }

  const directus = getTypedDirectus();
  const now = new Date().toISOString();

  // Only add users who actually belong to the channel's organization — a
  // restricted channel must not grant access to outsiders.
  const added: string[] = [];
  const skipped: string[] = [];
  for (const user of users) {
    const orgIds = await getUserOrgIds(user);
    if (!orgIds.includes(organization)) { skipped.push(user); continue; }
    await upsertMembership(directus, channelId!, user, organization, { role }, now);
    added.push(user);
  }

  return { added, skipped };
});

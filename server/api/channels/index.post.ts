/**
 * Create a channel — with an audience and, for restricted channels, a seeded
 * member roster. (Phase F, see project_channels_apps_home.)
 *
 * Why a server route: a restricted channel's ACL lives in `channel_members`,
 * which has no row-level client perms (admin-token only). Creating the channel
 * and seeding members must be atomic — otherwise a non-admin creator of a
 * restricted channel would momentarily (or permanently) lack access to their
 * own channel, since access flows through a channel_members row with a role.
 *
 * The creator is always seeded as a `moderator` of a restricted channel so they
 * keep access + can manage it. Invited users are seeded as `member`.
 */
import { createItem, createItems, updateItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { resolveAudienceMembers } from '~~/server/utils/channel-members';

interface CreateChannelBody {
  name?: string;
  organization?: string;
  client?: string | null;
  project?: string | null;
  category?: string | null;
  audience?: 'organization' | 'restricted';
  members?: string[]; // user ids to seed (restricted only)
  team?: string | null; // audience shortcut — seed all team members
  client?: string | null; // audience shortcut — seed client-role users
}

// slug: lowercase, hyphenated, alphanumeric only (mirrors the app-side toSlug).
const toSlug = (s: string) =>
  String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateChannelBody>(event);
  const name = toSlug(body?.name || '');
  const organization = body?.organization?.toString().trim();
  if (!name || name.length < 3) throw createError({ statusCode: 400, message: 'name must be at least 3 characters' });
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });

  const { userId } = await requireOrgMembership(event, organization);

  const audience = body?.audience === 'restricted' ? 'restricted' : 'organization';
  const directus = getTypedDirectus();

  const created = await directus.request(
    createItem('channels', {
      name,
      organization,
      client: body?.client || null,
      project: body?.project || null,
      category: body?.category?.trim() || null,
      audience,
      status: 'published',
    }),
  ) as { id: string; name: string };

  // Directus stamps user_created from the acting token — here the admin/service
  // account, not the real creator. Re-assign it so ownership (the manager guard,
  // the "creator can't be removed" rule, the owner label) attributes correctly.
  await directus.request(updateItem('channels', created.id, { user_created: userId })).catch(() => {});

  // Restricted channels: seed the ACL. Creator = moderator (keeps access +
  // manage rights); invited users = member. Dedup + drop the creator from the
  // invited list so they aren't inserted twice.
  if (audience === 'restricted') {
    const now = new Date().toISOString();
    // Merge explicit picks with any team/client audience-shortcut members.
    const resolved = await resolveAudienceMembers(directus, organization, { team: body?.team, client: body?.client });
    const invited = [...new Set([...(body?.members || []).map((u) => String(u).trim()), ...resolved].filter(Boolean))].filter((u) => u !== userId);
    const rows: any[] = [
      { channel: created.id, user: userId, organization, role: 'moderator', joined_at: now, last_read_at: now, muted: false },
      ...invited.map((u) => ({ channel: created.id, user: u, organization, role: 'member', joined_at: now, last_read_at: now, muted: false })),
    ];
    await directus.request(createItems('channel_members', rows));
  }

  return created;
});

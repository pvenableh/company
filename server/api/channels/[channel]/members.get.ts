/**
 * List a channel's explicit members (the ACL) — role-bearing channel_members
 * rows, with the user's display info. Powers the manage-members panel and the
 * "who can see this" affordance. (Phase F, see project_channels_apps_home.)
 *
 * Cursor-only rows (role = null, auto-created on first open of an org-wide
 * channel) are excluded — they are read-state, not membership.
 *
 * Anyone with access to the channel may view its roster (for a restricted
 * channel that is, by construction, only its members + org admins).
 */
import { readItem, readItems } from '@directus/sdk';
import { requireChannelAccess } from '~~/server/utils/channel-members';

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channel');
  await requireChannelAccess(event, channelId!);

  const directus = getTypedDirectus();

  // The channel's audience + creator (owner) — lets the client mark the owner
  // (non-removable) reliably, without depending on realtime roster hydration.
  const channel = await directus.request(
    readItem('channels', channelId!, { fields: ['id', 'audience', 'user_created'] }),
  ).catch(() => null) as { audience?: string; user_created?: any } | null;
  const owner = typeof channel?.user_created === 'object' ? channel?.user_created?.id : channel?.user_created;

  const rows = await directus.request(
    readItems('channel_members', {
      filter: { _and: [{ channel: { _eq: channelId } }, { role: { _nnull: true } }] },
      fields: ['id', 'role', 'joined_at', 'user.id', 'user.first_name', 'user.last_name', 'user.avatar', 'user.email'],
      sort: ['role', 'joined_at'],
      limit: -1,
    }),
  ) as any[];

  return { members: rows, owner: owner || null, audience: channel?.audience || 'organization' };
});

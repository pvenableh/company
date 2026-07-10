/**
 * Remove a member from a channel's ACL. Manager-only (org owner/admin, channel
 * creator, or a channel moderator). Revokes access by clearing the row's role
 * (role = null) rather than deleting the row, so the user's read cursor is
 * preserved if they later regain access. The channel creator cannot be removed.
 * (Phase F, see project_channels_apps_home.)
 *
 * Body: { user: string }
 */
import { updateItem } from '@directus/sdk';
import { requireChannelManager, findMembership } from '~~/server/utils/channel-members';

interface RemoveMemberBody { user?: string }

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channel');
  const { channel } = await requireChannelManager(event, channelId!);

  const body = await readBody<RemoveMemberBody>(event);
  const user = body?.user?.toString().trim();
  if (!user) throw createError({ statusCode: 400, message: 'user is required' });

  const creatorId = typeof channel?.user_created === 'object' ? channel.user_created?.id : channel?.user_created;
  if (creatorId && creatorId === user) {
    throw createError({ statusCode: 422, message: 'The channel creator cannot be removed' });
  }

  const directus = getTypedDirectus();
  const membership = await findMembership(directus, channelId!, user);
  if (!membership) return { removed: false };

  await directus.request(updateItem('channel_members', membership.id, { role: null }));
  return { removed: true };
});

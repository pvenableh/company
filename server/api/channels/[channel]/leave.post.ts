/**
 * Leave a channel — delete the caller's `channel_members` row(s).
 * See project_channels_apps_home.
 */
import { deleteItem } from '@directus/sdk';
import { requireChannelAccess, findMembership } from '~~/server/utils/channel-members';

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channel');
  const { userId } = await requireChannelAccess(event, channelId!);

  const directus = getTypedDirectus();
  const existing = await findMembership(directus, channelId!, userId);
  if (existing) {
    await directus.request(deleteItem('channel_members', existing.id));
  }
  return { ok: true };
});

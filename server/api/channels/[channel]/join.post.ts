/**
 * Join a channel — create the caller's `channel_members` row (idempotent).
 * See project_channels_apps_home.
 */
import { requireChannelAccess, upsertMembership } from '~~/server/utils/channel-members';

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channel');
  const { userId, organization } = await requireChannelAccess(event, channelId!);

  const directus = getTypedDirectus();
  const now = new Date().toISOString();
  const row = await upsertMembership(directus, channelId!, userId, organization, {}, now);
  return row;
});

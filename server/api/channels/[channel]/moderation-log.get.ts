/**
 * Read a channel's moderation audit log (hide/remove/report events). Manager-
 * only (org owner/admin, channel creator, or a channel moderator) — the log has
 * no client perms, so it's served on the admin token behind requireChannelManager.
 * (See project_channels_apps_home → Phase F.)
 */
import { readItems } from '@directus/sdk';
import { requireChannelManager } from '~~/server/utils/channel-members';

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channel');
  await requireChannelManager(event, channelId!);

  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems('channel_moderation_log', {
      filter: { channel: { _eq: channelId } },
      fields: [
        'id', 'action', 'reason', 'message_id', 'message_snippet', 'date_created',
        'moderator.id', 'moderator.first_name', 'moderator.last_name',
        'message_author.id', 'message_author.first_name', 'message_author.last_name',
      ],
      sort: ['-date_created'],
      limit: 50,
    }),
  ) as any[];

  return { events: rows };
});

/**
 * Moderate a message — hide (soft) or remove (hard) — as a channel manager.
 * (Phase F, see project_channels_apps_home.)
 *
 * Why a server route: `messages.delete` is scoped to the author's own rows, so
 * a channel owner/moderator cannot remove someone ELSE's message via the user
 * token. This route validates the caller manages the message's channel (org
 * owner/admin, channel creator, or a channel moderator) and performs the action
 * on the admin token. Org admins previously moderated via a direct update/
 * delete; routing them here too gives one audited path and lets non-admin
 * channel owners/moderators moderate their own channels.
 *
 * Body: { action: 'hide' | 'remove' }
 *   hide   → status: 'archived' + tombstone text (preserved, hidden)
 *   remove → hard delete (replies orphan)
 */
import { readItem, updateItem, deleteItem } from '@directus/sdk';
import { requireChannelManager, logModerationEvent } from '~~/server/utils/channel-members';

interface ModerateBody { action?: 'hide' | 'remove' }

export default defineEventHandler(async (event) => {
  const messageId = getRouterParam(event, 'id');
  if (!messageId) throw createError({ statusCode: 400, message: 'message id is required' });

  const body = await readBody<ModerateBody>(event);
  const action = body?.action;
  if (action !== 'hide' && action !== 'remove') {
    throw createError({ statusCode: 400, message: "action must be 'hide' or 'remove'" });
  }

  const directus = getTypedDirectus();
  const message = await directus.request(
    readItem('messages', messageId, { fields: ['id', 'channel', 'text', 'user_created'] }),
  ).catch(() => null) as { id: string; channel: any; text?: string; user_created?: any } | null;
  if (!message) throw createError({ statusCode: 404, message: 'Message not found' });

  const channelId = typeof message.channel === 'object' ? message.channel?.id : message.channel;
  if (!channelId) throw createError({ statusCode: 422, message: 'Message has no channel' });

  // Authorize: caller must manage this channel.
  const { userId, organization } = await requireChannelManager(event, channelId);

  const author = typeof message.user_created === 'object' ? message.user_created?.id : message.user_created;

  if (action === 'remove') {
    await directus.request(deleteItem('messages', messageId));
  } else {
    await directus.request(
      updateItem('messages', messageId, {
        status: 'archived',
        text: '<p><em>This message was removed by a moderator.</em></p>',
      }),
    );
  }

  // Audit — snapshot author + original text before it's gone.
  await logModerationEvent(directus, {
    channel: channelId,
    organization,
    moderator: userId,
    action,
    message_id: messageId,
    message_author: author || null,
    message_snippet: message.text || null,
  });

  return { moderated: action };
});

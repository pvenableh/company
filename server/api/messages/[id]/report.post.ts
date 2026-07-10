/**
 * Record a message report in the Phase F moderation audit log. The existing
 * client-side admin notification (useNotifications) still fires; this route just
 * persists the report so managers can see a channel's moderation history.
 * (See project_channels_apps_home → Phase F.)
 *
 * The reporter must have access to the message's channel.
 * Body: { reason: string, details?: string }
 */
import { readItem } from '@directus/sdk';
import { requireChannelAccess, logModerationEvent } from '~~/server/utils/channel-members';

interface ReportBody { reason?: string; details?: string }

export default defineEventHandler(async (event) => {
  const messageId = getRouterParam(event, 'id');
  if (!messageId) throw createError({ statusCode: 400, message: 'message id is required' });

  const body = await readBody<ReportBody>(event);
  const reason = body?.reason?.toString().trim();
  if (!reason) throw createError({ statusCode: 400, message: 'reason is required' });

  const directus = getTypedDirectus();
  const message = await directus.request(
    readItem('messages', messageId, { fields: ['id', 'channel', 'text', 'user_created'] }),
  ).catch(() => null) as { channel: any; text?: string; user_created?: any } | null;
  if (!message) throw createError({ statusCode: 404, message: 'Message not found' });

  const channelId = typeof message.channel === 'object' ? message.channel?.id : message.channel;
  if (!channelId) throw createError({ statusCode: 422, message: 'Message has no channel' });

  const { userId, organization } = await requireChannelAccess(event, channelId);
  const author = typeof message.user_created === 'object' ? message.user_created?.id : message.user_created;

  await logModerationEvent(directus, {
    channel: channelId,
    organization,
    moderator: userId, // the reporter is the actor on this row
    action: 'report',
    reason: body?.details ? `${reason}: ${body.details}` : reason,
    message_id: messageId,
    message_author: author || null,
    message_snippet: message.text || null,
  });

  return { reported: true };
});

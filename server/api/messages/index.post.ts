/**
 * Create a chat message.
 *
 * Why a server route: Directus 11's row-level `permissions` filter on the
 * `create` action does not enforce FK walks (only field-level checks). The
 * `Client Manager.messages.create` perm filter `channel.organization._in:
 * $CURRENT_USER.organizations.organizations_id` is therefore decorative on
 * insert — a logged-in user could POST a message into ANY channel UUID.
 * This route closes the gap by validating the channel's organization is one
 * the caller belongs to before delegating the insert to the admin client.
 */
import { readItem, createItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

interface CreateMessageBody {
  text?: string;
  channel?: string;
  status?: string;
  parent_id?: string | null;
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody<CreateMessageBody>(event);
  const text = body?.text?.toString().trim();
  const channelId = body?.channel?.toString().trim();
  if (!text) throw createError({ statusCode: 400, message: 'text is required' });
  if (!channelId) throw createError({ statusCode: 400, message: 'channel is required' });

  const directus = getTypedDirectus();

  const channel = await directus.request(
    readItem('channels', channelId, { fields: ['id', 'organization'] }),
  ).catch(() => null) as { id: string; organization: string | null } | null;
  if (!channel) {
    throw createError({ statusCode: 404, message: 'Channel not found' });
  }
  if (!channel.organization) {
    throw createError({ statusCode: 422, message: 'Channel has no organization' });
  }

  await requireOrgMembership(event, channel.organization);

  const created = await directus.request(
    createItem('messages', {
      text,
      channel: channelId,
      status: body?.status ?? 'published',
      parent_id: body?.parent_id ?? null,
      user_created: userId,
    }),
  );

  return created;
});

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
import { readItem, createItem, readUsers } from '@directus/sdk';
import { awardUserEP } from '~~/server/utils/earnestScoreUser';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { emitNotification } from '~~/server/utils/notify-event';

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
    readItem('channels', channelId, { fields: ['id', 'organization', 'name'] }),
  ).catch(() => null) as { id: string; organization: string | null; name?: string | null } | null;
  if (!channel) {
    throw createError({ statusCode: 404, message: 'Channel not found' });
  }
  if (!channel.organization) {
    throw createError({ statusCode: 422, message: 'Channel has no organization' });
  }

  await requireOrgMembership(event, channel.organization);

  // Insert with the CALLER's own token so Directus stamps `user_created` with
  // the real user. `user_created` is a `user-created` special field — Directus
  // always overwrites any supplied value with the request's authenticated user
  // on `create`, so inserting on the admin/server token mis-attributes every
  // message to the service account ("API Admin"). The org-membership check
  // above is the security gate (the row-level `messages.create` perm filter is
  // decorative on insert — see the file header), so a user-token insert is both
  // correct and safe.
  const userDirectus = await getUserDirectus(event);
  const created = await userDirectus.request(
    createItem('messages', {
      text,
      channel: channelId,
      status: body?.status ?? 'published',
      parent_id: body?.parent_id ?? null,
    }),
  );

  // Arcade / Earnest Score — silent, fire-and-forget. Only UPDATE the acting
  // user's existing score row (createIfMissing: false) since we're on the admin
  // token here and a new row would mis-attribute user_created.
  awardUserEP(directus, channel.organization, userId, 'message_sent', { createIfMissing: false })
    .catch((e) => console.warn('[messages] Failed to award EP:', e));

  // Reply notifications. The `messages` collection has no notification Flow, so
  // replying to someone's message would otherwise never reach them. When this is
  // a reply (parent_id set), notify the PARENT message's author — unless they're
  // replying to their own message. (Mentions are handled by the composer at
  // selection time; reactions by the `reactions.create` Flow.) Fire-and-forget so
  // it never blocks or fails the send.
  if (body?.parent_id) {
    (async () => {
      const parent = await directus.request(
        readItem('messages', String(body.parent_id), { fields: ['id', 'user_created'] }),
      ).catch(() => null) as { user_created?: any } | null;
      const parentAuthor = typeof parent?.user_created === 'object' ? parent?.user_created?.id : parent?.user_created;
      if (!parentAuthor || parentAuthor === userId) return; // self-reply → skip

      let actorName: string | null = null;
      try {
        const me = await directus.request(
          readUsers({ filter: { id: { _eq: userId } } as any, fields: ['first_name', 'last_name'], limit: 1 }),
        ) as Array<{ first_name?: string; last_name?: string }>;
        actorName = `${me?.[0]?.first_name || ''} ${me?.[0]?.last_name || ''}`.trim() || null;
      } catch { /* non-fatal — subject falls back to a generic label */ }

      const config = useRuntimeConfig();
      const base = (config.public.appUrl as string) || 'https://app.earnest.guru';
      const link = channel.name ? `${base}/apps/channels/${encodeURIComponent(channel.name)}` : null;
      const preview = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);

      await emitNotification({
        category: 'conversations',
        type: 'reply',
        // Point the bell row at `messages` (mapped to the 'conversations'
        // category in notification-categories) — `link` drives the actual
        // click-through to the channel.
        collection: 'messages',
        itemId: String(body.parent_id),
        orgId: channel.organization,
        actorId: userId,
        actorName,
        recipientIds: [parentAuthor],
        subject: actorName ? `${actorName} replied to your message` : 'New reply to your message',
        message: preview,
        link,
      });
    })().catch((e) => console.warn('[messages] reply notify failed:', e));
  }

  return created;
});

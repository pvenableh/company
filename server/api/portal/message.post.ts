// server/api/portal/message.post.ts
/**
 * POST /api/portal/message
 *
 * Lets a client-portal user post a channel message.
 *
 * Why a dedicated route: the generic /api/messages requires org membership
 * (portal users have none) and inserts on the caller's token (portal users have
 * no `messages` create perm) — so it 403s/404s for the portal. This route
 * validates the target channel is inside the portal user's scope, then inserts
 * via the admin token attributed to the portal user, mirroring
 * /api/portal/tickets.
 *
 * Body: { text: string (HTML from the TipTap composer), channel: string }
 */
import { readItem, createItem } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

export default defineEventHandler(async (event) => {
  const ctx = await requirePortalContext(event);
  const body = await readBody(event);

  const text = (body?.text ?? '').toString().trim();
  const channelId = (body?.channel ?? '').toString().trim();
  if (!text) throw createError({ statusCode: 400, message: 'text is required' });
  if (!channelId) throw createError({ statusCode: 400, message: 'channel is required' });

  const directus = getServerDirectus();

  // Scope gate: the channel must live in this portal user's org + client scope.
  // Return 404 (not 403) on a miss so out-of-scope channel IDs don't leak.
  const channel = (await directus
    .request(readItem('channels', channelId, { fields: ['id', 'organization', 'client'] }))
    .catch(() => null)) as { id: string; organization: string | null; client: string | null } | null;

  const channelClient = channel && typeof (channel as any).client === 'object'
    ? (channel as any).client?.id
    : channel?.client;

  if (
    !channel
    || channel.organization !== ctx.organizationId
    || !channelClient
    || !ctx.scopedClientIds.includes(channelClient)
  ) {
    throw createError({ statusCode: 404, message: 'Channel not found' });
  }

  // Insert with the CALLER's own token so Directus stamps `user_created` with
  // the real portal user (an admin-token insert stamps the service account and
  // can't be reassigned afterward — `user_created` is locked to the inserting
  // token). This needs a `messages.create` grant on the Client policy
  // (scripts/setup-portal-messages-perms.ts). That perm's row-filter is
  // decorative on insert — Directus 11 create-perms don't FK-walk — so the
  // admin-side channel-scope check above is the real security gate.
  const userDirectus = await getUserDirectus(event);
  await userDirectus.request(
    createItem('messages', {
      text,
      channel: channelId,
      status: 'published',
    } as any),
  );

  // Portal users have create-only on `messages` (no read), so we can't return
  // the created row — the page reloads the thread via the admin-scoped proxy.
  return { ok: true };
});

/**
 * Per-channel unread counts for the current user, powering the message pane's
 * unread dividers and the AppRail badge.
 *
 * Unread = published messages in a joined channel with date_created after the
 * caller's `last_read_at`, authored by someone else. Muted channels still
 * report a count but are excluded from `total` (the badge number).
 * See project_channels_apps_home.
 */
import { aggregate, readItems } from '@directus/sdk';
import { getUserOrgIds } from '~~/server/utils/channel-members';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const directus = getTypedDirectus();

  const orgIds = await getUserOrgIds(userId);
  if (!orgIds.length) return { channels: {}, total: 0 };

  const memberships = await directus.request(
    readItems('channel_members', {
      filter: {
        _and: [
          { user: { _eq: userId } },
          { organization: { _in: orgIds } },
        ],
      },
      fields: ['channel', 'last_read_at', 'muted'],
      limit: -1,
    }),
  ) as Array<{ channel: string; last_read_at: string | null; muted: boolean }>;

  const channels: Record<string, number> = {};
  let total = 0;

  await Promise.all(
    memberships.map(async (m) => {
      if (!m.channel) return;
      const filter: any = {
        _and: [
          { channel: { _eq: m.channel } },
          { status: { _eq: 'published' } },
          { user_created: { _neq: userId } },
        ],
      };
      if (m.last_read_at) filter._and.push({ date_created: { _gt: m.last_read_at } });

      const res = await directus.request(
        aggregate('messages', { aggregate: { count: '*' }, query: { filter } }),
      ) as Array<{ count: string | number }>;

      const count = Number(res?.[0]?.count ?? 0) || 0;
      channels[m.channel] = count;
      if (!m.muted) total += count;
    }),
  );

  return { channels, total };
});

/**
 * Search messages across the caller's org channels (comms-hub search).
 * Scoped to the caller's active organizations; optionally to one channel.
 * See project_channels_apps_home.
 */
import { readItems } from '@directus/sdk';
import { getUserOrgIds } from '~~/server/utils/channel-members';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const query = getQuery(event);
  const q = (query.q?.toString() ?? '').trim();
  const channelScope = query.channel?.toString().trim();
  const limit = Math.min(Number(query.limit) || 30, 100);
  if (q.length < 2) return { items: [], query: q };

  const orgIds = await getUserOrgIds(userId);
  if (!orgIds.length) return { items: [], query: q };

  const directus = getTypedDirectus();

  const and: any[] = [
    { text: { _icontains: q } },
    { status: { _eq: 'published' } },
    { channel: { organization: { _in: orgIds } } },
  ];
  if (channelScope) and.push({ channel: { _eq: channelScope } });

  const items = await directus.request(
    readItems('messages', {
      filter: { _and: and },
      fields: [
        'id',
        'text',
        'parent_id',
        'date_created',
        'channel.id',
        'channel.name',
        'user_created.id',
        'user_created.first_name',
        'user_created.last_name',
        'user_created.avatar',
      ],
      sort: ['-date_created'],
      limit,
    }),
  );

  return { items, query: q };
});

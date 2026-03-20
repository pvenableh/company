/**
 * AI Usage by User — Per-user token and request breakdown.
 *
 * Query params:
 *   organizationId: string (optional)
 *   period: 'week' | 'month' | 'all' (default: 'month')
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const query = getQuery(event);
  const organizationId = query.organizationId as string | undefined;
  const period = (query.period as string) || 'month';

  const directus = await getUserDirectus(event);

  const filter: any = {};
  if (period !== 'all') {
    const startDate = new Date();
    if (period === 'week') startDate.setDate(startDate.getDate() - 7);
    else startDate.setMonth(startDate.getMonth() - 1);
    filter.date_created = { _gte: startDate.toISOString() };
  }
  if (organizationId) {
    filter.organization = { _eq: organizationId };
  }

  try {
    const logs = await directus.request(
      readItems('ai_usage_logs', {
        filter,
        fields: ['user', 'input_tokens', 'output_tokens', 'total_tokens', 'estimated_cost', 'date_created'],
        limit: -1,
      }),
    ) as any[];

    // Group by user
    const userMap = new Map<string, { totalTokens: number; requests: number; cost: number; lastActive: string }>();
    for (const log of logs) {
      const uid = log.user;
      const existing = userMap.get(uid) || { totalTokens: 0, requests: 0, cost: 0, lastActive: '' };
      existing.totalTokens += log.total_tokens || 0;
      existing.requests += 1;
      existing.cost += log.estimated_cost || 0;
      if (log.date_created > existing.lastActive) existing.lastActive = log.date_created;
      userMap.set(uid, existing);
    }

    // Fetch user details
    const userIds = Array.from(userMap.keys());
    let usersInfo: any[] = [];
    if (userIds.length > 0) {
      usersInfo = await directus.request(
        readItems('directus_users', {
          filter: { id: { _in: userIds } },
          fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
          limit: -1,
        }),
      ) as any[];
    }

    const userLookup = new Map(usersInfo.map(u => [u.id, u]));

    const users = Array.from(userMap.entries())
      .map(([uid, data]) => {
        const info = userLookup.get(uid);
        return {
          id: uid,
          name: info ? `${info.first_name || ''} ${info.last_name || ''}`.trim() || info.email : uid,
          email: info?.email,
          avatar: info?.avatar,
          ...data,
          cost: Math.round(data.cost * 100) / 100,
        };
      })
      .sort((a, b) => b.totalTokens - a.totalTokens);

    return { users };
  } catch (error: any) {
    console.warn('[ai/usage/by-user] Could not fetch (collection may not exist):', error.message);
    return { users: [] };
  }
});

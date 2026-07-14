/**
 * AI Usage by User — Per-user token and request breakdown.
 *
 * Query params:
 *   organizationId: string (required)
 *   period: 'week' | 'month' | 'all' (default: 'month')
 */
import { readItems, readUsers } from '@directus/sdk';
import type { AiUsagePeriod } from '~~/server/utils/ai-date-range';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  const period = (query.period as AiUsagePeriod) || 'month';
  const requestedUserId = (query.userId as string) || null;

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  // Self-scoped members only ever see themselves here; org-wide viewers see
  // everyone (or a single drill-down target).
  let access;
  try {
    access = await resolveAiUsageAccess(event, organizationId, requestedUserId);
  } catch (error: any) {
    if (error?.statusCode && error.statusCode < 500) throw error;
    console.error('[ai/usage/by-user] Access check failed:', error?.message || error);
    return { users: [] };
  }

  const directus = getTypedDirectus();
  const filter = buildAiUsageFilter(organizationId, period);
  if (access.userFilter) filter.user = { _eq: access.userFilter };

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
      const uid = typeof log.user === 'object' && log.user !== null ? log.user.id : log.user;
      const existing = userMap.get(uid);
      if (existing) {
        existing.totalTokens += Number(log.total_tokens) || 0;
        existing.requests += 1;
        existing.cost += Number(log.estimated_cost) || 0;
        if (log.date_created > existing.lastActive) existing.lastActive = log.date_created;
      } else {
        userMap.set(uid, {
          totalTokens: Number(log.total_tokens) || 0,
          requests: 1,
          cost: Number(log.estimated_cost) || 0,
          lastActive: log.date_created || '',
        });
      }
    }

    // Fetch user details
    const userIds = Array.from(userMap.keys());
    let usersInfo: any[] = [];
    if (userIds.length > 0) {
      // `directus_users` is a Directus CORE collection — the SDK rejects
      // `readItems('directus_users', …)` ("Cannot use readItems for core
      // collections"), which silently emptied this whole endpoint. Use the
      // dedicated `readUsers()` command instead.
      usersInfo = await directus.request(
        readUsers({
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
    console.error('[ai/usage/by-user] Failed to fetch usage logs:', error);
    return { users: [] };
  }
});

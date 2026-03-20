/**
 * AI Usage Recent Activity — Latest AI API calls.
 *
 * Query params:
 *   organizationId: string (optional)
 *   limit: number (default: 20)
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
  const limit = Math.min(Number(query.limit) || 20, 100);

  const directus = await getUserDirectus(event);

  const filter: any = {};
  if (organizationId) {
    filter.organization = { _eq: organizationId };
  }

  try {
    const logs = await directus.request(
      readItems('ai_usage_logs', {
        filter,
        fields: ['id', 'user', 'endpoint', 'model', 'total_tokens', 'estimated_cost', 'date_created'],
        sort: ['-date_created'],
        limit,
      }),
    ) as any[];

    // Fetch user details for the logs
    const userIds = [...new Set(logs.map(l => l.user))];
    let usersInfo: any[] = [];
    if (userIds.length > 0) {
      usersInfo = await directus.request(
        readItems('directus_users', {
          filter: { id: { _in: userIds } },
          fields: ['id', 'first_name', 'last_name', 'avatar'],
          limit: -1,
        }),
      ) as any[];
    }

    const userLookup = new Map(usersInfo.map(u => [u.id, u]));

    const endpointLabels: Record<string, string> = {
      'ai/chat': 'AI Chat',
      'marketing/ai-analyze': 'Marketing Intelligence',
      'social/ai-generate': 'Social Media',
      'email/ai-generate': 'Email Generator',
      'crm/ai-intelligence': 'CRM Intelligence',
    };

    const activity = logs.map(log => {
      const user = userLookup.get(log.user);
      return {
        id: log.id,
        userName: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'Unknown',
        userAvatar: user?.avatar,
        endpoint: log.endpoint,
        endpointLabel: endpointLabels[log.endpoint] || log.endpoint,
        model: log.model,
        totalTokens: log.total_tokens,
        cost: Math.round((log.estimated_cost || 0) * 10000) / 10000,
        date: log.date_created,
      };
    });

    return { activity };
  } catch (error: any) {
    console.error('[ai/usage/recent] Error:', error.message);
    throw createError({ statusCode: 500, message: 'Failed to fetch recent activity' });
  }
});

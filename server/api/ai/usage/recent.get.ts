/**
 * AI Usage Recent Activity — Latest AI API calls.
 *
 * Query params:
 *   organizationId: string (required)
 *   limit: number (default: 20, max: 100)
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  const limit = Math.min(Number(query.limit) || 20, 100);

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  await requireOrgPermission(event, organizationId, 'ai_usage', 'read');

  const directus = getTypedDirectus();

  try {
    const logs = await directus.request(
      readItems('ai_usage_logs', {
        filter: { organization: { _eq: organizationId } },
        fields: ['id', 'user', 'endpoint', 'model', 'total_tokens', 'estimated_cost', 'date_created'],
        sort: ['-date_created'],
        limit,
      }),
    ) as any[];

    // Collect unique user IDs and fetch details in one query
    const userIds = [...new Set(logs.map(l => typeof l.user === 'object' && l.user !== null ? l.user.id : l.user).filter(Boolean))];
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
      const uid = typeof log.user === 'object' && log.user !== null ? log.user.id : log.user;
      const user = userLookup.get(uid);
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
    console.warn('[ai/usage/recent] Could not fetch (collection may not exist):', error.message);
    return { activity: [] };
  }
});

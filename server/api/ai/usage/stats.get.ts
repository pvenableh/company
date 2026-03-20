/**
 * AI Usage Stats — Aggregated usage for the org.
 *
 * Query params:
 *   period: 'day' | 'week' | 'month' (default: 'month')
 *   organizationId: string (optional)
 */
import { readItems, aggregate } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const query = getQuery(event);
  const period = (query.period as string) || 'month';
  const organizationId = query.organizationId as string | undefined;

  const directus = await getUserDirectus(event);

  // Calculate date range
  const now = new Date();
  const startDate = new Date();
  if (period === 'day') startDate.setDate(now.getDate() - 1);
  else if (period === 'week') startDate.setDate(now.getDate() - 7);
  else startDate.setMonth(now.getMonth() - 1);

  const filter: any = {
    date_created: { _gte: startDate.toISOString() },
  };
  if (organizationId) {
    filter.organization = { _eq: organizationId };
  }

  try {
    // Get all logs for the period
    const logs = await directus.request(
      readItems('ai_usage_logs', {
        filter,
        fields: ['input_tokens', 'output_tokens', 'total_tokens', 'estimated_cost', 'user', 'date_created'],
        limit: -1,
      }),
    ) as any[];

    const totalRequests = logs.length;
    const totalTokens = logs.reduce((sum, l) => sum + (l.total_tokens || 0), 0);
    const totalCost = logs.reduce((sum, l) => sum + (l.estimated_cost || 0), 0);
    const uniqueUsers = new Set(logs.map(l => l.user)).size;
    const totalInput = logs.reduce((sum, l) => sum + (l.input_tokens || 0), 0);
    const totalOutput = logs.reduce((sum, l) => sum + (l.output_tokens || 0), 0);

    // Daily breakdown for charts
    const dailyMap = new Map<string, { input: number; output: number; requests: number; cost: number }>();
    for (const log of logs) {
      const day = log.date_created?.substring(0, 10) || 'unknown';
      const existing = dailyMap.get(day) || { input: 0, output: 0, requests: 0, cost: 0 };
      existing.input += log.input_tokens || 0;
      existing.output += log.output_tokens || 0;
      existing.requests += 1;
      existing.cost += log.estimated_cost || 0;
      dailyMap.set(day, existing);
    }

    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    return {
      totalRequests,
      totalTokens,
      totalInput,
      totalOutput,
      totalCost: Math.round(totalCost * 100) / 100,
      activeUsers: uniqueUsers,
      period,
      daily,
    };
  } catch (error: any) {
    console.error('[ai/usage/stats] Error:', error.message);
    throw createError({ statusCode: 500, message: 'Failed to fetch usage stats' });
  }
});

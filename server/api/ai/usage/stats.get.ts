/**
 * AI Usage Stats — Aggregated usage for the org.
 *
 * Query params:
 *   period: 'day' | 'week' | 'month' (default: 'month')
 *   organizationId: string (required)
 */
import { readItems } from '@directus/sdk';
import type { AiUsagePeriod } from '~~/server/utils/ai-date-range';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const period = (query.period as AiUsagePeriod) || 'month';
  const organizationId = query.organizationId as string;

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  const empty = {
    totalRequests: 0,
    totalTokens: 0,
    totalInput: 0,
    totalOutput: 0,
    totalCost: 0,
    activeUsers: 0,
    period,
    daily: [],
  };

  try {
    await requireOrgPermission(event, organizationId, 'ai_usage', 'read');
  } catch (error: any) {
    if (error?.statusCode && error.statusCode < 500) throw error;
    console.error('[ai/usage/stats] Permission check failed:', error?.message || error);
    return empty;
  }

  const directus = getTypedDirectus();
  const filter = buildAiUsageFilter(organizationId, period);

  try {
    const logs = await directus.request(
      readItems('ai_usage_logs', {
        filter,
        fields: ['input_tokens', 'output_tokens', 'total_tokens', 'estimated_cost', 'user', 'date_created'],
        limit: -1,
      }),
    ) as any[];

    const totalRequests = logs.length;
    const totalInput = logs.reduce((sum, l) => sum + (Number(l.input_tokens) || 0), 0);
    const totalOutput = logs.reduce((sum, l) => sum + (Number(l.output_tokens) || 0), 0);
    const totalTokens = logs.reduce((sum, l) => sum + (Number(l.total_tokens) || 0), 0);
    const totalCost = logs.reduce((sum, l) => sum + (Number(l.estimated_cost) || 0), 0);
    const uniqueUsers = new Set(logs.map(l => (typeof l.user === 'object' && l.user !== null ? l.user.id : l.user))).size;

    // Daily breakdown for charts
    const dailyMap = new Map<string, { input: number; output: number; requests: number; cost: number }>();
    for (const log of logs) {
      const day = log.date_created?.substring(0, 10) || 'unknown';
      const existing = dailyMap.get(day);
      if (existing) {
        existing.input += Number(log.input_tokens) || 0;
        existing.output += Number(log.output_tokens) || 0;
        existing.requests += 1;
        existing.cost += Number(log.estimated_cost) || 0;
      } else {
        dailyMap.set(day, {
          input: Number(log.input_tokens) || 0,
          output: Number(log.output_tokens) || 0,
          requests: 1,
          cost: Number(log.estimated_cost) || 0,
        });
      }
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
    console.error('[ai/usage/stats] Failed to fetch:', error?.message || error);
    return empty;
  }
});

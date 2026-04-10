/**
 * AI Usage by Endpoint — Per-feature token breakdown.
 *
 * Query params:
 *   organizationId: string (required)
 *   period: 'week' | 'month' | 'all' (default: 'month')
 */
import { readItems } from '@directus/sdk';
import type { AiUsagePeriod } from '~~/server/utils/ai-date-range';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  const period = (query.period as AiUsagePeriod) || 'month';

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  try {
    await requireOrgPermission(event, organizationId, 'ai_usage', 'read');
  } catch (error: any) {
    if (error?.statusCode && error.statusCode < 500) throw error;
    console.error('[ai/usage/by-endpoint] Permission check failed:', error?.message || error);
    return { endpoints: [] };
  }

  const directus = getTypedDirectus();
  const filter = buildAiUsageFilter(organizationId, period);

  try {
    const logs = await directus.request(
      readItems('ai_usage_logs', {
        filter,
        fields: ['endpoint', 'input_tokens', 'output_tokens', 'total_tokens', 'estimated_cost'],
        limit: -1,
      }),
    ) as any[];

    const endpointLabels: Record<string, string> = {
      'ai/chat': 'AI Chat',
      'marketing/ai-analyze': 'Marketing Intelligence',
      'social/ai-generate': 'Social Media',
      'email/ai-generate': 'Email Generator',
      'crm/ai-intelligence': 'CRM Intelligence',
    };

    const endpointMap = new Map<string, { totalTokens: number; inputTokens: number; outputTokens: number; requests: number; cost: number }>();
    for (const log of logs) {
      const ep = log.endpoint;
      const existing = endpointMap.get(ep);
      if (existing) {
        existing.totalTokens += Number(log.total_tokens) || 0;
        existing.inputTokens += Number(log.input_tokens) || 0;
        existing.outputTokens += Number(log.output_tokens) || 0;
        existing.requests += 1;
        existing.cost += Number(log.estimated_cost) || 0;
      } else {
        endpointMap.set(ep, {
          totalTokens: Number(log.total_tokens) || 0,
          inputTokens: Number(log.input_tokens) || 0,
          outputTokens: Number(log.output_tokens) || 0,
          requests: 1,
          cost: Number(log.estimated_cost) || 0,
        });
      }
    }

    const endpoints = Array.from(endpointMap.entries())
      .map(([endpoint, data]) => ({
        endpoint,
        label: endpointLabels[endpoint] || endpoint,
        ...data,
        cost: Math.round(data.cost * 100) / 100,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    return { endpoints };
  } catch (error: any) {
    console.warn('[ai/usage/by-endpoint] Could not fetch (collection may not exist):', error.message);
    return { endpoints: [] };
  }
});

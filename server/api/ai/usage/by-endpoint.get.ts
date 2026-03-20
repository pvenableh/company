/**
 * AI Usage by Endpoint — Per-feature token breakdown.
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
        fields: ['endpoint', 'input_tokens', 'output_tokens', 'total_tokens', 'estimated_cost'],
        limit: -1,
      }),
    ) as any[];

    // Friendly endpoint labels
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
      const existing = endpointMap.get(ep) || { totalTokens: 0, inputTokens: 0, outputTokens: 0, requests: 0, cost: 0 };
      existing.totalTokens += log.total_tokens || 0;
      existing.inputTokens += log.input_tokens || 0;
      existing.outputTokens += log.output_tokens || 0;
      existing.requests += 1;
      existing.cost += log.estimated_cost || 0;
      endpointMap.set(ep, existing);
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

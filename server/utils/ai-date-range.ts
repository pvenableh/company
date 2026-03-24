/**
 * Shared date-range helper for AI usage endpoints.
 * Avoids duplicating the same period → Date logic across stats, by-user,
 * by-endpoint, and recent endpoints.
 */

export type AiUsagePeriod = 'day' | 'week' | 'month' | 'all';

/**
 * Returns an ISO start-date string for the given period, or null for 'all'.
 */
export function getAiUsageStartDate(period: AiUsagePeriod): string | null {
  if (period === 'all') return null;

  const start = new Date();
  if (period === 'day') start.setDate(start.getDate() - 1);
  else if (period === 'week') start.setDate(start.getDate() - 7);
  else start.setMonth(start.getMonth() - 1);

  return start.toISOString();
}

/**
 * Builds the common Directus filter object used by AI usage queries.
 * Always includes the organization filter; optionally adds a date range.
 */
export function buildAiUsageFilter(organizationId: string, period: AiUsagePeriod): Record<string, any> {
  const filter: Record<string, any> = {
    organization: { _eq: organizationId },
  };

  const startDate = getAiUsageStartDate(period);
  if (startDate) {
    filter.date_created = { _gte: startDate };
  }

  return filter;
}

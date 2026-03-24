/**
 * Brand Context Utility — shared helper for fetching brand data.
 *
 * Used by all AI endpoints to inject brand_direction, goals,
 * target_audience, and location into prompts.
 *
 * Pattern: selected client takes priority, org is fallback.
 */
import { readItem } from '@directus/sdk';
import type { H3Event } from 'h3';

const BRAND_FIELDS = ['name', 'brand_direction', 'goals', 'target_audience', 'location'] as const;

interface BrandData {
  name?: string;
  brand_direction?: string;
  goals?: string;
  target_audience?: string;
  location?: string;
}

/**
 * Fetch brand context string for AI prompts.
 * Returns a formatted string ready to append to a user message or system prompt.
 *
 * @param event - H3 event (for getUserDirectus)
 * @param options.clientId - Selected client ID (takes priority)
 * @param options.organizationId - Organization ID (fallback)
 * @returns Formatted brand context string, or empty string if none available
 */
export async function getBrandContext(
  event: H3Event,
  options: { clientId?: string; organizationId?: string },
): Promise<string> {
  const { clientId, organizationId } = options;
  if (!clientId && !organizationId) return '';

  try {
    const directus = await getUserDirectus(event);

    // Try client first
    if (clientId) {
      const client = await directus.request(
        readItem('clients', clientId, { fields: [...BRAND_FIELDS] }),
      ).catch(() => null) as BrandData | null;

      const text = formatBrandData(client, 'Client');
      if (text) return text;
    }

    // Fall back to organization
    if (organizationId) {
      const org = await directus.request(
        readItem('organizations', organizationId, { fields: [...BRAND_FIELDS] }),
      ).catch(() => null) as BrandData | null;

      return formatBrandData(org, 'Organization');
    }
  } catch {
    // Brand context is non-critical — never block the main flow
  }

  return '';
}

function formatBrandData(data: BrandData | null, label: string): string {
  if (!data) return '';
  if (!data.brand_direction && !data.goals && !data.target_audience) return '';

  const parts: string[] = [`\n\nBRAND CONTEXT (${label}: ${data.name || 'Unknown'}):`];
  if (data.brand_direction) parts.push(`Brand Direction: ${data.brand_direction}`);
  if (data.goals) parts.push(`Goals: ${data.goals}`);
  if (data.target_audience) parts.push(`Target Audience: ${data.target_audience}`);
  if (data.location) parts.push(`Location: ${data.location}`);
  return parts.join('\n');
}

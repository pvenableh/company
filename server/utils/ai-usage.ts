/**
 * AI Usage Logging Utility
 *
 * Logs AI API usage (tokens, cost, endpoint) to the ai_usage_logs collection.
 * Fire-and-forget — does not block the response.
 */
import { createItem } from '@directus/sdk';
import type { H3Event } from 'h3';

// Pricing per 1M tokens (USD). Current models first; legacy ids kept so
// historical usage rows still cost out. Prefix-match in estimateCost() catches
// dated variants (e.g. claude-sonnet-5-YYYYMMDD).
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Current
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-4-8': { input: 15, output: 75 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  // Legacy (historical rows)
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-20250414': { input: 0.8, output: 4 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
};

const FALLBACK_PRICING = { input: 3, output: 15 }; // sonnet-tier default

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing =
    MODEL_PRICING[model]
    // Tolerate dated/suffixed ids by matching the longest known prefix.
    || Object.entries(MODEL_PRICING).find(([id]) => model.startsWith(id))?.[1]
    || FALLBACK_PRICING;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export interface AIUsageParams {
  event: H3Event;
  endpoint: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  sessionId?: string;
  organizationId?: string;
  metadata?: Record<string, any>;
}

export async function logAIUsage(params: AIUsageParams): Promise<void> {
  try {
    const session = await requireUserSession(params.event);
    const userId = (session as any).user?.id;
    if (!userId) return;

    // The shared demo logins run on a restricted Directus role that can't write
    // ai_usage_logs, so a mocked demo call would silently fail to log and the AI
    // & Tokens dashboard would never grow for visitors. For those requests, log
    // via the admin token instead (the row is still attributed to the user via
    // the `user` field). Real users keep using their own token unchanged.
    const directus = isDemoMockEvent(params.event)
      ? getTypedDirectus()
      : await getUserDirectus(params.event);
    const totalTokens = params.inputTokens + params.outputTokens;
    const cost = estimateCost(params.model, params.inputTokens, params.outputTokens);

    // Fire-and-forget — don't await in the caller
    await directus.request(
      createItem('ai_usage_logs', {
        user: userId,
        organization: params.organizationId || null,
        endpoint: params.endpoint,
        model: params.model,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        total_tokens: totalTokens,
        estimated_cost: Math.round(cost * 1_000_000) / 1_000_000, // 6 decimal precision
        session_id: params.sessionId || null,
        metadata: params.metadata || null,
      }),
    );
  } catch (err) {
    // Usage logging should never break the main flow
    console.error('[ai-usage] Failed to log usage:', (err as Error).message);
  }
}

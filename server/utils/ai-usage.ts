/**
 * AI Usage Logging Utility
 *
 * Logs AI API usage (tokens, cost, endpoint) to the ai_usage_logs collection.
 * Fire-and-forget — does not block the response.
 */
import { createItem } from '@directus/sdk';
import type { H3Event } from 'h3';

// Pricing per 1M tokens (USD) — Claude models as of 2025
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-20250414': { input: 0.8, output: 4 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-20250514'];
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

    const directus = await getUserDirectus(params.event);
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

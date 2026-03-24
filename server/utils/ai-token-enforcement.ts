/**
 * AI Token Enforcement — server-side guard for AI endpoints.
 *
 * Checks org-level token limits, per-member budgets, and member AI-enabled status
 * before allowing an AI API call to proceed.
 */
import { readItems, readItem, updateItem } from '@directus/sdk';
import type { H3Event } from 'h3';

export interface TokenEnforcementResult {
  allowed: boolean;
  reason?: string;
  orgTokensRemaining?: number | null;
  memberBudgetRemaining?: number | null;
}

/**
 * Check whether the current user/org can make an AI call.
 * Throws a 429 error if token budget is exhausted.
 */
export async function enforceTokenLimits(event: H3Event, organizationId?: string): Promise<TokenEnforcementResult> {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const directus = getTypedDirectus();

  // 1. Check if member has AI access enabled (via ai_preferences)
  try {
    const prefs = await directus.request(
      readItems('ai_preferences', {
        filter: {
          _and: [
            { user: { _eq: userId } },
            ...(organizationId ? [{ organization: { _eq: organizationId } }] : []),
          ],
        },
        fields: ['ai_enabled', 'token_budget_monthly', 'low_usage_mode'],
        limit: 1,
      }),
    ) as any[];

    const pref = prefs?.[0];

    // If ai_enabled is explicitly false, block the request
    if (pref && pref.ai_enabled === false) {
      return {
        allowed: false,
        reason: 'AI access has been disabled for your account. Contact your organization admin.',
      };
    }

    // Check per-member monthly budget
    if (pref?.token_budget_monthly != null) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const usageLogs = await directus.request(
        readItems('ai_usage_logs', {
          filter: {
            _and: [
              { user: { _eq: userId } },
              { date_created: { _gte: monthStart.toISOString() } },
              ...(organizationId ? [{ organization: { _eq: organizationId } }] : []),
            ],
          },
          fields: ['total_tokens'],
          limit: -1,
        }),
      ) as any[];

      const used = (usageLogs || []).reduce((sum: number, log: any) => sum + (Number(log.total_tokens) || 0), 0);
      const remaining = pref.token_budget_monthly - used;

      if (remaining <= 0) {
        return {
          allowed: false,
          reason: 'Your personal AI token budget has been exhausted for this month.',
          memberBudgetRemaining: 0,
        };
      }
    }
  } catch {
    // ai_preferences may not have ai_enabled field yet — allow through
  }

  // 2. Check org-level limits
  if (organizationId) {
    try {
      const org = await directus.request(
        readItem('organizations', organizationId, {
          fields: ['ai_token_balance', 'ai_token_limit_monthly', 'ai_tokens_used_this_period'],
        }),
      ) as any;

      // Check hard balance (prepaid tokens)
      if (org.ai_token_balance != null && org.ai_token_balance <= 0) {
        return {
          allowed: false,
          reason: 'Organization AI token balance is depleted. An admin can purchase more tokens.',
          orgTokensRemaining: 0,
        };
      }

      // Check monthly limit
      if (org.ai_token_limit_monthly != null) {
        const used = Number(org.ai_tokens_used_this_period) || 0;
        const remaining = org.ai_token_limit_monthly - used;
        if (remaining <= 0) {
          return {
            allowed: false,
            reason: 'Organization monthly AI token limit has been reached. An admin can purchase more tokens or wait until the next billing period.',
            orgTokensRemaining: 0,
          };
        }
      }
    } catch {
      // Org may not have token fields — allow through
    }
  }

  return { allowed: true };
}

/**
 * Deduct tokens from org balance after a successful AI call.
 * Fire-and-forget — does not block the response.
 */
export async function deductOrgTokens(organizationId: string, tokensUsed: number): Promise<void> {
  try {
    const directus = getTypedDirectus();

    const org = await directus.request(
      readItem('organizations', organizationId, {
        fields: ['ai_token_balance', 'ai_tokens_used_this_period'],
      }),
    ) as any;

    const updates: Record<string, any> = {
      ai_tokens_used_this_period: (Number(org.ai_tokens_used_this_period) || 0) + tokensUsed,
    };

    // Deduct from balance if it's tracked
    if (org.ai_token_balance != null) {
      updates.ai_token_balance = Math.max(0, (Number(org.ai_token_balance) || 0) - tokensUsed);
    }

    await directus.request(updateItem('organizations', organizationId, updates));
  } catch (err) {
    console.error('[ai-token-enforcement] Failed to deduct tokens:', (err as Error).message);
  }
}

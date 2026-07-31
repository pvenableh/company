/**
 * AI Token Enforcement — server-side guard for AI endpoints.
 *
 * Checks org-level token limits, per-member budgets, and member AI-enabled status
 * before allowing an AI API call to proceed.
 *
 * Also provides scan credit enforcement for CardDesk endpoints.
 */
import { readItems, readItem, updateItem } from '@directus/sdk';
import type { H3Event } from 'h3';

/**
 * Org subscription statuses that LOCK the app (no AI spend, redirect to the
 * upgrade screen). Shared with the client gate app/middleware/subscription.global.ts.
 *   - incomplete          → signed up, never picked a plan / started a trial
 *   - paused              → 14-day trial ended with no card (missing_payment_method:'pause')
 *   - canceled / unpaid / incomplete_expired → subscription lapsed
 * 'active' and 'trialing' are allowed; a null status (legacy orgs) is not gated.
 */
export const LOCKED_SUBSCRIPTION_STATUSES = new Set([
  'incomplete',
  'incomplete_expired',
  'paused',
  'unpaid',
  'canceled',
]);

export interface TokenEnforcementResult {
  allowed: boolean;
  reason?: string;
  /** HTTP status to return: 402 (payment required) or 429 (rate limited) */
  statusCode?: number;
  orgTokensRemaining?: number | null;
  memberBudgetRemaining?: number | null;
}

export interface ScanEnforcementResult {
  allowed: boolean;
  reason?: string;
  statusCode?: number;
  scansRemaining?: number | null;
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
    // ai_preferences rows are keyed by `user` only — `organization` is left
    // null by every writer (member-budget, member-toggle, ai/preferences), and
    // members.get.ts already reads them user-scoped. Filtering by organization
    // here (as this used to) matched nothing, so per-member budgets and the AI
    // disable toggle were silent no-ops. Match by user only.
    const prefs = await directus.request(
      readItems('ai_preferences', {
        filter: { user: { _eq: userId } },
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
          fields: ['plan', 'subscription_status', 'ai_token_balance', 'ai_token_limit_monthly', 'ai_tokens_used_this_period'],
        }),
      ) as any;

      // Trial-expiry / paused-subscription lock (defense in depth — the client
      // gate in app/middleware/subscription.global.ts also redirects). An org
      // whose subscription has lapsed must not spend AI tokens even if it still
      // carries a plan-level limit. `enterprise` is internal/unlimited and never
      // gated; a null status (legacy orgs) is left to the token math below.
      if (org.plan !== 'enterprise' && LOCKED_SUBSCRIPTION_STATUSES.has(org.subscription_status)) {
        return {
          allowed: false,
          statusCode: 402,
          reason: org.subscription_status === 'incomplete'
            ? 'Pick a plan to start your free trial and use Earnest AI.'
            : 'Your trial has ended — add a card to keep using Earnest.',
        };
      }

      // Check hard balance (prepaid tokens)
      if (org.ai_token_balance != null && org.ai_token_balance <= 0) {
        return {
          allowed: false,
          statusCode: 402,
          reason: 'Your AI token balance is depleted. Purchase more tokens to continue.',
          orgTokensRemaining: 0,
        };
      }

      // Check monthly limit
      if (org.ai_token_limit_monthly != null) {
        const used = Number(org.ai_tokens_used_this_period) || 0;
        const remaining = org.ai_token_limit_monthly - used;
        if (remaining <= 0) {
          // A no-card trial hit its bounded grant — the fix is to add a card
          // (which unlocks the full plan allotment), not to buy a token pack.
          const onTrial = org.subscription_status === 'trialing';
          return {
            allowed: false,
            statusCode: 402,
            reason: onTrial
              ? "You've used the AI included in your free trial. Add a card to unlock your plan's full monthly allotment."
              : 'Your monthly AI token limit has been reached. Purchase more tokens or wait until the next billing period.',
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

/**
 * Check whether the org has scan credits before a CardDesk scan.
 * scan_credits_limit_monthly of -1 = unlimited (agency plan sentinel).
 */
export async function enforceScanLimits(organizationId: string): Promise<ScanEnforcementResult> {
  try {
    const directus = getTypedDirectus();

    const org = await directus.request(
      readItem('organizations', organizationId, {
        fields: ['scan_credits_balance', 'scan_credits_limit_monthly', 'scans_used_this_period'],
      }),
    ) as any;

    // No limit set or unlimited sentinel = allow
    if (org.scan_credits_limit_monthly == null || org.scan_credits_limit_monthly === -1) {
      return { allowed: true, scansRemaining: null };
    }

    const balance = org.scan_credits_balance ?? 0;

    if (balance <= 0) {
      return {
        allowed: false,
        statusCode: 402,
        reason: 'Your scan credit balance is depleted. Purchase more scans to continue.',
        scansRemaining: 0,
      };
    }

    return { allowed: true, scansRemaining: balance };
  } catch {
    // If we can't check, allow through rather than blocking
    return { allowed: true };
  }
}

/**
 * Deduct one scan credit from org balance after a successful scan.
 * Fire-and-forget — does not block the response.
 */
export async function deductScanCredit(organizationId: string): Promise<void> {
  try {
    const directus = getTypedDirectus();

    const org = await directus.request(
      readItem('organizations', organizationId, {
        fields: ['scan_credits_balance', 'scans_used_this_period'],
      }),
    ) as any;

    const updates: Record<string, any> = {
      scans_used_this_period: (Number(org.scans_used_this_period) || 0) + 1,
    };

    if (org.scan_credits_balance != null) {
      updates.scan_credits_balance = Math.max(0, (Number(org.scan_credits_balance) || 0) - 1);
    }

    await directus.request(updateItem('organizations', organizationId, updates));
  } catch (err) {
    console.error('[ai-token-enforcement] Failed to deduct scan credit:', (err as Error).message);
  }
}

# Task 3 — Server-Side Token Enforcement

## Context
Currently `useAIUsage.ts` tracks usage in localStorage only — it's client-side and has no
enforcement power. `useAITokens.ts` reads org token fields correctly but is also client-side.

The actual AI calls in `server/utils/llm/factory.ts` and `server/utils/llm/claude.ts` do NOT
check budgets before firing. This means users can exceed their token limits freely.

This task adds server-side enforcement. Every AI call must:
1. Check remaining tokens before calling the LLM
2. Deduct actual tokens used after the call completes
3. Write a record to `ai_usage_logs`
4. Update `organizations.ai_tokens_used_this_period` and `ai_token_balance`

## Step 0 — Create Directus collections via MCP

Before writing any code, use the Directus MCP connection to create the two required collections
and regenerate the TypeScript types. Do this first so the types are available when writing code.

### Create earnest_token_pools collection

POST to Directus `/collections` with:
```json
{
  "collection": "earnest_token_pools",
  "meta": { "icon": "toll", "note": "AI token pool per organization" },
  "schema": {},
  "fields": [
    { "field": "id", "type": "uuid", "meta": { "hidden": true }, "schema": { "is_primary_key": true, "has_auto_increment": false } },
    { "field": "account_id", "type": "string", "meta": { "required": true }, "schema": { "is_nullable": false } },
    { "field": "pool_type", "type": "string", "meta": { "required": true, "options": { "choices": [{"text":"Agency","value":"agency"},{"text":"Client","value":"client"}] } }, "schema": { "is_nullable": false } },
    { "field": "tokens_monthly", "type": "integer", "schema": { "is_nullable": true } },
    { "field": "tokens_banked", "type": "integer", "schema": { "default_value": 0 } },
    { "field": "tokens_used_this_month", "type": "integer", "schema": { "default_value": 0 } },
    { "field": "last_reset_at", "type": "timestamp", "schema": { "is_nullable": true } },
    { "field": "stripe_subscription_id", "type": "string", "schema": { "is_nullable": true } },
    { "field": "plan_tier", "type": "string", "schema": { "is_nullable": true } },
    { "field": "date_created", "type": "timestamp", "meta": { "hidden": true, "special": ["date-created"] } }
  ]
}
```

### Create earnest_scan_credits collection

POST to Directus `/collections` with:
```json
{
  "collection": "earnest_scan_credits",
  "meta": { "icon": "credit_card", "note": "CardDesk scan credit pool per organization" },
  "schema": {},
  "fields": [
    { "field": "id", "type": "uuid", "meta": { "hidden": true }, "schema": { "is_primary_key": true, "has_auto_increment": false } },
    { "field": "account_id", "type": "string", "meta": { "required": true }, "schema": { "is_nullable": false } },
    { "field": "scans_monthly", "type": "integer", "schema": { "is_nullable": true } },
    { "field": "scans_banked", "type": "integer", "schema": { "default_value": 0 } },
    { "field": "scans_used_this_month", "type": "integer", "schema": { "default_value": 0 } },
    { "field": "last_reset_at", "type": "timestamp", "schema": { "is_nullable": true } },
    { "field": "date_created", "type": "timestamp", "meta": { "hidden": true, "special": ["date-created"] } }
  ]
}
```

### Set permissions for both collections

Give the admin policy full CRUD on both new collections. Authenticated users should be able
to read their own org's records (filtered by account_id matching their org).

### Regenerate TypeScript types

After creating the collections, run:
```bash
pnpm generate:types
```

This updates `types/directus.ts` so the new collection types are available for the code below.

---

## Step 1 — Create server/utils/tokenEnforcer.ts

Read `server/utils/llm/claude.ts` and `server/utils/llm/factory.ts` first to understand the
existing LLM call pattern.

Create a new file `server/utils/tokenEnforcer.ts`:

```typescript
// Token budget enforcement for server-side AI calls.
// Called by the LLM provider wrappers before and after each AI call.

import { readItem, updateItem, createItem } from '@directus/sdk'
import type { H3Event } from 'h3'

export interface TokenCheckResult {
  allowed: boolean
  remaining: number | null
  reason?: string
}

export interface TokenDeductParams {
  orgId: string
  userId: string
  endpoint: string
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCostUsd?: number
  sessionId?: string
  metadata?: Record<string, any>
}

/**
 * Check if an org has sufficient tokens before making an AI call.
 * Returns { allowed: true } if the org has no limit set (null = unlimited).
 */
export async function checkOrgTokenBudget(orgId: string): Promise<TokenCheckResult> {
  const directus = getAdminDirectus() // server-side admin client
  
  const org = await directus.request(
    readItem('organizations', orgId, {
      fields: ['ai_token_balance', 'ai_token_limit_monthly', 'ai_tokens_used_this_period'],
    })
  ) as any

  // No limit set = unlimited (legacy or admin orgs)
  if (org.ai_token_limit_monthly === null) {
    return { allowed: true, remaining: null }
  }

  const balance = org.ai_token_balance ?? 0

  if (balance <= 0) {
    return {
      allowed: false,
      remaining: 0,
      reason: 'Organization AI token balance is depleted. Purchase more tokens to continue.',
    }
  }

  return { allowed: true, remaining: balance }
}

/**
 * Deduct tokens after a successful AI call.
 * Updates org balance and writes to ai_usage_logs.
 */
export async function deductOrgTokens(params: TokenDeductParams): Promise<void> {
  const directus = getAdminDirectus()
  const totalTokens = params.inputTokens + params.outputTokens
  const estimatedCost = params.estimatedCostUsd
    ?? ((params.inputTokens * 0.000003) + (params.outputTokens * 0.000015)) // Claude Sonnet rates

  try {
    // Write usage log
    await directus.request(
      createItem('ai_usage_logs', {
        user: params.userId,
        organization: params.orgId,
        endpoint: params.endpoint,
        model: params.model,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        total_tokens: totalTokens,
        estimated_cost: estimatedCost,
        session_id: params.sessionId ?? null,
        metadata: params.metadata ?? null,
      })
    )

    // Deduct from org balance and increment used counter
    const org = await directus.request(
      readItem('organizations', params.orgId, {
        fields: ['ai_token_balance', 'ai_tokens_used_this_period'],
      })
    ) as any

    const newBalance = Math.max(0, (org.ai_token_balance ?? 0) - totalTokens)
    const newUsed = (org.ai_tokens_used_this_period ?? 0) + totalTokens

    await directus.request(
      updateItem('organizations', params.orgId, {
        ai_token_balance: newBalance,
        ai_tokens_used_this_period: newUsed,
      })
    )
  } catch (err) {
    // Log but don't throw — a failed deduction log should not break the user's workflow
    console.error('[tokenEnforcer] Failed to deduct tokens:', err)
  }
}
```

## Step 2 — Wrap the LLM factory

Read `server/utils/llm/factory.ts` and `server/utils/llm/claude.ts` fully before editing.

The goal is to wrap `getLLMProvider()` so callers can optionally pass org context and get
automatic budget checking + deduction. Follow the existing factory pattern exactly.

Add an optional second parameter to `getLLMProvider()`:

```typescript
export interface LLMCallContext {
  orgId: string
  userId: string
  endpoint: string
  sessionId?: string
}

// Extend the existing LLMProvider interface in types.ts with an optional context
// OR create a wrapper function — match whichever pattern is already in the file
```

The key constraint: **do not break any existing callers.** The `orgId`/`userId` context is
optional. Calls without context still work exactly as before (no enforcement).

## Step 3 — Add enforcement to the highest-traffic endpoints

Don't wrap every endpoint at once. Start with the three that consume the most tokens:
1. `server/api/command-center/` (or wherever the main AI chat/suggestions endpoint lives)
2. `server/api/crm/ai-intelligence.post.ts`
3. `server/api/marketing/` (AI marketing analysis)

Read each file before editing. The pattern for each is:

```typescript
// At the top of the handler, after getting user/org:
const { allowed, reason } = await checkOrgTokenBudget(orgId)
if (!allowed) {
  throw createError({ statusCode: 402, message: reason })
}

// After the AI call returns:
await deductOrgTokens({
  orgId,
  userId: user.id,
  endpoint: 'command-center/chat', // match the route
  model: provider.currentModel, // however the model is accessed
  inputTokens: response.usage?.input_tokens ?? 0,
  outputTokens: response.usage?.output_tokens ?? 0,
})
```

## Step 4 — Return 402 to the client gracefully

When the server returns a 402, the client-side code should show a token top-up prompt, not
a generic error. Find where AI errors are caught in the CommandCenter components and add a
check for `error.statusCode === 402`. Show the existing upgrade/top-up UI path.

## Do NOT do in this task
- Do not modify `useAIUsage.ts` (localStorage tracking is fine as a secondary client-side display)
- Do not modify `useAITokens.ts`
- Do not add enforcement to CardDesk scan calls yet (that's a separate task)

## After making changes
Run `pnpm typecheck`. Test by temporarily setting `ai_token_balance: 0` on a test org and
confirming the 402 is returned and displayed correctly.

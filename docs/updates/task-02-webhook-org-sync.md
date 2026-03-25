# Task 2 — Wire Subscription Webhook to Organizations

## Context
`server/api/stripe/paymentchange.ts` currently handles subscription events by updating fields on
`directus_users` (stripe_subscription_id, subscription_status). It does NOT update the
`organizations` collection with the new plan, token limits, or billing period.

The `organizations` collection has these fields that need to be kept in sync:
- `plan` — 'free' | 'starter' | 'pro' | 'enterprise' (we need to map our plan IDs to these,
  OR add our own plan values — see note below)
- `ai_token_limit_monthly` — set from EARNEST_PLANS[planId].aiTokens.monthlyAllotment
- `ai_token_balance` — reset to full allotment on renewal
- `ai_tokens_used_this_period` — reset to 0 on renewal
- `ai_billing_period_start` — set to now on renewal

## Note on the plan field
The `organizations.plan` field currently has values: 'free' | 'starter' | 'pro' | 'enterprise'.
Our new plan IDs are 'solo' | 'studio' | 'agency'. You have two options:
1. Map: solo→starter, studio→pro, agency→enterprise
2. Add new values to the plan field via Directus

**Use option 1 (mapping) for now** to avoid a schema migration. Add a helper function:
```typescript
function earnestPlanToOrgPlan(planId: EarnestPlanId): string {
  const map = { solo: 'starter', studio: 'pro', agency: 'enterprise' }
  return map[planId] ?? 'free'
}
```

## What to do

Read `server/api/stripe/paymentchange.ts` in full first.

### 1. Find the org for a user

The webhook receives a Stripe customer ID. The existing code already looks up the user by
`stripe_customer_id`. Extend this to also find the user's active organization membership.

After finding `userId`, look up their primary organization:
```typescript
// IMPORTANT: Use getTypedDirectus() here, not the user-scoped directus client.
// The relational filter on role.slug requires reading the org_roles collection,
// which the user-scoped client may not have permission to do in a webhook context.
const adminDirectus = getTypedDirectus()

const memberships = await adminDirectus.request(
  readItems('org_memberships', {
    filter: {
      user: { _eq: userId },
      status: { _eq: 'active' },
      role: { slug: { _in: ['owner', 'admin'] } }
    },
    fields: ['organization'],
    limit: 1,
  })
)
const orgId = memberships[0]?.organization
```

### 2. Update handleSubscriptionChange()

When a subscription is created or updated, after updating the user record, also update the org:

```typescript
if (orgId) {
  const planId = planFromPriceId(subscription.items.data[0]?.price?.id || '')
  const plan = EARNEST_PLANS[planId]

  await adminDirectus.request(
    updateItem('organizations', orgId, {
      plan: earnestPlanToOrgPlan(planId),
      ai_token_limit_monthly: plan?.aiTokens.monthlyAllotment ?? null,
      // Don't reset balance on update — only on invoice.payment_succeeded
    })
  )
}
```

When deleted, reset the org to free:
```typescript
await adminDirectus.request(
  updateItem('organizations', orgId, {
    plan: 'free',
    ai_token_limit_monthly: 0,
    ai_token_balance: 0,
  })
)
```

### 3. Update handleSubscriptionInvoicePaid()

This is where the monthly reset happens. Currently this function exists but needs real
implementation. Implement it:

```typescript
async function handleSubscriptionInvoicePaid(invoice: Stripe.Invoice) {
  // Find customer → user → org (same pattern as above)
  const adminDirectus = getTypedDirectus()
  // Then reset the org's token counters for the new billing period:
  await adminDirectus.request(
    updateItem('organizations', orgId, {
      ai_tokens_used_this_period: 0,
      ai_billing_period_start: new Date().toISOString(),
      // Restore monthly allotment to balance
      ai_token_balance: plan.aiTokens.monthlyAllotment,
    })
  )
}
```

### 4. Update handleCheckoutCompleted()

After linking the subscription to the user, also set the initial token allocation on the org.
Reuse the same org-lookup and plan-update logic.

## Imports needed
```typescript
import { EARNEST_PLANS, planFromPriceId } from '~/server/utils/stripe'
// getTypedDirectus is auto-imported by Nuxt from server/utils/directus.ts
// updateItem, readItems are already imported from @directus/sdk
```

## Do NOT change
- The payment intent handlers (handlePaymentIntentSucceeded/Failed) — these handle invoice
  payments to clients, not subscriptions, and should not be touched
- The webhook signature verification block
- The overall event routing structure

## After making changes
- Run `pnpm typecheck`
- Test with Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/paymentchange`
- Trigger: `stripe trigger customer.subscription.updated`

# Task 1 — Update Pricing in stripe.ts

## Context
`server/utils/stripe.ts` contains `EARNEST_PLANS` and `TOKEN_PACKAGES`. The prices need to be
updated to reflect the new business model. This is the ONLY file that needs to change for pricing.
All other code reads from this file.

## What to do

Read `server/utils/stripe.ts` in full first, then update `EARNEST_PLANS` as follows:

### New plan definitions

```
solo:
  name: 'Solo'
  monthlyAmount: 4900  (was 2900)
  seats: 1
  aiTokens.monthlyAllotment: 100_000  (was 500_000)
  aiTokens.maxPerMember: 100_000
  scanCredits: 25

studio:
  name: 'Studio'  (was 'team' — $89/mo, the old mid-tier key)
  monthlyAmount: 14900  (was 8900)
  seats: 8
  aiTokens.monthlyAllotment: 400_000  (was 5_000_000)
  aiTokens.maxPerMember: 50_000
  scanCredits: 150

agency:
  name: 'Agency'  (was 'studio' — $189/mo, the old top-tier key)
  monthlyAmount: 29900  (was 18900)
  seats: 15
  aiTokens.monthlyAllotment: 1_000_000  (was 25_000_000)
  aiTokens.maxPerMember: 100_000
  scanCredits: -1  (unlimited — use -1 as sentinel)
```

Also add annual price IDs alongside the monthly ones. Add these env var references:
```
STRIPE_PRICE_SOLO_ANNUAL
STRIPE_PRICE_STUDIO_ANNUAL
STRIPE_PRICE_AGENCY_ANNUAL
```

### Update TOKEN_PACKAGES

```
tokens_100k:  100_000 tokens, $900   (new — $9.00)
tokens_500k:  500_000 tokens, $3900  (was $4.99 → now $39.00)
tokens_1_5m: 1_500_000 tokens, $9900 (new — $99.00, replaces 10M package)
```

Also add scan credit packages:
```
scans_100: 100 scans, $1200  ($12.00)
scans_500: 500 scans, $4900  ($49.00)
```

Add env var references: `STRIPE_PRICE_SCANS_100`, `STRIPE_PRICE_SCANS_500`

### Update EarnestPlanId type

The union type needs to reflect renamed plan: 'team' → 'agency'
```typescript
export type EarnestPlanId = 'solo' | 'studio' | 'agency'
```

### Update planFromPriceId()

This function maps Stripe price IDs back to plan IDs. Make sure it handles both monthly and
annual price IDs for each plan.

## Do NOT change
- The `useStripe()` factory function
- The `apiVersion` string
- Any import statements that other files depend on

## After making changes
Run `pnpm typecheck` to confirm no TypeScript errors.
Check that `planFromPriceId()` is referenced in `server/api/stripe/paymentchange.ts` and that
the return type still matches what that file expects.

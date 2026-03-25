# Task 1 — Update Pricing in stripe.ts

## Context
`server/utils/stripe.ts` contains `EARNEST_PLANS` and `TOKEN_PACKAGES`. The prices need to be
updated to reflect the new business model (see `earnest-business-model-v3.docx`). This is the
ONLY file that needs to change for pricing. All other code reads from this file.

### Current state of the file (verified)
- Plan keys: `solo` ($29/mo, 500K tokens), `team` ($89/mo, 5M tokens), `studio` ($189/mo, 25M tokens)
- TOKEN_PACKAGES: 500K ($4.99), 2M ($14.99), 10M ($49.99)
- `EarnestPlanId` = `keyof typeof EARNEST_PLANS` (currently `'solo' | 'team' | 'studio'`)
- `planFromPriceId()` only checks monthly price IDs
- No scan credit concept exists yet

## What to do

Read `server/utils/stripe.ts` in full first, then update `EARNEST_PLANS` as follows:

### New plan definitions

The business model mandates: **all plans get all features.** Differentiation is seats, tokens,
and scans only. White-label is the one exception (agency only).

```
solo:
  name: 'Solo'
  monthlyAmount: 4900  (was 2900)
  annualAmount: 40800  ($408/yr — 2 months free, stated plainly)
  seats: 1
  clientPortalSeats: 1
  aiTokens.monthlyAllotment: 100_000  (was 500_000)
  aiTokens.maxPerMember: 100_000
  scanCredits: 25

studio:  (replaces old 'team' key — $89/mo)
  name: 'Studio'
  monthlyAmount: 14900  (was 8900)
  annualAmount: 124100  ($1,241/yr — 2 months free)
  seats: 8
  clientPortalSeats: 5
  aiTokens.monthlyAllotment: 400_000  (was 5_000_000)
  aiTokens.maxPerMember: 50_000
  scanCredits: 150

agency:  (replaces old 'studio' key — $189/mo)
  name: 'Agency'
  monthlyAmount: 29900  (was 18900)
  annualAmount: 249100  ($2,491/yr — 2 months free)
  seats: 15
  clientPortalSeats: 20
  aiTokens.monthlyAllotment: 1_000_000  (was 25_000_000)
  aiTokens.maxPerMember: 100_000
  scanCredits: -1  (unlimited — use -1 as sentinel)
  whiteLabel: true
```

Add both monthly and annual Stripe price ID references per plan:
```
STRIPE_PRICE_SOLO / STRIPE_PRICE_SOLO_ANNUAL
STRIPE_PRICE_STUDIO / STRIPE_PRICE_STUDIO_ANNUAL
STRIPE_PRICE_AGENCY / STRIPE_PRICE_AGENCY_ANNUAL
```

### Update TOKEN_PACKAGES

```
tokens_100k:  100_000 tokens, $900   (new — $9.00)
tokens_500k:  500_000 tokens, $3900  (was $4.99 → now $39.00)
tokens_1_5m: 1_500_000 tokens, $9900 (new — $99.00, replaces 10M package)
```

### Add SCAN_PACKAGES (new export)

```
scans_100: 100 scans, $1200  ($12.00)
scans_500: 500 scans, $4900  ($49.00)
```

Add env var references: `STRIPE_PRICE_SCANS_100`, `STRIPE_PRICE_SCANS_500`

### Update EarnestPlanId type

The `'team'` key is removed, `'agency'` is added:
```typescript
export type EarnestPlanId = 'solo' | 'studio' | 'agency'
```

### Update planFromPriceId()

This function maps Stripe price IDs back to plan IDs. Make sure it handles both monthly and
annual price IDs for each plan.

### Project-wide rename: 'team' → 'studio', old 'studio' → 'agency'

After changing the keys in this file, search the entire project for references to the old plan
keys. Files that import `EARNEST_PLANS['team']` or `EARNEST_PLANS['studio']` (old meaning) will
need updating. Run `grep -r "EARNEST_PLANS\[" --include='*.ts' --include='*.vue'` to find them.

## Do NOT change
- The `useStripe()` factory function
- The `apiVersion` string
- Any import statements that other files depend on

## After making changes
Run `pnpm typecheck` to confirm no TypeScript errors.
Check that `planFromPriceId()` is referenced in `server/api/stripe/paymentchange.ts` and that
the return type still matches what that file expects.

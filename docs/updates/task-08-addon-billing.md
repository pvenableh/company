# Task 8 — Add-On Billing, Client Portal Token Pools, and Seat Packs

## Context
The business model (earnest-business-model-v3.docx, Section 09) defines several add-ons that
are billed separately from the base subscription. These are currently not implemented anywhere
in the codebase.

This task depends on:
- Task 1 (pricing definitions in stripe.ts)
- Task 2 (webhook org sync)
- Task 3 (token enforcement infrastructure)

### Add-ons from the business model

| Add-On | Billing | Price |
|--------|---------|-------|
| Extra User Seats (5-pack) | Monthly | $15/mo |
| Communications — Twilio phone, video, SMS, live chat | Monthly | $49/mo |
| Client Pack Starter — 5 seats + 50K client tokens | Monthly | $29/mo |
| Client Pack Pro — 10 seats + 150K client tokens | Monthly | $59/mo |
| Client Pack Unlimited — unlimited seats + 500K client tokens | Monthly | $129/mo |
| Companion White-Label (custom subdomain + icon) | Monthly | $19/mo |
| Token Refill — 100K | One-time | $9 |
| Token Refill — 500K | One-time | $39 |
| Token Refill — 1.5M | One-time | $99 |
| Scan Credits — 100 | One-time | $12 |
| Scan Credits — 500 | One-time | $49 |

Token refills and scan credit packs are already defined in Task 1's TOKEN_PACKAGES and
SCAN_PACKAGES. This task covers the recurring monthly add-ons.

### Important: admin Directus client
The server-side admin client is `getTypedDirectus()` from `server/utils/directus.ts`.
It is auto-imported by Nuxt.

---

## Step 1 — Add add-on definitions to stripe.ts

Read `server/utils/stripe.ts` first (after Task 1 changes are applied).

Add a new `EARNEST_ADDONS` export:

```typescript
export const EARNEST_ADDONS = {
  extra_seats_5: {
    name: 'Extra Seats (5-pack)',
    stripePriceId: process.env.STRIPE_PRICE_ADDON_SEATS_5 || null,
    monthlyAmount: 1500, // $15.00
    seats: 5,
  },
  communications: {
    name: 'Communications',
    stripePriceId: process.env.STRIPE_PRICE_ADDON_COMMS || null,
    monthlyAmount: 4900, // $49.00
    features: ['phone', 'sms', 'video', 'live_chat'],
  },
  client_pack_starter: {
    name: 'Client Pack Starter',
    stripePriceId: process.env.STRIPE_PRICE_ADDON_CLIENT_STARTER || null,
    monthlyAmount: 2900, // $29.00
    clientSeats: 5,
    clientTokens: 50_000,
  },
  client_pack_pro: {
    name: 'Client Pack Pro',
    stripePriceId: process.env.STRIPE_PRICE_ADDON_CLIENT_PRO || null,
    monthlyAmount: 5900, // $59.00
    clientSeats: 10,
    clientTokens: 150_000,
  },
  client_pack_unlimited: {
    name: 'Client Pack Unlimited',
    stripePriceId: process.env.STRIPE_PRICE_ADDON_CLIENT_UNLIMITED || null,
    monthlyAmount: 12900, // $129.00
    clientSeats: -1, // unlimited
    clientTokens: 500_000,
  },
  white_label: {
    name: 'Companion White-Label',
    stripePriceId: process.env.STRIPE_PRICE_ADDON_WHITE_LABEL || null,
    monthlyAmount: 1900, // $19.00
  },
} as const;

export type EarnestAddonId = keyof typeof EARNEST_ADDONS;
```

Add `addonFromPriceId()` function similar to `planFromPriceId()`.

---

## Step 2 — Add active_addons field to organizations via MCP

Use the Directus MCP connection to add a JSON field to track active add-ons:

```json
{
  "field": "active_addons",
  "type": "json",
  "meta": {
    "interface": "input-code",
    "note": "Active add-on subscription IDs — managed by Stripe webhooks"
  },
  "schema": { "is_nullable": true }
}
```

The field stores an object like:
```json
{
  "communications": { "stripe_subscription_item_id": "si_xxx", "active_since": "2026-01-15" },
  "client_pack_pro": { "stripe_subscription_item_id": "si_yyy", "active_since": "2026-02-01" }
}
```

After adding the field, run `pnpm generate:types`.

---

## Step 3 — Update webhook to handle add-on subscription items

Read `server/api/stripe/paymentchange.ts` (after Task 2 changes).

Stripe subscriptions can have multiple line items. When a subscription has add-on price IDs,
update the org's `active_addons` field accordingly.

In `handleSubscriptionChange()`, after the plan update logic:

```typescript
// Check for add-on line items
const addons: Record<string, any> = {}
for (const item of subscription.items.data) {
  const addonId = addonFromPriceId(item.price.id)
  if (addonId) {
    addons[addonId] = {
      stripe_subscription_item_id: item.id,
      active_since: new Date(item.created * 1000).toISOString(),
    }
  }
}

if (Object.keys(addons).length > 0) {
  await adminDirectus.request(
    updateItem('organizations', orgId, { active_addons: addons })
  )
}
```

When a subscription is deleted, clear `active_addons`:
```typescript
await adminDirectus.request(
  updateItem('organizations', orgId, { active_addons: null })
)
```

---

## Step 4 — Client portal token pool separation

### Business model requirement (Section 07)
"Client tokens are completely separate from the agency's own token budget. Client AI usage
never drains the agency's allocation. This is a firm technical requirement."

The `earnest_token_pools` collection (created in Task 3) has `pool_type: 'agency' | 'client'`
and `account_id` (the org ID).

When a client pack add-on is activated:
1. Create or update an `earnest_token_pools` record with `pool_type: 'client'` for the org
2. Set `tokens_monthly` to the client pack's token allocation

When a client portal user makes an AI call (identified by their `org_membership` having
`role.slug === 'client'`), the token enforcer (Task 3) should check and deduct from the
client pool, not the agency pool.

Extend `checkOrgTokenBudget()` and `deductOrgTokens()` in `server/utils/tokenEnforcer.ts`
to accept an optional `poolType` parameter:

```typescript
export async function checkOrgTokenBudget(
  orgId: string,
  poolType: 'agency' | 'client' = 'agency'
): Promise<TokenCheckResult> {
  // If poolType === 'client', check earnest_token_pools where
  // account_id === orgId AND pool_type === 'client'
  // Otherwise, check the org's ai_token_balance as before
}
```

---

## Step 5 — Add-on gating helpers

Create a composable or extend `useOrgRole.ts` with an `hasAddon()` check:

```typescript
function hasAddon(addonId: string): boolean {
  const addons = orgData.value?.active_addons
  if (!addons) return false
  return !!addons[addonId]
}
```

Use this to gate:
- Communications features (phone, SMS, video) → `hasAddon('communications')`
- White-label settings → `hasAddon('white_label')`
- Client portal access limits → check client pack add-on for seat counts

---

## Step 6 — Add-on purchase API

Create `server/api/stripe/addons/subscribe.post.ts`:
- Accepts: `{ addonId: EarnestAddonId }`
- Adds the add-on as a new item on the org's existing Stripe subscription
- Uses `stripe.subscriptionItems.create()` to add to existing subscription
- Returns success

Create `server/api/stripe/addons/cancel.post.ts`:
- Accepts: `{ addonId: EarnestAddonId }`
- Removes the subscription item from the Stripe subscription
- Returns success

---

## White-Label Implementation Notes (for future reference)

The white-label add-on ($19/mo) enables branded subdomains on `earnest.guru`:
- Default Companion: `companion.earnest.guru`
- White-labeled: `orgslug.earnest.guru`

**Technical approach (Phase 1 — wildcard subdomains):**
- Single wildcard SSL cert on `*.earnest.guru`
- Nuxt server middleware parses subdomain from Host header
- Looks up `organizations.whitelabel_subdomain` to find the org
- Injects org branding (logo, icon, brand_color, name) into SSR context
- Companion layout reads branding from `useWhiteLabel()` composable

**Schema change needed:** Add `whitelabel_subdomain` (unique string) to `organizations`.
Also maintain a reserved list: `app`, `companion`, `admin`, `api`, `www`, `mail`, `status`.

**Phase 2 (future $49/mo premium):** CNAME custom domains via Cloudflare for SaaS.
Agency points `portal.theiragency.com` → `custom.earnest.guru`. Requires DNS verification
flow and automated SSL provisioning. Not in scope for initial launch.

## Do NOT do in this task
- CardDesk standalone billing (separate product, not an add-on)
- Push notification infrastructure
- White-label implementation code (just the billing gate — implementation is a separate task)

## After making changes
Run `pnpm typecheck`. Test by adding a Communications add-on to a test org's subscription
and verifying the `active_addons` field is populated by the webhook.

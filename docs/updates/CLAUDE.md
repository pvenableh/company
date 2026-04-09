# Earnest — Claude Code Project Context

## What this project is
Earnest is a multi-tenant SaaS business operating system built with Nuxt 3, Vue 3, TypeScript,
Directus 11 (headless CMS/backend), and Stripe. It targets small creative agencies of 2–15 people.

## Directus MCP connection

Claude has a live MCP connection to the Directus instance at `admin.earnest.guru`.
This means Claude can:
- Create new collections and fields directly via the Directus REST API
- Read the live schema to verify field names before writing code
- Set permissions on new collections
- Query live data for debugging

**Always use the MCP connection for schema changes** rather than writing migration scripts.
After any schema change (new collection, new field), run `pnpm generate:types` to regenerate
`types/directus.ts` before writing code that references the new fields.

**Never edit `types/directus.ts` manually** — it is auto-generated and will be overwritten.

## Non-negotiable rules before touching any file

1. **Read the file first.** Always read the existing file in full before editing it.
2. **Match existing patterns exactly.** If the file uses `useDirectusItems()`, use that. If it uses
   the Directus SDK directly, use that. Never introduce a new data-fetching pattern.
3. **TypeScript types live in `types/directus.ts`.** This is auto-generated from the live Directus
   schema. Never manually edit it. Reference it for every collection field name — the schema is the
   source of truth. Key interfaces: `Organization`, `EarnestScore`, `AiUsageLog`, `AiPreference`,
   `VideoMeeting`, `PhoneSetting`.
4. **`server/utils/stripe.ts`** is the single source of truth for plan definitions and price IDs.
   `EARNEST_PLANS` and `TOKEN_PACKAGES` are imported everywhere. Change prices here only.
5. **`useOrganization()`** provides `selectedOrg` — the active org ID. Always scope data to this.
6. **`useOrgRole()`** provides `canAccess(feature)`, `hasPermission(feature, action)`. Use these
   for all permission checks, never raw role string comparisons.
7. **shadcn-vue components** are in `components/ui/`. Use them. Don't install new UI libraries.
8. **Tailwind CSS v4** with `t-*` semantic utility classes defined in `assets/css/theme.css`.
   Use `t-bg`, `t-surface`, `t-text`, `t-border`, etc. for all colors. Never hardcode colors.
9. **pnpm only.** Never use npm or yarn.
10. **No `console.log` in production paths.** Use `console.warn` or `console.error` only.

## Architecture

### Tenant boundary
`organizations` is the tenant. Every piece of data (projects, tickets, invoices, contacts) is
scoped to `organization`. Always filter by `organization: { _eq: selectedOrg.value }`.

### Auth pattern (server-side)
```typescript
// All server API routes use this pattern:
const event = useEvent()
const { user } = await requireUserSession(event)
// Admin client (static token): getTypedDirectus()  — auto-imported by Nuxt
// User-scoped client: await getUserDirectus(event)
// There is NO getAdminDirectus() function — use getTypedDirectus() instead.
```

### Auth pattern (client-side)
```typescript
const { user } = useDirectusAuth()
const { selectedOrg } = useOrganization()
const { canAccess, hasPermission } = useOrgRole()
```

### Data fetching pattern (client-side)
```typescript
// Using useDirectusItems composable:
const items = useDirectusItems('collection_name')
const results = await items.list({ filter: {...}, fields: [...] })

// Or using useFetch with the API layer:
const { data } = await useFetch('/api/endpoint')
```

### Server API route pattern
```typescript
// server/api/feature/action.method.ts
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const directus = useDirectus()
  // ... implementation
  return { success: true, data: result }
})
```

## Key files and their roles

| File | Role |
|------|------|
| `server/utils/stripe.ts` | Stripe client, EARNEST_PLANS, TOKEN_PACKAGES |
| `server/api/stripe/paymentchange.ts` | Stripe webhook — ALL subscription events |
| `server/api/stripe/tokens/checkout.post.ts` | Token top-up Stripe Checkout |
| `server/api/stripe/tokens/fulfill.ts` | Webhook fulfillment for token purchases |
| `composables/useAITokens.ts` | Org-level token balance/limit checks |
| `composables/useAIUsage.ts` | Client-side usage tracking (localStorage) |
| `composables/useOrgRole.ts` | Permission checks, planAllows(), hasAddon() |
| `composables/useViewAsOrgAdmin.ts` | "View as Org Admin" toggle for Directus admins |
| `server/utils/ai-token-enforcement.ts` | Server-side token/scan enforcement for AI endpoints |
| `composables/useOrganization.ts` | Selected org context |
| `server/utils/crm-intelligence.ts` | CRM AI data aggregation |
| `server/utils/llm/factory.ts` | getLLMProvider() — all AI calls go through here |
| `server/utils/directus.ts` | `getTypedDirectus()` (admin), `getUserDirectus(event)` (user-scoped) |

## Directus collections relevant to monetization

| Collection | Key fields |
|------------|------------|
| `organizations` | `plan` (values: `free\|starter\|pro\|enterprise` — maps to solo/studio/agency), `ai_token_balance`, `ai_token_limit_monthly`, `ai_tokens_used_this_period`, `ai_billing_period_start` |
| `ai_usage_logs` | `user`, `organization`, `endpoint`, `model`, `input_tokens`, `output_tokens`, `total_tokens`, `estimated_cost` |
| `ai_preferences` | `user`, `ai_enabled`, `token_budget_monthly`, `low_usage_mode` |
| `earnest_scores` | `organization`, `total_ep`, `streak`, `dimension_scores`, `badges_unlocked`, `current_score`, `level` |
| `earnest_history` | `organization`, `date`, `score`, `ep_earned`, `streak`, `dimensions` |
| `video_meetings` | `room_name`, `room_sid` (Daily room ID), `status`, `host_user` |
| `phone_settings` | `twilio_phone_number`, `line_name`, `organization` (M2O) |

## Current plan tiers (IMPLEMENTED — Task 1)

```typescript
// Current values in stripe.ts:
solo:   $49/mo  — 1 seat,  100K tokens/mo,  25 scans/mo
studio: $149/mo — 8 seats, 400K tokens/mo, 150 scans/mo
agency: $299/mo — 15 seats, 1M tokens/mo,  unlimited scans
```

## What planAllows() should gate

Per the business model: **all plans get all features.** Differentiation is seats, tokens,
and scans only. The only feature gate is:
```
white_label: agency/enterprise only
```

Resource limits (tokens, scans, seats) are enforced server-side by `server/utils/ai-token-enforcement.ts`
(Task 3), not by planAllows(). All 10 AI endpoints now have token enforcement.

## Add-ons (billed separately — see Task 8)

```
Communications (phone/video/SMS):  $49/mo add-on
Client Pack Starter:               $29/mo (5 client seats + 50K client tokens)
Client Pack Pro:                    $59/mo (10 client seats + 150K client tokens)
Client Pack Unlimited:              $129/mo (unlimited seats + 500K client tokens)
Extra Seats (5-pack):               $15/mo
Companion White-Label:              $19/mo
```

## Video meeting architecture (COMPLETED — Task 5)

Migrated from Twilio Video to **Daily.co**. The collection shape is unchanged:
- `room_name` = Daily room name
- `room_sid` = Daily room ID (was Twilio SID)
- `meeting_url` = Daily prebuilt room URL (iframe-based, no client SDK needed)

Key files:
- `server/utils/daily.ts` — Daily.co REST API client
- `server/api/video/create-room.post.ts` — creates Daily room + Directus record
- `server/api/video/token.post.ts` — generates Daily meeting tokens
- `server/api/video/webhook.post.ts` — receives Daily webhook events (JSON)
- `server/api/video/setup-webhook.post.ts` — one-time registration of webhook URL
- `pages/meeting/[roomName].vue` — Meeting page using Daily.co prebuilt iframe (replaces Twilio Video SDK)

**Daily.co webhook setup:** Webhooks are registered via REST API, not the dashboard.
Run `POST /api/video/setup-webhook` once after deploy. It registers
`{siteUrl}/api/video/webhook` with Daily.co for meeting events. Idempotent.

## Twilio architecture (phones, SMS) (COMPLETED — Task 6)

**Per-org sub-accounts** are now supported. Master account provisions sub-accounts;
all calls/SMS for an org route through its sub-account for billing isolation.

Key files:
- `server/utils/twilioMaster.ts` — master client, sub-account provisioning, phone number purchase
- `server/api/phone/numbers/search.get.ts` — search available numbers by area code
- `server/api/phone/numbers/purchase.post.ts` — purchase a number for an org

Schema:
- `organizations.twilio_subaccount_sid/token/status` — per-org Twilio credentials
- `phone_settings.organization` — M2O to organizations (added in Task 6)

Communications is a **$49/mo add-on**. Sub-account provisioned on activation.

## Earnest Score engine (COMPLETED — Task 7)

Key files:
- `server/utils/earnestScore.ts` — `awardEP(orgId, eventType)` function, EP values, level calc
- `server/api/score/me.get.ts` — current org score
- `server/api/score/checkin.post.ts` — daily login EP (called once per day on app mount)
- `server/api/score/history.get.ts` — score history for charts (up to 90 days)

**Wiring awardEP() to platform events:** Most existing routes handle CRUD via Directus directly
(not custom API routes), so they lack org context for scoring. Best approach for remaining events
is Directus Flows (event triggers) or adding awardEP() calls as routes are modernized.
Currently wired: daily_login via checkin endpoint.

## Domain architecture

Domain: `earnest.guru`

Structure:
```
earnest.guru                    → marketing site (separate repo: ~/Sites/earnest/earnest-marketing)
app.earnest.guru                → main platform (THIS repo)
admin.earnest.guru              → Directus admin / CMS backend
companion.earnest.guru          → default Companion PWA
{orgslug}.earnest.guru          → white-labeled Companion (add-on)
```

The marketing sell sheet and landing pages have been moved to the `earnest-marketing` project
(`~/Sites/earnest/earnest-marketing`), which deploys to `earnest.guru`. This repo (the app platform)
deploys to `app.earnest.guru`. The Directus admin lives at `admin.earnest.guru`.

White-label uses wildcard SSL on `*.earnest.guru`. Reserved subdomains:
`app`, `companion`, `admin`, `api`, `www`, `mail`, `status`

## Environment variables (relevant ones)

```
# Stripe
STRIPE_SECRET_KEY_LIVE / STRIPE_SECRET_KEY_TEST
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_SOLO / STRIPE_PRICE_SOLO_ANNUAL
STRIPE_PRICE_STUDIO / STRIPE_PRICE_STUDIO_ANNUAL
STRIPE_PRICE_AGENCY / STRIPE_PRICE_AGENCY_ANNUAL
STRIPE_PRICE_TOKENS_100K / STRIPE_PRICE_TOKENS_500K / STRIPE_PRICE_TOKENS_1_5M
STRIPE_PRICE_SCANS_100 / STRIPE_PRICE_SCANS_500

# Daily.co (video)
DAILY_API_KEY                   ← get from https://dashboard.daily.co/developers
DAILY_DOMAIN                    ← your Daily.co subdomain (e.g. "earnest" for earnest.daily.co)

# Twilio (master account — sub-account creds stored in organizations table)
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER / TWILIO_API_KEY / TWILIO_API_SECRET
```

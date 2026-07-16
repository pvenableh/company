# Stripe Earnest migration — testing & handoff checklist

Companion to `restructure-plan.md` (the why) and `dashboard-setup-guide.md` (the
Stripe Dashboard steps). This file is the **pick-up point for finishing and
testing** the code on branch `claude/stripe-earnest-migration-j1liv7` / PR #122.

---

## State of the code (what's already done)

All backend + UI code is committed on the branch:

- **Wholesale pricing** — `organizations.wholesale_pricing` field, `require-platform-admin.ts`
  gate, `PATCH /api/admin/organizations/[id]/wholesale`, wholesale token price,
  zero application-fee on wholesale invoice payments.
- **Routing hardening** — invoice payment for an org with no connected account
  returns **412** instead of falling through to the Earnest platform balance.
- **Reliable token fulfillment** — idempotent `fulfillTokenPurchase` called from
  both the webhook and the client fast-path.
- **Connect existing account** — `oauth-start` / `oauth-callback` routes + the
  "Connect an existing account" button on Organization → Billing.

Nothing else needs to be written to ship the plan's Part B. Remaining work is
**configuration + testing**, below.

---

## Decisions locked (do NOT re-litigate)

- **Token & scan Stripe price IDs stay blank.** `STRIPE_PRICE_TOKENS_*` and
  `STRIPE_PRICE_SCANS_*` are vestigial. Token purchases build the charge with
  inline `price_data` + `unit_amount` (reads `priceInCents` /
  `wholesalePriceInCents`, never `stripePriceId`); scan `stripePriceId` isn't
  read anywhere. Both fall back to `|| null`. **Do not create these products.**
- **Add-on price IDs DO matter.** `STRIPE_PRICE_ADDON_*` are looked up by id in
  `addonFromPriceId()` for subscription webhooks — they must belong to the **new
  Earnest account** (the account `STRIPE_SECRET_KEY` now points at).
- Hue's existing account becomes a **connected account**, not the platform. The
  new Earnest account is the platform. No payment-history migration.

---

## Prerequisites before testing

1. **Env** (local `.env` for local testing, or Vercel/remote env otherwise):
   - `STRIPE_SECRET_KEY` / `_TEST`, `STRIPE_PUBLIC_KEY` / `_TEST` → **new Earnest** account.
   - `STRIPE_PRICE_SOLO/STUDIO/AGENCY` (+ `_ANNUAL`) and `STRIPE_PRICE_ADDON_*` → new account's price IDs.
   - `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`.
   - `STRIPE_CONNECT_CLIENT_ID` (`ca_…`) — required for the "Connect an existing account" button.
   - `STRIPE_PLATFORM_FEE_BPS` — application fee bps (waived to 0 for wholesale orgs).
   - Token/scan price vars: **leave blank** (see decision above).
2. **Directus schema:** `pnpm tsx scripts/setup-wholesale-field.ts` then `pnpm generate:types`.
3. **Grant Hue wholesale:** `PATCH /api/admin/organizations/<hue-org-id>/wholesale`
   `{ "enabled": true }` as a Directus super-admin (or flip `wholesale_pricing`
   directly in Directus).
4. **Stripe CLI for webhooks (local):** `stripe listen --forward-to localhost:3000/api/stripe/paymentchange`
   and paste the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

## Where to test

- **Local** (`pnpm dev` on your machine) — your `.env` lives here; easiest for
  driving Stripe test-mode flows end to end.
- **Vercel preview** — set vars in Vercel; note this branch currently hits the
  "Ignored Build Step", so allow the build first if you want a preview URL.
- A remote Claude session can drive it too, but only if the vars are set in the
  remote environment (it does not see your local `.env`).

---

## Test scenarios (Stripe test mode)

- [ ] **Token purchase credits balance once.** Buy a token package; confirm
      `organizations.ai_token_balance` increases by the package amount. Verify no
      double-credit when both the webhook and the success-page fast-path run
      (idempotent via the `fulfilled` metadata flag).
- [ ] **Wholesale token price.** With Hue wholesale, the checkout charges
      `wholesalePriceInCents` (e.g. $4.50 for 100K) but still grants the full
      `pkg.tokens`. A non-wholesale org pays `priceInCents`.
- [ ] **Invoice payment → connected account.** For an org with an active
      connected account, the PaymentIntent is created on that account
      (`routingMode: 'connected'`) and funds settle there.
- [ ] **Wholesale invoice = zero fee.** A wholesale org's invoice PaymentIntent
      carries no `application_fee_amount` regardless of `STRIPE_PLATFORM_FEE_BPS`.
- [ ] **No-account invoice → 412.** An invoice payment for an org with
      `stripe_account_status: 'none'` returns 412, not a platform charge.
- [ ] **Connect an existing account.** Organization → Billing → "Connect an
      existing account" → Stripe OAuth → returns with `connect_linked=1`, org
      shows `stripe_account_id` + status. Decline path shows a `connect_error` toast.
- [ ] **Wholesale gate.** `wholesale.patch` returns 403 for a non-super-admin and
      there is no org-role path to it (an org cannot grant itself wholesale).
- [ ] **Subscription checkout.** A $1 test subscription sets the org plan + token
      allotment via the `checkout.session.completed` / `customer.subscription.*` webhooks.

---

## After test mode passes

- Flip env to **live** keys/price IDs/webhook secrets; repeat the smoke tests
  with a $1 live payment.
- Connect Hue's existing account for real (A5 in `restructure-plan.md`).
- Repoint CardDesk env to the new Earnest account (Part C).
- Rename the old Hue account's public name back to "Hue Studios".
- Update the Stripe memory docs noted at the bottom of `restructure-plan.md`.

---

## Test-run results (2026-07-16, test mode, dev server on :3000)

Prerequisites 2–3 executed against **production Directus** (`admin.earnest.guru`):

- ✅ `organizations.wholesale_pricing` field created; `pnpm generate:types` regenerated
  `shared/directus.ts` (adds `wholesale_pricing?: boolean`). **This types diff is
  uncommitted** — commit it to the branch.
- ✅ Hue org (`423f5e7e-e14c-4348-9fea-89ba5c6b9d96`) granted wholesale
  (`wholesale_pricing = true`). No runtime effect in prod until the branch deploys
  (main's code doesn't read the field).

Dev server (`useStripe()` → `stripeSecretKeyTest` when `NODE_ENV !== production`)
confirmed pointing at the **new Earnest test account** `acct_1TtC2pPJZ9KnFoHM`
("Earnest").

| # | Scenario | Result | How |
|---|----------|--------|-----|
| 7 | No-account invoice → **412** | ✅ **PASS (driven live)** | `POST /api/stripe/paymentintent` with real Hue invoice `106453c1…` (org status `none`) → HTTP 412, thrown in `resolveRouting` before any Stripe PI is created. |
| 8 | Wholesale **gate** | ✅ **PASS (live + code)** | Unauthenticated `PATCH …/wholesale` → **401**. Grep confirms the *only* writer of `wholesale_pricing` is `wholesale.patch.ts` (gated by `requirePlatformAdmin` = Directus super-admin). No org-role self-grant path. |
| 3 | Token fulfillment **idempotent** | ⚠️ **Code-verified** | `fulfillTokenPurchase` guard (`metadata.fulfilled==='true'`) round-trips through a real `stripe.checkout.sessions.update`; both webhook + `/tokens/fulfill` fast-path share it. Live payment attempted (created + expired a test session) but Stripe Elements iframe couldn't be driven in the preview pane. **Re-run manually or logged-in.** |
| 4 | **Wholesale token price** | ⚠️ **Code-verified** | `checkout.post.ts:44` `unitAmount = wholesale_pricing ? wholesalePriceInCents : priceInCents`; tokens unchanged. E2E is login-gated (`requireOrgPermission org_settings:update`). |
| 5 | Invoice → **connected account** | ⚠️ **Code-verified** | `resolveRouting` → `mode:'connected'`, PI created with `{stripeAccount}`. **Blocked live:** no org has an active connected account, and faking one on a prod org is unsafe. Needs a real test connected account (scenario "Connect existing" / OAuth). |
| 6 | **Wholesale invoice = zero fee** | ⚠️ **Code-verified** | `paymentintent.post.ts:107` `bps = wholesale_pricing ? 0 : fee`; `application_fee_amount` omitted when 0. Blocked live with #5 (412 fires first for `none`-status orgs). |
| — | Connect-existing OAuth | ⛔ **Blocked** | `STRIPE_CONNECT_CLIENT_ID` empty → `oauth-start` 500s. Needs the `ca_…` id + a login. |
| — | Subscription checkout | ⛔ **Blocked** | Plan price IDs in `.env` are LIVE (unusable under the test key). Needs test-mode price IDs + a login. |

Cleanup: the one test Checkout Session created for #3 was **expired**; the demo org
used as its fulfillment target (`Earnest Demo — Solo`) was **never credited**
(balance still 100000). No test state left behind.

---

## Required Stripe configuration (the actual gaps)

Structural facts about how the app reads these (`nuxt.config.ts`, `server/utils/stripe.ts`):

- **Secret key** is chosen by `NODE_ENV` (`STRIPE_SECRET_KEY_TEST` in dev, `STRIPE_SECRET_KEY`
  in prod). **Public key** by `isProduction` (`STRIPE_PUBLIC_KEY_TEST` vs `STRIPE_PUBLIC_KEY`).
- **Webhook secrets and every `STRIPE_PRICE_*` are SINGLE vars** (no `_TEST`/`_LIVE` split).
  So the **local `.env` must hold test-mode values** and **Vercel must hold live values** for
  the *same* variable names. This is why the current local price IDs (live) don't work under
  the test key.

### 🔴 Blocker — add-on price IDs are on the WRONG account (fix regardless of test/live)

All six `STRIPE_PRICE_ADDON_*` (`SEATS_5`, `COMMS`, `CLIENT_STARTER`, `CLIENT_PRO`,
`CLIENT_UNLIMITED`, `WHITE_LABEL`) currently point at the **old Hue account**, not the new
Earnest platform account. `addonFromPriceId()` (subscription webhook) will fail to map any
add-on → `organizations.active_addons` won't populate, in **both** test and live. Recreate
these six products/prices on the **new Earnest account** (test + live modes) and update the
env in both places.

### For LOCAL test-mode testing (`.env` on this machine)

| Var | Current | Needed for test |
|-----|---------|-----------------|
| `STRIPE_SECRET_KEY_TEST`, `STRIPE_PUBLIC_KEY_TEST` | ✅ Earnest test | keep |
| `STRIPE_PRICE_SOLO/STUDIO/AGENCY` (+ `_ANNUAL`) | ❌ live ids | **test-mode** ids from Earnest test dashboard (6 vars) |
| `STRIPE_PRICE_ADDON_*` (×6) | ❌ wrong account | **test-mode** ids on the new Earnest account |
| `STRIPE_CONNECT_CLIENT_ID` | ❌ empty | `ca_…` from Connect settings (test) — for connect-existing |
| `STRIPE_PLATFORM_FEE_BPS` | empty (→0) | set e.g. `250` to *observe* a non-zero fee vs the wholesale-0 case |
| `STRIPE_WEBHOOK_SECRET` | deployed-endpoint secret | for local CLI: run `stripe listen --forward-to localhost:3000/api/stripe/paymentchange` and paste the printed `whsec_…` here (temporarily) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | ✅ set | for connect events, `stripe listen … /api/stripe/connect-webhook` prints its own `whsec_…` |
| `STRIPE_PRICE_TOKENS_*`, `STRIPE_PRICE_SCANS_*` | blank | **leave blank** (locked decision — inline `price_data`) |

### For PRODUCTION (Vercel env)

| Var | Value |
|-----|-------|
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY` | Earnest **live** keys |
| `STRIPE_PRICE_SOLO/STUDIO/AGENCY` (+ `_ANNUAL`) | Earnest **live** ids (current local values look correct for prod) |
| `STRIPE_PRICE_ADDON_*` (×6) | **live** ids on the new Earnest account (currently wrong account — must fix) |
| `STRIPE_CONNECT_CLIENT_ID` | `ca_…` (live) |
| `STRIPE_WEBHOOK_SECRET` | signing secret of the live `…/api/stripe/paymentchange` endpoint |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | signing secret of the live Connect webhook endpoint |
| `STRIPE_PLATFORM_FEE_BPS` | the real platform fee (or unset for 0) |

### ✅ Prices created / repointed (2026-07-16)

Checked first — the **6 plan prices already existed** on Earnest in both test and live
(no duplicates created). The **6 add-ons were missing** and were created via API on the
Earnest account in **both** modes (idempotency-keyed). Local `.env` was repointed to the
**test** IDs below and validated (all 12 resolve under the test key).

**Local `.env` now holds these TEST ids** (plans reused, add-ons new):

```
STRIPE_PRICE_SOLO=price_1TtUEbPJZ9KnFoHMROjysBTW
STRIPE_PRICE_SOLO_ANNUAL=price_1TtUF7PJZ9KnFoHM7qXHjkre
STRIPE_PRICE_STUDIO=price_1TtUHUPJZ9KnFoHM3vql138z
STRIPE_PRICE_STUDIO_ANNUAL=price_1TtUI2PJZ9KnFoHMghagjHcC
STRIPE_PRICE_AGENCY=price_1TtUNrPJZ9KnFoHMnmGERvz5
STRIPE_PRICE_AGENCY_ANNUAL=price_1TtUQTPJZ9KnFoHMYMcoXEri
STRIPE_PRICE_ADDON_SEATS_5=price_1TtpwCPJZ9KnFoHMO5oWLPGC
STRIPE_PRICE_ADDON_COMMS=price_1TtpwDPJZ9KnFoHM9hC7VefZ
STRIPE_PRICE_ADDON_CLIENT_STARTER=price_1TtpwEPJZ9KnFoHMSZXhwZKE
STRIPE_PRICE_ADDON_CLIENT_PRO=price_1TtpwFPJZ9KnFoHMdzhNYlB8
STRIPE_PRICE_ADDON_CLIENT_UNLIMITED=price_1TtpwGPJZ9KnFoHMt053stR7
STRIPE_PRICE_ADDON_WHITE_LABEL=price_1TtpwHPJZ9KnFoHMy2yIufEK
```

**Set these LIVE ids in Vercel** (plans were already correct there; the 6 add-ons are the fix):

```
# plans (already correct in Vercel — listed for completeness)
STRIPE_PRICE_SOLO=price_1TtTEKPJZ9KnFoHMKuVs0tvH
STRIPE_PRICE_SOLO_ANNUAL=price_1TtTW6PJZ9KnFoHMNfUMS7p9
STRIPE_PRICE_STUDIO=price_1TtTXqPJZ9KnFoHMnQFGAuD0
STRIPE_PRICE_STUDIO_ANNUAL=price_1TtTYQPJZ9KnFoHMKSEXLZpY
STRIPE_PRICE_AGENCY=price_1TtTZYPJZ9KnFoHMPmCxnSEC
STRIPE_PRICE_AGENCY_ANNUAL=price_1TtTa2PJZ9KnFoHMbgMbh8jt
# add-ons (NEW — these replace the old-Hue-account ids)
STRIPE_PRICE_ADDON_SEATS_5=price_1TtpwIPJZ9KnFoHM5Yk3YJCf
STRIPE_PRICE_ADDON_COMMS=price_1TtpwJPJZ9KnFoHMikQ2aQla
STRIPE_PRICE_ADDON_CLIENT_STARTER=price_1TtpwKPJZ9KnFoHMF8Wm0hA6
STRIPE_PRICE_ADDON_CLIENT_PRO=price_1TtpwLPJZ9KnFoHMaQ7lula7
STRIPE_PRICE_ADDON_CLIENT_UNLIMITED=price_1TtpwMPJZ9KnFoHMBFEx4CaY
STRIPE_PRICE_ADDON_WHITE_LABEL=price_1TtpwNPJZ9KnFoHMABLc1SbH
```

**Connect OAuth configured 2026-07-16:** OAuth enabled in test + live; redirect URIs added
(`http://127.0.0.1:3000/api/stripe/connect/oauth-callback` test,
`https://app.earnest.guru/api/stripe/connect/oauth-callback` live). Client IDs:
local `.env` `STRIPE_CONNECT_CLIENT_ID=ca_Usyry9aqFifzQBp28PR9bNxlODYxzeLZ` (test, set);
Vercel needs `ca_Usyrwwa2FEYGy39cgakffITq81g5Sxjw` (live). Connect-existing is now
config-complete; the E2E click-through still needs a logged-in `org_settings:update` session.

Note: the code's `EARNEST_PLANS.agency.annualAmount` display constant (`249100`) doesn't
match the actual Agency-annual price ($2,988 in both modes) — cosmetic, worth reconciling.

### Test-mode webhooks — yes, two

1. `stripe listen --forward-to localhost:3000/api/stripe/paymentchange` (platform events:
   `checkout.session.completed`, `customer.subscription.*`) → paste its `whsec_…` into
   `STRIPE_WEBHOOK_SECRET` for the local run.
2. `stripe listen --forward-to localhost:3000/api/stripe/connect-webhook` (connected-account
   events) → its `whsec_…` into `STRIPE_CONNECT_WEBHOOK_SECRET` (only needed for Connect flows).

### Follow-up hardening to verify separately

The wholesale gate is proven at the app layer. Because `wholesale_pricing` is a brand-new
Directus field, confirm the org-member/admin Directus **policy** can't `PATCH`
`organizations.wholesale_pricing` directly via the Directus API (bypassing the app).

---

## Session-bound notes

PR #122's activity subscription and the hourly self check-in are tied to the
session that created them and do not carry into a new session. If you open a
fresh session to finish this, ask it to re-subscribe to PR #122 if you want the
CI/review watching to continue.

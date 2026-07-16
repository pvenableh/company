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

## Session-bound notes

PR #122's activity subscription and the hourly self check-in are tied to the
session that created them and do not carry into a new session. If you open a
fresh session to finish this, ask it to re-subscribe to PR #122 if you want the
CI/review watching to continue.

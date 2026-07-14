# Stripe Restructure — Earnest platform account + Hue connected account + wholesale grants

**Decision locked (2026-07-14):** There are **no live Earnest subscribers** — every historical payment is a Hue client invoice payment. So we **create a brand-new Earnest Stripe account** (nothing to migrate) and **keep the existing account as Hue's**, retaining its payment history. Hue then connects that existing account to the new Earnest platform as a Connect Standard account.

---

## Target architecture

| Concern | Account | Env / routing |
| --- | --- | --- |
| Earnest SaaS subscriptions + add-ons | **NEW Earnest platform account** | `STRIPE_SECRET_KEY` / `STRIPE_PUBLIC_KEY`, webhook `/api/stripe/paymentchange` |
| Earnest AI token purchases | **NEW Earnest platform account** | inline `price_data` (no product needed) |
| CardDesk credit purchases | **NEW Earnest platform account** | CardDesk `STRIPE_SECRET_KEY_LIVE`/`_TEST`, webhook `/api/stripe/webhook` |
| Connect platform (all connected accounts live here) | **NEW Earnest platform account** | webhook `/api/stripe/connect-webhook`, `STRIPE_CONNECT_WEBHOOK_SECRET` |
| **Hue's** client invoice payments | **Existing account → now a *connected* account** | `organizations.stripe_account_id` on the Hue org |
| Every other org's client invoice payments | their own connected account | `organizations.stripe_account_id` |

**Key inversion:** the old convention "Hue is the platform, never onboard it to Connect" is **reversed**. Hue becomes a normal connected account. The new Earnest account is the platform and never acts as merchant of record for a client's invoice.

---

## Part A — Stripe Dashboard (manual, you do this)

### A1. Create the new Earnest platform account
1. New Stripe account, legal entity as you prefer (can stay Hue Studios LLC — one entity can own multiple accounts, or a new Earnest entity if you've formed one).
2. `Settings → Business → Public details`: Public business name = **Earnest** (drop "by Hue"). Statement descriptor `EARNEST`.
3. `Settings → Connect` → enable Connect → Platform settings: name **Earnest**, website `https://earnest.guru`, brand color `#502989`, upload logo. (Reuse the approved copy blocks from the Stripe-wiring notes.)
4. Activate the account (live mode) so you can take real payments.

### A2. Recreate Products & Prices on the new account
Because the old `STRIPE_PRICE_*` IDs belong to the old (Hue) account, recreate on the new account and capture the **new** price IDs:
- Solo `$49/mo` + annual `$408/yr`
- Studio `$149/mo` + annual `$1,241/yr`
- Agency `$299/mo` + annual `$2,988/yr`
- Add-ons (extra seats 5-pack, communications, client packs, white-label) — only if you plan to sell them now.
- Token packages need **no** products (inline price_data). Same for CardDesk credits.

### A3. Webhooks on the new account
- **Platform webhook:** `https://app.earnest.guru/api/stripe/paymentchange` — events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.subscription.created|updated|deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `checkout.session.completed`. Grab `whsec_…` → `STRIPE_WEBHOOK_SECRET`.
- **Connect webhook** (Connected-accounts section): `https://app.earnest.guru/api/stripe/connect-webhook` — events: `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `payout.paid`, `payout.failed`, `charge.dispute.created`. Grab `whsec_…` → `STRIPE_CONNECT_WEBHOOK_SECRET`.
- **CardDesk webhook:** `https://<carddesk-host>/api/stripe/webhook` — event `checkout.session.completed` (+ `payment_intent.succeeded` if the handler uses it). Grab `whsec_…` → CardDesk `STRIPE_WEBHOOK_SECRET`.
- Do the above in **both test and live** mode.

### A4. Leave the existing (Hue) account alone
- It keeps all historical client payments. Rename its public name back to **Hue Studios** (it was branded "Earnest by Hue"). It is no longer a platform — nothing in code points to it as the platform after the env swap.

### A5. Connect Hue's existing account to the new Earnest platform
Two ways — pick based on B4:
- **Preferred (keep history in the same account):** OAuth "Connect with Stripe → sign in to existing account," authorizing the existing Hue account into the new Earnest platform. Requires the small OAuth route in B4.
- **Fallback (if Stripe refuses to connect the old account because it previously had Connect enabled):** create a fresh Hue connected account via the existing onboarding flow and treat the old account as a read-only historical archive Hue logs into directly.

---

## Part B — Code changes (earnest repo)

### B1. Env swap (Vercel + `.env`) — no code
- Point `STRIPE_SECRET_KEY` / `STRIPE_PUBLIC_KEY` (+ `_TEST`) at the **new Earnest** account.
- Replace all `STRIPE_PRICE_*` with the new account's price IDs (A2).
- Set the new `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET`.
- Nothing in `server/utils/stripe.ts` changes — it already reads these.

### B2. Wholesale schema + admin grant
**New field** on `organizations`:
- `wholesale_pricing` (boolean, default `false`) — the single flag Earnest admins grant. When true: (a) token/credit checkout uses wholesale price table, (b) the org's connected-account invoice payments get `application_fee_amount = 0` (no markup).
- (Optional future granularity: `wholesale_token_discount_bps` int. Start with the boolean.)
- Add via a `scripts/setup-wholesale-field.ts` (mirror `scripts/setup-stripe-connect-fields.ts`) and to the `Organizations` interface in `shared/directus.ts`.

**Platform-admin primitive** (doesn't exist yet):
- Add `server/utils/require-platform-admin.ts` → `requirePlatformAdmin(event)`. Gate = Directus Administrator role **or** owner-role membership of the internal Earnest org (env `EARNEST_PLATFORM_ORG_ID`). This must NOT be self-serviceable by an org on itself.
- Add `server/api/admin/organizations/[id]/wholesale.patch.ts` — `requirePlatformAdmin` + toggles `wholesale_pricing`.
- Minimal admin UI: a toggle on an internal org-admin surface (or, fastest first cut, just flip the field in Directus for Hue and build UI later).

### B3. Apply wholesale to token pricing
- `server/utils/stripe.ts`: add `wholesalePriceInCents` to each `TOKEN_PACKAGES` entry (e.g. your true cost, no margin).
- `server/api/stripe/tokens/checkout.post.ts`: read the org's `wholesale_pricing`; use `pkg.wholesalePriceInCents` when true, else `pkg.priceInCents`. **Tokens granted stay `pkg.tokens`** — wholesale changes price only, not fulfillment.

### B4. Apply wholesale to invoice-payment markup
- `server/api/stripe/paymentintent.post.ts` → `resolveRouting`: add `client.organization.wholesale_pricing` to the `readItem` fields. When `wholesale_pricing` is true, force `applicationFeeAmount = null` regardless of `STRIPE_PLATFORM_FEE_BPS`. (Hue = wholesale ⇒ zero markup automatically.)
- **Connect existing account (OAuth):** add `server/api/stripe/connect/oauth-start.get.ts` (redirect to Stripe OAuth authorize URL) + `oauth-callback.get.ts` (exchange `code` → `stripe_user_id`, store as `stripe_account_id`, set status `active`). Surface a "Connect an existing Stripe account" option next to the current "Create account" CTA on the Billing tab. Needed only for the preferred path in A5.

### B5. Hardening — stop routing client money into the Earnest platform
Currently `resolveRouting` falls through to the **platform** account when an org has `stripe_account_status='none'`. With a clean Earnest account this would commingle a client's invoice payment into Earnest's SaaS balance (the money-transmitter problem you're avoiding). Since Hue is the only org that ever took payments and it's becoming a connected account:
- Change the `none`/no-account branch for **invoice** payments (has `invoiceId`) to return **412 "This organization must connect Stripe to accept payments."**
- Keep the platform path only for the no-`invoiceId` `/payment.vue` general form (that's Earnest's own).

### B6. Hardening — fulfill token purchases from the webhook
Today `paymentchange.ts` only handles `checkout.session.completed` when `mode==='subscription'`; token purchases (`mode==='payment'`, `metadata.type==='token_purchase'`) rely on `/api/stripe/tokens/fulfill` being called client-side — fragile if the user closes the tab.
- In `paymentchange.ts`, on `checkout.session.completed` with `mode==='payment'` and `metadata.type==='token_purchase'`, call the same crediting logic as `tokens/fulfill.post.ts` (idempotent via the `fulfilled` metadata flag). Keep the client call as a fast-path.

---

## Part C — Code changes (carddesk repo, `~/Sites/earnest/carddesk/website`)

CardDesk already uses inline `price_data` for credits, so it only needs to point at the new Earnest account:
- **Env only:** set CardDesk `STRIPE_SECRET_KEY_LIVE` / `STRIPE_SECRET_KEY_TEST` and `STRIPE_PUBLIC_KEY_LIVE` / `_TEST` to the **new Earnest** account keys; set CardDesk `STRIPE_WEBHOOK_SECRET` to the CardDesk webhook from A3.
- Verify `server/api/stripe/webhook.post.ts` credits `cd_credit_accounts` on `checkout.session.completed` with `metadata.type==='credit_purchase'`. No account-scoping needed — these are platform (non-connected) charges on the Earnest account, same as Earnest token purchases.
- Note: CardDesk credits are for standalone users only (org users are bounced to Earnest), so wholesale doesn't apply on the CardDesk side.

---

## Part D — Rollout order

1. **A1–A3** create + configure the new Earnest account, products, webhooks (test mode first).
2. **B1** swap test env vars → smoke test a token purchase + a $1 subscription checkout in test.
3. **B2** ship wholesale field + platform-admin gate; flip `wholesale_pricing=true` on the Hue org.
4. **B3/B4/B5/B6** ship pricing + routing + hardening; test wholesale token price and zero-fee invoice.
5. **A4/A5 + B4 OAuth** connect Hue's existing account; verify a Hue client invoice settles to Hue's account with **no** application fee.
6. **Part C** repoint CardDesk; test a credit purchase lands in the new Earnest account.
7. Flip everything to **live** env vars; repeat the smoke tests with a $1 live payment.

---

## Post-change memory updates
- Rewrite `reference_stripe_earnest_by_hue.md` — Hue is now a **connected account**, the convention is reversed.
- Update `project_stripe_connect_express.md` — platform account is the new Earnest account, not Hue's.
- New memory: wholesale-pricing flag + platform-admin gate.

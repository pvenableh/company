# Stripe Setup Guide — Earnest platform + Hue connected account

Follow this top to bottom. Do **everything in Test mode first**, confirm it works, then repeat the account-level bits in Live mode. Each time you copy a key or secret, paste it straight into the matching env var (list at the bottom) so you don't lose track.

> Rule of thumb: **anything that starts with `sk_` or `whsec_` is a secret** — paste it into Vercel/`.env`, never into a chat or a file that gets committed. Keys that start with `pk_` are public and safe.

---

## Step 1 — Create the new Earnest account

1. Go to https://dashboard.stripe.com → account switcher (top-left) → **+ New account**.
2. Name it **Earnest**. Legal entity can stay Hue Studios LLC (one company can own several Stripe accounts) or your new Earnest entity if you have one.
3. `Settings → Business → Public details`:
   - Public business name: **Earnest**
   - Statement descriptor: **EARNEST**
   - Support email + website `https://earnest.guru`
4. Leave this account in **Test mode** for now (toggle top-right should say "Test mode").

---

## Step 2 — Grab the API keys (Test)

1. `Developers → API keys`.
2. Copy **Publishable key** (`pk_test_…`) → env `STRIPE_PUBLIC_KEY_TEST`.
3. Reveal + copy **Secret key** (`sk_test_…`) → env `STRIPE_SECRET_KEY_TEST`.

---

## Step 3 — Turn on Connect (this account is the platform)

1. `Connect` (left sidebar) → **Get started / Enable**. Choose **Platform or marketplace**.
2. `Settings → Connect → Platform profile`:
   - Platform name: **Earnest**, website `https://earnest.guru`
   - Support email
3. `Settings → Connect → Branding`: brand color `#502989`, upload the Earnest logo.
4. `Settings → Connect → Onboarding options → OAuth`: copy the **Test mode Client ID** (`ca_…`) → env `STRIPE_CONNECT_CLIENT_ID`.
   *(This is what lets Hue connect its existing account instead of making a brand-new one.)*
   - Add an OAuth **redirect URI**: `https://app.earnest.guru/api/stripe/connect/oauth-callback` (and for local testing, `http://127.0.0.1:3000/api/stripe/connect/oauth-callback`).

---

## Step 4 — Create the subscription Products & Prices

`Product catalog → + Add product`. Create each of these, and after saving copy the **Price ID** (`price_…`) into the matching env var:

| Product | Price | Billing | Env var |
| --- | --- | --- | --- |
| Solo | $49.00 | Monthly | `STRIPE_PRICE_SOLO` |
| Solo (annual) | $408.00 | Yearly | `STRIPE_PRICE_SOLO_ANNUAL` |
| Studio | $149.00 | Monthly | `STRIPE_PRICE_STUDIO` |
| Studio (annual) | $1,241.00 | Yearly | `STRIPE_PRICE_STUDIO_ANNUAL` |
| Agency | $299.00 | Monthly | `STRIPE_PRICE_AGENCY` |
| Agency (annual) | $2,988.00 | Yearly | `STRIPE_PRICE_AGENCY_ANNUAL` |

*(Add-ons and token packages need NO products — the app prices those inline. Skip them.)*

---

## Step 5 — Create the three webhooks

`Developers → Webhooks`.

### 5a. Platform webhook
- **+ Add endpoint** → URL: `https://app.earnest.guru/api/stripe/paymentchange`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `checkout.session.completed`
- Save → reveal **Signing secret** (`whsec_…`) → env `STRIPE_WEBHOOK_SECRET`.

### 5b. Connect webhook
- On the Webhooks page there's a toggle for **"Listen to events on Connected accounts."** Add a **separate** endpoint with that turned on.
- URL: `https://app.earnest.guru/api/stripe/connect-webhook`
- Events: `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `payout.paid`, `payout.failed`, `charge.dispute.created`
- Save → signing secret → env `STRIPE_CONNECT_WEBHOOK_SECRET`.

### 5c. CardDesk webhook
- URL: `https://<your-carddesk-host>/api/stripe/webhook`
- Events: `checkout.session.completed`
- Save → signing secret → env (CardDesk) `STRIPE_WEBHOOK_SECRET`.

---

## Step 6 — Point the Hue org at its own account (existing account stays Hue's)

Nothing to create here — the **existing** account is already Hue's and keeps all its history.

1. In the existing account: `Settings → Business → Public details` → rename public business name back to **Hue Studios** (it was "Earnest by Hue").
2. You'll connect it to the new Earnest platform **from inside the Earnest app** once the code ships: Organization → Billing → **"Connect an existing Stripe account"** → sign in to the Hue account. (I'm building that button now.)
   - If Stripe won't let you connect it because that account previously had Connect enabled, fall back to the normal "Activate payments" button to create a fresh Hue merchant account, and keep the old account purely for viewing history. We'll decide when we test it.

---

## Step 7 — Test end to end (still in Test mode)

Once I've pushed the code and you've set the Test env vars:
1. Buy a token package as a normal org → confirm it lands in the **new Earnest** account's payments.
2. Connect the Hue account (Step 6).
3. Pay a $1 Hue client invoice → confirm the money lands in the **Hue** account and there's **no** application fee (Hue is wholesale).
4. Buy CardDesk credits → confirm they land in the **new Earnest** account.

---

## Step 8 — Go Live

1. Flip the Earnest account to **Live mode** and complete activation (business + bank details).
2. Redo **Steps 2, 4, 5** in Live mode (live keys, live price IDs, live webhook secrets). Step 3's Connect Client ID also has a separate **Live** value — grab it.
3. Put the **live** values into the Production env vars (the non-`_TEST` / `_LIVE` slots). Keep test values in Preview/Development.
4. Repeat the Step 7 tests with a real $1 payment.

---

## Env var cheat sheet

**Earnest app (Vercel + `.env`)** — live keys use NO suffix, test keys use `_TEST`:
```
STRIPE_SECRET_KEY            = sk_live_…      (Live secret)
STRIPE_SECRET_KEY_TEST       = sk_test_…
STRIPE_PUBLIC_KEY            = pk_live_…      (Live publishable)
STRIPE_PUBLIC_KEY_TEST       = pk_test_…
STRIPE_WEBHOOK_SECRET        = whsec_…        (5a platform webhook)
STRIPE_CONNECT_WEBHOOK_SECRET= whsec_…        (5b connect webhook)
STRIPE_CONNECT_CLIENT_ID     = ca_…           (3 — for connecting Hue's account)
STRIPE_PRICE_SOLO            = price_…
STRIPE_PRICE_SOLO_ANNUAL     = price_…
STRIPE_PRICE_STUDIO          = price_…
STRIPE_PRICE_STUDIO_ANNUAL   = price_…
STRIPE_PRICE_AGENCY          = price_…
STRIPE_PRICE_AGENCY_ANNUAL   = price_…
STRIPE_PLATFORM_FEE_BPS      = 0              (optional; markup on non-wholesale org invoices, in basis points)
```

**CardDesk app** — note it uses `_LIVE` suffix (different convention from Earnest):
```
STRIPE_SECRET_KEY_LIVE  = sk_live_…   ← same new Earnest account
STRIPE_SECRET_KEY_TEST  = sk_test_…   ← same new Earnest account
STRIPE_PUBLIC_KEY_LIVE  = pk_live_…
STRIPE_PUBLIC_KEY_TEST  = pk_test_…
STRIPE_WEBHOOK_SECRET   = whsec_…     (5c CardDesk webhook)
```

Both apps point their keys at the **same new Earnest account** — that's how CardDesk purchases and Earnest token/subscription revenue land together.
```
```

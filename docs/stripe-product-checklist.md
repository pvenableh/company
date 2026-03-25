# Stripe Product Creation Checklist

Go to **Stripe Dashboard → Products** (https://dashboard.stripe.com/products)

Create each product below. After creating, copy the **Price ID** (`price_xxx`) into your
`.env` and Vercel env vars.

---

## Base Subscription Plans (3 products, 6 prices)

### 1. Solo
- **Product name:** Earnest Solo
- **Description:** For the one-person shop doing serious work. 1 seat, 100K AI tokens/mo, 25 scans/mo.
- **Price 1 (monthly):** $49.00/month, recurring
  - → `STRIPE_PRICE_SOLO=price_xxx`
- **Price 2 (annual):** $408.00/year, recurring
  - → `STRIPE_PRICE_SOLO_ANNUAL=price_xxx`
- [ ] Created
- [ ] Both price IDs copied to .env

### 2. Studio
- **Product name:** Earnest Studio
- **Description:** For the team that means business. 8 seats, 400K AI tokens/mo, 150 scans/mo.
- **Price 1 (monthly):** $149.00/month, recurring
  - → `STRIPE_PRICE_STUDIO=price_xxx`
- **Price 2 (annual):** $1,241.00/year, recurring
  - → `STRIPE_PRICE_STUDIO_ANNUAL=price_xxx`
- [ ] Created
- [ ] Both price IDs copied to .env

### 3. Agency
- **Product name:** Earnest Agency
- **Description:** For the business that has grown into something real. 15 seats, 1M AI tokens/mo, 500 scans/mo.
- **Price 1 (monthly):** $299.00/month, recurring
  - → `STRIPE_PRICE_AGENCY=price_xxx`
- **Price 2 (annual):** $2,491.00/year, recurring
  - → `STRIPE_PRICE_AGENCY_ANNUAL=price_xxx`
- [ ] Created
- [ ] Both price IDs copied to .env

---

## Token Refill Packages (3 products, 3 prices)

All are **one-time** payments, not recurring.

### 4. Token Refill — 100K
- **Product name:** AI Token Refill — 100K
- **Description:** 100,000 AI tokens added to your organization balance instantly.
- **Price:** $9.00, one-time
  - → `STRIPE_PRICE_TOKENS_100K=price_xxx`
- [ ] Created

### 5. Token Refill — 500K
- **Product name:** AI Token Refill — 500K
- **Description:** 500,000 AI tokens added to your organization balance instantly.
- **Price:** $39.00, one-time
  - → `STRIPE_PRICE_TOKENS_500K=price_xxx`
- [ ] Created

### 6. Token Refill — 1.5M
- **Product name:** AI Token Refill — 1.5M
- **Description:** 1,500,000 AI tokens added to your organization balance instantly.
- **Price:** $99.00, one-time
  - → `STRIPE_PRICE_TOKENS_1_5M=price_xxx`
- [ ] Created

---

## Scan Credit Packages (2 products, 2 prices)

All are **one-time** payments, not recurring.

### 7. Scan Credits — 100
- **Product name:** CardDesk Scan Credits — 100
- **Description:** 100 business card scans added to your organization balance.
- **Price:** $12.00, one-time
  - → `STRIPE_PRICE_SCANS_100=price_xxx`
- [ ] Created

### 8. Scan Credits — 500
- **Product name:** CardDesk Scan Credits — 500
- **Description:** 500 business card scans added to your organization balance.
- **Price:** $49.00, one-time
  - → `STRIPE_PRICE_SCANS_500=price_xxx`
- [ ] Created

---

## Add-On Subscriptions (6 products, 6 prices)

All are **monthly recurring**. These get added as line items to the customer's
existing subscription via `stripe.subscriptionItems.create()`.

### 9. Extra Seats (5-pack)
- **Product name:** Extra Seats (5-pack)
- **Description:** Add 5 additional team member seats to your organization.
- **Price:** $15.00/month, recurring
  - → `STRIPE_PRICE_ADDON_SEATS_5=price_xxx`
- [ ] Created

### 10. Communications
- **Product name:** Communications Add-On
- **Description:** Phone system, SMS, video conferencing, and live chat powered by Twilio.
- **Price:** $49.00/month, recurring
  - → `STRIPE_PRICE_ADDON_COMMS=price_xxx`
- [ ] Created

### 11. Client Pack Starter
- **Product name:** Client Pack Starter
- **Description:** 5 client portal seats + 50,000 client AI tokens/month. Separate from your team's token budget.
- **Price:** $29.00/month, recurring
  - → `STRIPE_PRICE_ADDON_CLIENT_STARTER=price_xxx`
- [ ] Created

### 12. Client Pack Pro
- **Product name:** Client Pack Pro
- **Description:** 10 client portal seats + 150,000 client AI tokens/month. Separate from your team's token budget.
- **Price:** $59.00/month, recurring
  - → `STRIPE_PRICE_ADDON_CLIENT_PRO=price_xxx`
- [ ] Created

### 13. Client Pack Unlimited
- **Product name:** Client Pack Unlimited
- **Description:** Unlimited client portal seats + 500,000 client AI tokens/month. Separate from your team's token budget.
- **Price:** $129.00/month, recurring
  - → `STRIPE_PRICE_ADDON_CLIENT_UNLIMITED=price_xxx`
- [ ] Created

### 14. Companion White-Label
- **Product name:** Companion White-Label
- **Description:** Custom branded subdomain on earnest.guru with your logo and colors.
- **Price:** $19.00/month, recurring
  - → `STRIPE_PRICE_ADDON_WHITE_LABEL=price_xxx`
- [ ] Created

---

## Summary

| # | Product | Type | Price | Env Var |
|---|---------|------|-------|---------|
| 1 | Solo (monthly) | Recurring | $49/mo | `STRIPE_PRICE_SOLO` |
| 2 | Solo (annual) | Recurring | $408/yr | `STRIPE_PRICE_SOLO_ANNUAL` |
| 3 | Studio (monthly) | Recurring | $149/mo | `STRIPE_PRICE_STUDIO` |
| 4 | Studio (annual) | Recurring | $1,241/yr | `STRIPE_PRICE_STUDIO_ANNUAL` |
| 5 | Agency (monthly) | Recurring | $299/mo | `STRIPE_PRICE_AGENCY` |
| 6 | Agency (annual) | Recurring | $2,491/yr | `STRIPE_PRICE_AGENCY_ANNUAL` |
| 7 | Tokens 100K | One-time | $9 | `STRIPE_PRICE_TOKENS_100K` |
| 8 | Tokens 500K | One-time | $39 | `STRIPE_PRICE_TOKENS_500K` |
| 9 | Tokens 1.5M | One-time | $99 | `STRIPE_PRICE_TOKENS_1_5M` |
| 10 | Scans 100 | One-time | $12 | `STRIPE_PRICE_SCANS_100` |
| 11 | Scans 500 | One-time | $49 | `STRIPE_PRICE_SCANS_500` |
| 12 | Extra Seats 5-pack | Recurring | $15/mo | `STRIPE_PRICE_ADDON_SEATS_5` |
| 13 | Communications | Recurring | $49/mo | `STRIPE_PRICE_ADDON_COMMS` |
| 14 | Client Pack Starter | Recurring | $29/mo | `STRIPE_PRICE_ADDON_CLIENT_STARTER` |
| 15 | Client Pack Pro | Recurring | $59/mo | `STRIPE_PRICE_ADDON_CLIENT_PRO` |
| 16 | Client Pack Unlimited | Recurring | $129/mo | `STRIPE_PRICE_ADDON_CLIENT_UNLIMITED` |
| 17 | Companion White-Label | Recurring | $19/mo | `STRIPE_PRICE_ADDON_WHITE_LABEL` |

**Total: 14 products, 17 prices** (3 base plans have 2 prices each for monthly+annual)

## After creating all products

1. Copy all price IDs to `.env` locally
2. Copy all price IDs to Vercel env vars
3. Redeploy
4. Test with Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/paymentchange
   stripe trigger checkout.session.completed
   ```

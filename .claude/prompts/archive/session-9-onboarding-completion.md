# Session 9 — Onboarding completion (Stripe checkout + welcome email + add-ons)

**Status:** Not started
**Blocker:** Session 8 should ship first — otherwise the new wizard step would render data through the unfixed leak
**Ships:** Stripe-checkout step in the org wizard + add-on selection step + welcome email
**Out of scope:** marketing-site pricing UI, full customer-portal redesign

## Prompt

Wire the missing pieces of the user-facing subscription path: the wizard creates an org and pins it, but never collects a payment method, never offers add-ons, and never emails the new owner. Right now every new org is "subscribed to Solo" in the DB with no Stripe customer/subscription on record.

TL;DR: New users register → pick org name + industry → pick plan → invite team. They're dropped on the dashboard with `plan='solo'` set in Directus but no Stripe sub. The wizard needs a payment-collection step and a triggering call to `/api/stripe/subscription/checkout`. Plus a welcome email and an optional add-on step.

### Background

- Stripe live products + prices are wired (Session 6 prep, 2026-04-28). 6 plan prices + 6 add-on prices live in Vercel env vars. Test-mode equivalents in local `.env`.
- Backend is ready: [`/api/stripe/subscription/checkout`](server/api/stripe/subscription/checkout.post.ts) creates a checkout session; [`/api/stripe/addons/subscribe`](server/api/stripe/addons/subscribe.post.ts) modifies an existing subscription line item.
- `startCheckout(priceId)` is exported from [`useSubscription.ts:112`](app/composables/useSubscription.ts:112) but never called from any page.
- Welcome email: SendGrid is configured (`SENDGRID_API_KEY` in env), there are existing transactional templates — find one to mirror.
- Wizard lives at [`organization/new.vue`](app/pages/organization/new.vue). Current 4 steps: org name+industry → location/website → plan → invite team.

### Steps

1. **Add a "Payment method" step to the wizard** between plan-selection and invite-team:
   - Reuses `selectedPlan.value` from the existing plan step
   - "Skip — start with Free" option creates the org with `plan: 'free'` and no Stripe sub. Keep this; users can upgrade later.
   - Otherwise: "Continue to payment" calls `/api/stripe/subscription/checkout` with the matching price id, redirects to Stripe Checkout. Use `success_url=/organization/new?step=invite&checkout=ok&session_id={CHECKOUT_SESSION_ID}` and `cancel_url=/organization/new?step=plan`.

2. **Handle the Stripe-Checkout return.** When the user lands back on `/organization/new?checkout=ok`:
   - Wizard restores from the persisted state (already happens via localStorage, verify)
   - Show a "Payment received — finishing up" toast, advance to the invite step
   - The `customer.subscription.created` webhook will write `plan` + `stripe_subscription_id` server-side; UI just needs to refresh `useSubscription`

3. **Add an "Add-ons" step** (optional — can ship as separate Session 9b if 9 gets long):
   - Show the 6 add-ons from `EARNEST_ADDONS` ([server/utils/stripe.ts:102](server/utils/stripe.ts:102))
   - White-label is Agency-only — gate based on `selectedPlan.value === 'agency'`
   - Selected add-ons get appended to the Stripe subscription via `/api/stripe/addons/subscribe` after checkout completes (subscription must exist first — addons are line-item adds)

4. **Welcome email.** After successful org creation in [`org/create.post.ts`](server/api/org/create.post.ts) (right before the response):
   - SendGrid template — either reuse an existing one (grep `email_templates` for an "onboarding" or "welcome" slug) or create a new one named `org_welcome`
   - Variables: `{first_name}`, `{org_name}`, `{plan}`, `{dashboard_url}` (= `${APP_URL}/`)
   - Non-fatal: wrap in try/catch, log to console on failure
   - Test send via `stripe trigger`-style local flow or via the test login

5. **Verify end-to-end:**
   - Sign up as a fresh throwaway → wizard → pick Solo monthly → enter test card 4242 4242 4242 4242 → land on dashboard with `plan='solo'`, `stripe_subscription_id` populated
   - Stripe Dashboard shows the subscription
   - SendGrid Activity shows the welcome email
   - Add-on flow (if shipped): subscribe to Extra Seats 5-pack → `org_memberships.seats` count shifts (or whatever the seat-count source is — confirm in code)

### DoD

- Payment step blocks dashboard entry unless user explicitly picks Free
- Stripe Checkout round-trips with correct success/cancel URLs
- Webhook handler updates `organizations.plan` to match the chosen tier
- Welcome email lands at the new owner's inbox
- Test card flow works end-to-end on `bun dev` (sorry, **`pnpm dev`**) against test-mode Stripe
- All existing Session-6 scenarios still pass

## Notes for Claude

- The wizard's existing localStorage persistence (`organization-new-wizard-state` or similar key) is what preserves form state across the Stripe round-trip. Verify it does — if not, persist the in-progress org-create draft to a server-side scratch table or use sessionStorage.
- `success_url` MUST include `{CHECKOUT_SESSION_ID}` literal so Stripe substitutes; you read it on return to call `/api/stripe/subscription/confirm` (or just trust the webhook).
- `STRIPE_PRICE_*` env var to price-id mapping is in [`server/utils/stripe.ts`](server/utils/stripe.ts) — reference `EARNEST_PLANS[plan].stripePriceId` (monthly) or `stripePriceIdAnnual`.
- Welcome email pattern: search `server/utils/` and `server/api/` for existing `sgMail.send` or `compileMjml` calls. The newsletter-send route [`email/newsletter-send.post.ts`](server/api/email/newsletter-send.post.ts) has the SDK wiring to copy.
- Add-ons depend on an existing subscription. Order matters: checkout first, addons second. Don't try to bundle add-ons into the same Checkout Session — Stripe's CheckoutSession allows multiple line items but the existing code paths split them.
- Demo accounts (`demo@earnest.guru`, `demo-agency@earnest.guru`) are still 403'd by `requireOrgRole` on Stripe routes. Don't regress.

# Refund & dispute reconciliation — implementation brief

Keep money, entitlements, invoices, and payment records in sync whenever a
refund or dispute occurs — across two surfaces: the **platform** (Earnest admin:
subscriptions & AI tokens) and each **organization** (client invoice payments &
disputes).

> ⚠️ Real money moves here. Gate every refund action, prefer Stripe **test
> mode**, never auto-issue refunds without an explicit trigger, and keep every
> webhook handler **idempotent** (Stripe retries + sends cumulative totals).

## Architecture context (verify before changing)

- Stripe is **split**: an Earnest **platform** account (subscriptions, AI token
  purchases) + per-org **connected** accounts (client invoice payments). See
  memory `reference_stripe_wiring`, `project_stripe_earnest_platform_split`.
- **Invoice payments** flow through `server/api/stripe/connect-webhook.post.ts`.
  A payment writes a `payments_received` row; `server/utils/recompute-invoice-status.ts`
  sums rows with `status='paid'` vs `invoice.total_amount` → `pending|processing|paid`.
- `payments_received.status` enum is only **`paid|pending`** (no `refunded`).
  Refunds/reversals are therefore modeled as a **second `payments_received` row
  with `status='paid'` and a NEGATIVE `amount`** — recompute nets it out. The
  original row's free-text `stripe_status` carries display state
  (`succeeded|refunded|partially_refunded|disputed|dispute_lost|refund`).
- `invoice.status` enum: `pending|processing|paid|archived` (no explicit
  refunded/disputed value yet).

## Done so far (in this session)

- **Refunds on invoice payments**: `charge.refunded` → `server/utils/apply-refund-adjustment.ts`
  (negative row + recompute, idempotent via cumulative-refunded delta). ✅ pre-existing.
- **Disputes on invoice payments — SCAFFOLDED**: `server/utils/apply-dispute-adjustment.ts`
  + wired into `connect-webhook.post.ts`:
  - `charge.dispute.created` → mark the payment `stripe_status='disputed'`
    (no invoice change — funds only held) + notify the org's owner/admins.
  - `charge.dispute.closed` → **won** restores `succeeded`; **lost** books a
    negative `dispute_lost` row + recomputes the invoice (reopens it). Idempotent.
  - Compiles + gates; **not yet tested end-to-end**.

## Remaining work

### A. Org invoice refunds/disputes (per-org correctness)
1. **Verify + test** the new dispute handler with Stripe test-mode disputes
   (create → close won, create → close lost, partial). Add regression tests.
2. **Explicit refunded/disputed invoice state.** Today a refund/lost-dispute
   silently drops the invoice to `pending`/`processing` — indistinguishable from
   "never paid" in reporting. Add a `refunded`/`partially_refunded` (and
   `disputed`) status value OR a `refunded_total`/`disputed` flag on `invoices`;
   set it in `recompute-invoice-status.ts`; surface it in the invoice UI +
   `/api/org/feedback` is unaffected but the money views must show it.
3. **Ops**: confirm the Connect webhook endpoint is subscribed to
   `charge.dispute.closed` (the current set may only have `dispute.created`).
   Also mirror the same refund/dispute handling in `paymentchange.ts` if it
   still processes platform charges.

### B. Platform subscriptions + AI tokens (Earnest-admin correctness) — NOT STARTED
1. Add/extend a **platform-account** Stripe webhook for `charge.refunded` and
   `charge.dispute.created/closed` on `token_purchase` + subscription charges
   (key off `metadata.type` set at checkout).
2. **Token refund → claw back** the credited tokens (inverse of
   `server/utils/fulfill-token-purchase.ts`): reduce the org's balance by the
   refunded amount, handle partials, clamp at zero, idempotent, leave an audit row.
   Enforcement lives in `server/utils/ai-token-enforcement.ts`.
3. **Subscription refund/dispute → recompute entitlement/status** (downgrade or
   flag) under `server/api/stripe/subscription/*`; notify me (platform admin).
4. **Surface it**: feed **net** revenue (minus refunds/disputes) into the
   `/platform` console + `server/api/platform/orgs.get.ts` (currently sums
   non-pending `payments_received.amount` and does NOT subtract refunds), and add
   a refunds/disputes view.

## Acceptance criteria

- Refunding an invoice payment (full & partial) → invoice status + payment rows
  + refunded state stay internally consistent; reporting shows "refunded".
- Dispute opened→lost mirrors a refund; opened→won restores the paid state.
- Refunding a token purchase reduces the balance by the refunded amount (never
  below zero), idempotently, with an audit trail.
- A refunded/disputed subscription charge recomputes entitlement + notifies me.
- All webhook handlers are idempotent (retries/dupes are no-ops).
- Real-money actions stay gated (see the guard in
  `server/api/stripe/connect/refund.post.ts`).

## Files to start from

`server/api/stripe/connect-webhook.post.ts`, `server/utils/apply-dispute-adjustment.ts`
(new, scaffolded), `server/utils/apply-refund-adjustment.ts`,
`server/utils/recompute-invoice-status.ts`, `server/api/stripe/connect/refund.post.ts`,
`server/utils/fulfill-token-purchase.ts`, `server/utils/ai-token-enforcement.ts`,
`server/api/stripe/subscription/*`, `server/api/stripe/tokens/*`,
`server/api/platform/orgs.get.ts` (net-revenue).
Memory: `reference_stripe_wiring`, `project_stripe_earnest_platform_split`,
`project_invoicing_overhaul`, `project_billing_surface_consolidation`.

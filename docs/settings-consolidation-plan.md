# Organization Settings — Consolidation Plan

Status: **draft / proposed** · Owner: Peter · Created 2026-07-21

Goal: fix the disorganized org-settings surface. Two forces cause the mess:
(1) a legacy "classic" org page still coexists with the modern Apps org hub and
duplicates most of it, and (2) org-level settings are scattered across three
top-level apps. This plan collapses everything to one home with a clear,
intent-based taxonomy.

## Current state (diagnosis)

- **Two generations coexist.**
  - Modern: `app/pages/apps/organization/index.vue` (floors via `?floor=`).
  - Legacy: `app/pages/organization/index.vue` (2,252 lines, `UTabs`). Still the
    only home for **email/transactional branding**, **whitelabel**, and **full
    Stripe Connect onboarding** — so modern floors deep-link *back* to it.
- **Org settings live in three apps:**
  - Organization (`/apps/organization`) — identity, members, teams, AI tokens, doc theme.
  - Money (`/apps/money`) — Stripe Connect, deposits, **fee settings** (`BillingSurface.vue`).
  - Marketing (`/apps/marketing`) — social account connections, HTML email builder.
- **Integrations floor** is a flat status list that only deep-links elsewhere.
- Nav source of truth is `app/composables/useAppNav.ts` (`FLOORS`), but the
  classic page defines its own local tab list, so they drift.
- Orphan settings pages: `scheduler/settings.vue`, `phone-settings.vue`,
  `social/diagnostics.vue`.

## Target taxonomy (four intent buckets)

Replace floors `overview, members, teams, billing, ai, integrations, settings`
with four buckets. Keep `useAppNav.ts` `FLOORS` as the single source; delete the
classic page's local tab list.

1. **Organization** — identity, brand, document theme, members, teams, roles.
2. **Billing & Money** — one home for BOTH Stripe relationships that are split today:
   - Platform subscription (`org.stripe_customer_id`, org → Earnest): Plan · Add-ons · Payment methods · History.
   - Connected account (`org.stripe_account_id`, clients → org): Deposits/Payouts · **Fees** · Balance.
   - This ends the Money-app / Organization-app fee split.
3. **Communications** — transactional email settings ONLY: reply-to, mailing
   address, BCC, whitelabel, branding wrapper (`server/emails/*.mjml`), email
   forwarding. **NOT** the marketing HTML email builder.
4. **Integrations** — either make each row actionable in place, or fold each
   integration into the bucket it belongs to and drop the flat list.

### Explicitly out of scope (stays put)

- **Marketing HTML/newsletter email builder** (`app/components/Newsletter/*`,
  reached via Marketing → Email) stays in the Marketing app. Only the
  *transactional* email settings move to Communications.

## Workstreams

### A. Retire the classic org page (biggest single win)

1. Port to modern floors the three things only classic has:
   - Email/transactional branding → **Communications** bucket.
   - Whitelabel toggle → Communications (or Billing add-on context).
   - Full Stripe Connect onboarding → **Billing & Money** (today only a status chip
     on the modern Integrations floor; onboarding lives in Money + classic).
2. Redirect `app/pages/organization/index.vue` → `/apps/organization` (mirror the
   already-redirecting legacy routes: `account/subscription.vue`, `social/settings.vue`).
3. Remove the classic local `tabItems`; everything reads `useAppNav.ts`.

### B. Unify billing/money

- Move `BillingSurface.vue` (fees/deposits) so it's reachable from the Billing &
  Money bucket, not only Money → Deposits.
- Keep Money app as the day-to-day operational surface, but ensure the org
  Settings Billing bucket is the canonical entry that links into it.

### C. Communications bucket

- New floor rendering the transactional-branding form (extract from classic
  `organization/index.vue` "Email Branding" section, lines ~136–161).
- Include email forwarding row (currently an Integrations tile).

### D. Integrations cleanup

- Social tiles already gated by the publishing kill-switch (see below).
- Decide per-remaining-integration: inline action vs. fold into a bucket.

## Social connections — pre-launch disable (DONE in this pass)

Social ships after launch. Mechanism already in place:

- Global kill-switch env var **`NUXT_PUBLIC_SOCIAL_PUBLISHING_ENABLED`**
  (`nuxt.config.ts` → `public.socialPublishingEnabled`). When not `'true'`:
  Marketing Accounts floor hidden, scheduled publish disabled, publish endpoints
  hard-refuse, cron no-ops.
- **Added this pass:** the org Integrations floor now also hides the five social
  connect tiles when the switch is off (`app/pages/apps/organization/index.vue`,
  `SOCIAL_INTEGRATION_KEYS` filter). Verified locally: Integrations shows only
  Stripe / Plaid / Daily / Email forwarding, no console errors.
- **Deploy note:** ensure `NUXT_PUBLIC_SOCIAL_PUBLISHING_ENABLED` is unset (or not
  `'true'`) in the production environment before launch.

## Classic-retirement gap analysis (2026-07-21)

A section-by-section audit of the classic page vs. the modern floors found these
REAL gaps that blocked retirement — capabilities that existed ONLY on classic:

- ✅ **Member role change / remove / add-existing user** — PORTED to the modern
  Members floor (role `<select>`, remove confirm modal, add-existing search modal).
- ✅ **Client portal lifecycle** (resend / revoke / restore) — PORTED as per-row
  actions on the Members floor's Client Portal Access list.
- ✅ **Archived-banner copy** ("restore from classic settings page") — updated to
  point at the Settings-floor "Manage archive" control.
- ✅ **Stripe Connect "connect an existing account" (Standard OAuth)** — DONE.
  Added a "Link an existing account" action to the Money > Deposits onboarding
  card (`connectExistingAccount` → `/api/stripe/connect/oauth-start?returnTo=money`).
  The OAuth `state` now carries the return target (`orgId|returnTo`); the
  callback routes `money` → `/apps/money?floor=deposits` and anything else →
  the legacy classic billing tab (unchanged). Money floor now also handles the
  `connect_linked`/`connect_error`/`onboarding` return query (toast + refresh +
  strip). Classic's own OAuth path is untouched (defaults to `returnTo=org`).

Redirect risks still to handle when we retire classic:
- `?tab=billing` in classic = Stripe Connect (getting paid), but modern
  `?floor=billing` = SaaS subscription. Inbound links (`useNavPreferences.ts`,
  `payouts.vue`) must route to `/apps/money?floor=deposits`, NOT a blind tab→floor map.
- `/organization?tab=ai-usage` (TokenManagementModal) → `/apps/organization?floor=ai`.
- ~12 inbound links to `/organization` to repoint (see gap-analysis notes).

## Sequencing

1. ✅ Gate social connect UI.
2. ✅ Communications bucket (transactional branding extracted to Email floor).
3. ✅ Member & client management ported to modern Members floor (archived-banner
   copy fixed).
4. ✅ Stripe Connect "link existing account" OAuth → modern Money Deposits home.
   ALL classic capability gaps are now closed — classic is ready to retire.
5. ⬜ Retire classic page + redirect (repoint the ~12 inbound links; handle the
   `?tab=billing` → Money-deposits semantic; `?tab=ai-usage` → `?floor=ai`).
6. ⬜ Integrations cleanup.

Each is an independent PR; the taxonomy in `useAppNav.ts` lands first so floors
have a home to move into.

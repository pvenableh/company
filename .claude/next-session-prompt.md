# Next session: Apps Layout — Phase 5 (Marketing app)

Phases 0–4 are on `main` and pushed:

- `187e6b0` Phase 0 — ResponsiveModal + modal sweep
- `a57a73f` Phase 1 schema — `users.layout_mode` + `app_rail_position`
- `3b73be8` Phase 1 scaffolding — apps.vue, AppRail, AppHeader, AppSlideOver
- `adea7cc` Phase 2 shell — `/apps/clients/index.vue` + AppHeader showBack rework
- `07343aa` Phase 2 detail — `/apps/clients/[id].vue` + slide-over + Messages mirror
- `79fa15f` Phase 3 — Work app shell + floor strip (Gantt/Projects/Tasks/Tickets/Meetings/Calendar)
- `fc32619` Phase 4 — Money app shell + floor strip (Cash flow/Invoices/Payments/Expenses/Time)

Canonical templates:
- `/apps/clients/[id].vue` for noun-shaped detail pages.
- `/apps/work/index.vue` for single-page floor-strip landings (multiple
  parallel views over related work surfaces).
- `/apps/money/index.vue` for floor strips that include both summary
  (Cash flow KPIs + AR aging) and underlying log views (Invoices/
  Payments/Expenses/Time). Money is closer to what Marketing will be —
  a campaign-pulse summary up front, then channel-specific feeds.

Per project memory: bind preview to `127.0.0.1:3000`, use `preview_*`
tools, never bash/curl/Playwright.

---

## Phase 5 deliverables

### A. Routes under `/apps/marketing/`

Create alongside (not replacing) `app/pages/marketing/index.vue`,
`app/pages/social/`, `app/pages/email/`, etc. Classic users keep flat
sidebar entries.

- `app/pages/apps/marketing/index.vue` — landing. `definePageMeta({
  layout: 'apps', middleware: ['auth'] })`. Pill-segmented floor strip:
  - **Pulse** (default) — KPI strip + active-campaigns Gantt + the
    recommendation feed (`marketing_recommendations`) + last-7-days
    activity. Mirrors what the existing /marketing redesign (Session 22)
    landed inline; pull a self-contained variant if one exists.
  - **Campaigns** — list of `marketing_campaigns` (status filter,
    search, table). Drill into classic `/marketing/[id]` (or whichever
    detail route exists — verify before assuming).
  - **Email** — drafts/sent campaigns, opens/clicks/bounces. Reuse the
    existing email pages' list components if exported, or inline a
    table similar to the Money Invoices floor.
  - **Social** — posts grouped by platform with engagement counters,
    next-scheduled queue. Drill into classic `/social/[id]`. Include
    the platform logos from `@iconify-json/logos` per memory.
  - **Audience** — contacts segments, mailing lists. (`mailing_lists` +
    contacts.lifecycle/status). Could fold in a recipient-targeting
    preview if cheap.
- Detail pages: don't build new ones. Drill into classic routes.

Multi-home decision (document in commit + memory):
- A campaign tagged `client = Acme` should appear in Marketing > Campaigns
  (canonical) AND on `/apps/clients/[id]` (Marketing tab? or rolled into
  Activity feed? — match what Phase 3 chose for tasks/meetings: keep
  client detail tabs at five and use Activity for cross-noun chronology).

### B. AppRail wiring

`AppRail.vue` already routes to `/apps/marketing`. Verify:

- Toggle to apps mode → click "Marketing" in rail → land on
  `/apps/marketing` with apps shell + Pulse floor.
- The Vue Router warning `No match found for location with path
  "/apps/marketing"` (currently logged on every preview load) goes away
  once this page exists.
- Floor strip switches in-place without remounting the shell.

### C. Re-use, don't rebuild

- KPIs / pulse — there's existing widget code on `/marketing` and in
  `MarketingPulseWidget` / `MarketingActionsWidget`; pull a self-
  contained variant if one exists.
- Recommendation feed — backed by `marketing_recommendations` collection
  (Session 22). Should render as a chronological feed with accept/dismiss
  actions if those routes already exist.
- Active-campaigns Gantt — reuse Clean Gantt component used on the
  current `/marketing` redesign.
- Social posts — reuse existing social-feed grid component.
- Audience — reuse contacts/lists components (Insights tab from
  Session 26's `/contacts?view=insights` consolidation).

### D. Decisions to make in-flight

- Does Marketing deserve a dedicated **Compose** floor, or does
  composing always live as a slide-over / modal launched from the rail
  header action button? (Recommend: header action button per floor —
  "New Campaign" on Campaigns floor, "New Post" on Social, "New Email"
  on Email — matching the Money pattern.)
- Does the **Pulse** floor surface a per-campaign drill-down inline, or
  always push to a detail route?
- Should `mailing_lists` be its own floor, or live inside Audience?

### E. Out of scope

- Classic `/marketing`, `/social`, `/email`, `/contacts` trees.
- Slide-over edits (Phase 7).
- Other apps (`/apps/organization` is Phase 6 — last to land).
- Hat code migration.

---

## Verification

1. Toggle apps mode → click "Marketing" in rail → land on
   `/apps/marketing` with Pulse floor.
2. Floor strip switches in-place without remounting the shell.
3. Drilling into a campaign row reaches a working detail page (classic
   /marketing/[id] or wherever marketing detail lives).
4. Classic toggle → `/marketing`, `/social`, `/email` still work.
5. No new hydration mismatches.
6. The `/apps/marketing` router warning disappears.

---

## Suggested commits (floor of two)

1. `feat: Marketing app shell — /apps/marketing landing + Pulse floor`
2. `feat: Marketing app sub-floors — Campaigns/Email/Social/Audience`

Split further if Pulse's KPI strip + recommendation feed + Gantt is
large enough to warrant its own commit.

---

## Phase 6 (next, last) — Organization app

After Marketing lands, Phase 6 closes out the apps layout with the
**Organization** app:

- Floor strip: Overview / Members / Billing / Integrations / Settings.
- All five floors map to existing `/organization/*` and `/account/*`
  surfaces — mostly a re-shell + nav re-org, no new data layers.

Once Phase 6 ships, AppRail covers all 5 apps and the Vue Router
warnings clear. Phase 7 (slide-over edits, polish, multi-home Activity
feeds) is the after-launch tail.

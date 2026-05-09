# Next session: Apps Layout — Phase 6 (Organization app, last)

Phases 0–5 are on `main` and pushed:

- `187e6b0` Phase 0 — ResponsiveModal + modal sweep
- `a57a73f` Phase 1 schema — `users.layout_mode` + `app_rail_position`
- `3b73be8` Phase 1 scaffolding — apps.vue, AppRail, AppHeader, AppSlideOver
- `adea7cc` Phase 2 shell — `/apps/clients/index.vue` + AppHeader showBack rework
- `07343aa` Phase 2 detail — `/apps/clients/[id].vue` + slide-over + Messages mirror
- `79fa15f` Phase 3 — Work app shell + floor strip (Gantt/Projects/Tasks/Tickets/Meetings/Calendar)
- `fc32619` Phase 4 — Money app shell + floor strip (Cash flow/Invoices/Payments/Expenses/Time)
- `3c72be2` Phase 5 — Marketing app shell + floor strip (Pulse/Campaigns/Email/Social/Audience)

Phase 6 closes the apps layout. After this, AppRail covers all 5 apps and
the Vue Router warning `No match found for location with path
"/apps/organization"` clears.

Canonical templates:
- `/apps/clients/[id].vue` for noun-shaped detail pages.
- `/apps/work/index.vue` for single-page floor-strip landings.
- `/apps/money/index.vue` for floor strips with summary up front + log
  views below.
- `/apps/marketing/index.vue` for floor strips that lazy-load per floor
  and reuse classic detail routes for drill-downs.

Per project memory: bind preview to `127.0.0.1:3000`, use `preview_*`
tools, never bash/curl/Playwright. The Nuxt 4.4.2 dev server hides syntax
errors as `IPC connection closed`; if a 500 lands, run `pnpm typecheck`
first instead of chasing infra.

---

## Phase 6 deliverables

### A. Routes under `/apps/organization/`

Create alongside (not replacing) `app/pages/organization/*.vue` and
`app/pages/account/*.vue`. Classic users keep flat sidebar entries.

- `app/pages/apps/organization/index.vue` — landing.
  `definePageMeta({ layout: 'apps', middleware: ['auth'] })`. Pill-segmented
  floor strip. Mostly a re-shell over existing organization/account
  surfaces — no new data layers.

  Floors:
  - **Overview** (default) — org name + logo + brand snapshot, plan/seat
    KPIs, members count, integrations status chips. Pull the "Brand &
    Strategy" + "Info" sections from `app/pages/organization/index.vue`
    (search for `slot: 'overview'` and the matching template block) into
    a self-contained variant. This floor is read-mostly with an "Edit
    organization" header action.
  - **Members** — org members table + Client Access table. Reuse the
    Members + Client Access UI from `app/pages/organization/index.vue`
    (slots `members` and `client-access`) and `app/pages/organization/teams.vue`
    if it shares components. Header action: "Invite member".
  - **Billing** — subscription, plan, seats, payment method, invoice
    history. Pull from `app/pages/account/subscription.vue` and the
    `billing` slot in `app/pages/organization/index.vue`. Header action:
    "Manage plan" → Stripe portal.
  - **Integrations** — connection chips for Stripe Connect, Plaid (if
    entitled), Daily, Meta/LinkedIn/TikTok/IG/FB social accounts (link
    out to `/social/settings`), Google/email forwarding via name.com.
    Status pill per row + Reconnect/Manage buttons.
  - **Settings** — document themes + brand assets, AI usage, danger zone
    (archive org). Pull from the `ai-usage` slot + the document/branding
    sections + danger-zone block. Header action: none (settings inline).

  Sub-routes that already exist (`/organization/teams.vue`,
  `/organization/roles.vue`, `/organization/document-blocks.vue`,
  `/organization/service-templates.vue`, `/organization/[id].vue`) stay
  classic — drill into them from the relevant floor (e.g. Members floor
  → "Manage Teams" link → `/organization/teams`).

  Account-only screens (`/account` profile + avatar) are deliberately
  separate; they belong to the user, not the org. Keep `/account` and
  `/account/subscription` reachable via the avatar dropdown in the apps
  shell — don't fold them into the Organization app.

### B. AppRail wiring

`AppRail.vue` already routes to `/apps/organization`. Verify:

- Toggle to apps mode → click "Organization" in rail → land on
  `/apps/organization` with apps shell + Overview floor.
- The Vue Router warning `No match found for location with path
  "/apps/organization"` (currently logged on every preview load) goes
  away once this page exists.
- Floor strip switches in-place via `?floor=` query param, never
  remounting the shell — same pattern as Money/Marketing.

### C. Re-use, don't rebuild

- Members table — there's an existing block in
  `app/pages/organization/index.vue` around the `members` slot. Extract
  inline; don't repaint.
- Billing — `app/pages/account/subscription.vue` is the source of truth
  for the Stripe portal launch + plan UI. Re-import it as a chunk if
  cleanly separable, or duplicate the relevant section.
- Integrations status — derive from existing endpoints
  (`/api/social/accounts`, Stripe Connect status route, Plaid entitlement
  check). No new APIs.
- Document themes/branding — already lives under the `branding` /
  `theme` sections of `organization/index.vue`. Re-shell, don't redesign.
- Danger zone — the archive org button + retention countdown ships
  unchanged.

### D. Decisions to make in-flight

- Per-floor header action button (matching Money/Marketing) vs. a single
  global "Edit organization" button at the top? Recommend per-floor
  ("Invite Member" on Members, "Manage Plan" on Billing, etc.).
- Should **AI Usage** get its own floor or live inside Settings?
  Recommend: inside Settings as a sub-section unless the data is
  voluminous enough to warrant a dedicated floor (it's a single chart +
  table today — Settings is fine).
- Where do **Roles** + **Document Blocks** + **Service Templates**
  appear? They have classic pages (`/organization/roles`, etc). Surface
  them as link tiles inside Settings, not new floors — they're admin
  tooling, not daily-use.

### E. Out of scope

- Classic `/organization/*` and `/account/*` trees — keep them all alive
  for the sidebar mode.
- Slide-over edits (Phase 7).
- `/apps/clients`, `/apps/work`, `/apps/money`, `/apps/marketing` —
  already shipped.
- Hat code migration.
- Any changes to Stripe Connect onboarding flow, Plaid linkage flow, or
  social OAuth paths — Organization app is a viewing/management surface,
  not an onboarding rebuild.

---

## Verification

1. Toggle apps mode → click "Organization" in rail → land on
   `/apps/organization` with Overview floor.
2. Floor strip switches in-place without remounting the shell.
3. Members floor shows real org members; "Invite member" header action
   opens the existing invite modal.
4. Billing floor's "Manage Plan" launches Stripe portal in a new tab.
5. Integrations floor's status chips match what the classic pages show
   (Stripe Connect KYC state, social account counts, etc).
6. Settings floor's links into `/organization/teams` /
   `/organization/roles` / `/organization/document-blocks` /
   `/organization/service-templates` work.
7. Classic toggle → `/organization`, `/account`, `/account/subscription`
   all still work unchanged.
8. The `/apps/organization` router warning disappears.
9. After Phase 6 ships, no remaining `No match found for location with
   path "/apps/*"` warnings should appear in the dev console.

---

## Suggested commits (floor of two)

1. `feat: Organization app shell — /apps/organization landing + Overview floor`
2. `feat: Organization app sub-floors — Members/Billing/Integrations/Settings`

Split further if any single floor grows large (Billing in particular —
Stripe portal handoff + plan UI may want its own commit).

---

## After Phase 6: Phase 7 (post-launch tail)

With all 5 apps live, Phase 7 is polish + cross-cutting features that
were intentionally deferred:

- Slide-over edits across all apps (Phase 2 only landed the Clients
  detail slide-over pattern).
- Multi-home Activity feeds — chronological cross-noun roll-up on
  `/apps/clients/[id]` so meetings/tasks/marketing-touches show up in a
  single timeline rather than separate tabs.
- AppRail polish — bottom + floating positions (currently TODO in
  `AppRail.vue`).
- Hat code migration — apps mode currently bypasses `useHatLayout`; if
  we keep both paradigms, hats need an apps-mode equivalent or an
  explicit deprecation.
- Cleanup pass: drop the classic `/marketing-feed` + `/marketing-timeline`
  flat routes if drill-down via `/apps/marketing` is the canonical path
  (currently they redirect/remain).

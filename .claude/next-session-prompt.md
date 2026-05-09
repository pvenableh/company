# Next session: Apps Layout — Phase 2 (Clients app)

Phase 1 is on `main` and pushed:

- `a57a73f` "feat: users.layout_mode + app_rail_position schema"
- `3b73be8` "feat: Apps Layout Phase 1 — shell scaffolding + preview toggle"

The shell renders cleanly with left/top/right rails, the account toggle
round-trips, classic mode is untouched. Verified live 2026-05-08. **No
app routes opt into `layout: 'apps'` yet** — that's Phase 2's job.

Phase 2 lands the **Clients** app: the first real route inside the apps
shell. Doubles as the canonical pattern that Work / Money / Marketing /
Org will mirror in Phases 3-6.

Per project memory: bind preview to `127.0.0.1:3000`, use `preview_*`
tools, never bash/curl/Playwright.

Read `project_apps_layout_plan.md` for the locked decisions before
starting. The Clients app's slot is defined there — don't re-litigate.

---

## Phase 2 deliverables

### A. New routes under `/apps/clients/`

Create the Clients-app entry point and detail page **alongside** (not
replacing) the existing `app/pages/clients/index.vue` and `[id].vue`.
The classic routes stay live for users who haven't flipped the toggle.

- `app/pages/apps/clients/index.vue` — landing list. Uses
  `definePageMeta({ layout: 'apps', middleware: ['auth'] })`.
  Top-of-page toggle: **By Client / All Contacts / Partners**
  (segmented control). Shares the row component with the classic
  `/clients` if practical — extract a `ClientsListRows.vue` rather
  than dual-maintaining markup.
- `app/pages/apps/clients/[id].vue` — detail page. Tabs (pill segmented
  control, not UTabs):
  - **Contacts** (default)
  - **Projects**
  - **Invoices**
  - **Partners**
  - **Messages**
  Each tab is a child component you can lift from existing client-detail
  pieces. Phase 2 isn't a rewrite — wire the existing data sources, just
  re-shell them to read inside the apps layout.

Use `<AppHeader>` for the top strip on each page (title + actions slot
for "+ New Client" etc.). The back chevron should auto-render on the
detail page.

### B. Layout dispatch — pick `apps` vs `default` per user

Right now a page's `layout` is hard-coded. We want a single Clients
route that flips between layouts based on `useAppsMode().isAppsMode`.
Two reasonable shapes:

1. **Two parallel route trees** (what the deliverables above assume):
   `/clients/*` keeps `layout: 'default'`, `/apps/clients/*` uses
   `layout: 'apps'`. The Spaces sidebar links classic-mode users to
   `/clients`; the AppRail links apps-mode users to `/apps/clients`.
   Pro: clean, no middleware. Con: two URL spaces.
2. **One route tree + middleware**: page declares no static layout;
   a `layout-resolver.global.ts` middleware sets `setPageLayout(...)`
   based on `isAppsMode`. Pro: one URL. Con: middleware reads from
   user-scoped composable; must be client-only or accept SSR fallback
   to classic.

**Default to (1) for Phase 2** — it's mechanical and reversible. We can
collapse to (2) in Phase 7 polish once all five apps exist and a single
URL space starts paying dividends.

### C. AppRail wiring

`AppRail.vue` currently links to `/apps/clients`, `/apps/work`, etc.
The dead links become live as each phase lands. After Phase 2,
clicking "Clients" in the rail must:

- Land on `/apps/clients`
- Highlight the Clients icon (already handled by activeId logic)
- Render inside `apps.vue`

No change to `AppRail.vue` should be needed — verify it works.

### D. Multi-home rule (per memo)

Channels, meetings, tasks live canonically in one app and **mirror**
into client scope. The Clients detail page's **Messages** tab is the
mirror surface for channels tagged with this client. Shared component:
re-use the existing channel list, filtered by `client = :id`. Don't
duplicate; just scope.

### E. Slide-over the first thing that's "one deep"

When the user clicks a contact row inside the Contacts tab, open a
right-side `<AppSlideOver>` showing the contact's details (read-only
for Phase 2). Edits still push to the full classic page until Phase 7.
This proves the slide-over teleport target works end-to-end.

### F. Smoke-test page sweep

Delete `app/pages/apps-test.vue` if it somehow came back (it shouldn't
have — Phase 1 cleaned it up). Confirm `/apps/clients` and
`/apps/clients/[id]` render under `layout: 'apps'` without the IPC mask
500.

---

## Verification

1. Toggle apps mode in /account → Layout. Click "Clients" in the rail.
   Land on `/apps/clients` with the apps shell.
2. Click a client row → `/apps/clients/[id]` with tabs. Default tab
   Contacts shows the same data as the classic page.
3. Click a contact → AppSlideOver opens right-side, fills with that
   contact's read-only details, swipe-out closes it.
4. Toggle to classic → /clients still works exactly as before.
5. Hydration is clean (no SSR ↔ client mismatch errors beyond the
   pre-existing app-wide ones flagged in project memory).

## Out of scope

- Touching the classic `/clients/*` routes beyond extracting shared row
  components. That tree must keep working.
- Editing flows inside slide-overs (Phase 7).
- The other four apps. Work lands in Phase 3.
- Migrating `useNavPreferences` / hat code. Apps mode is purely
  additive; classic users see zero behaviour change.

---

## Branch & commit hygiene

- Work directly on `main`. Tip is `3b73be8` (Phase 1 ship).
- Plaid bank-sync work parked on `claude/plaid-phase1-bank-sync`.

## Suggested final commits

Keep the diff readable. Two commits is the floor:

1. `feat: Clients app shell — /apps/clients list + detail tabs`
   (parts A + C + F)
2. `feat: Clients app slide-over + Messages mirror`
   (parts D + E)

If A grows large (likely — the detail page has 5 tabs), split it again:
list page first, then detail. Don't push until end-to-end verification
passes.

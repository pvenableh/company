# Next session: Apps Layout — Phase 7 (post-launch tail)

Phases 0–6 are on `main` and pushed:

- `187e6b0` Phase 0 — ResponsiveModal + modal sweep
- `a57a73f` Phase 1 schema — `users.layout_mode` + `app_rail_position`
- `3b73be8` Phase 1 scaffolding — apps.vue, AppRail, AppHeader, AppSlideOver
- `adea7cc` Phase 2 shell — `/apps/clients/index.vue` + AppHeader showBack rework
- `07343aa` Phase 2 detail — `/apps/clients/[id].vue` + slide-over + Messages mirror
- `79fa15f` Phase 3 — Work app shell + floor strip
- `fc32619` Phase 4 — Money app shell + floor strip
- `3c72be2` Phase 5 — Marketing app shell + floor strip
- `4bedf97` Phase 6 — Organization app shell + 5-floor strip

All 5 apps live; AppRail covers every app. The `No match found for
location with path "/apps/*"` warning is gone.

Phase 7 is **polish + cross-cutting features intentionally deferred**.
It is not one cohesive ship — it is 5 independent tracks. Pick the
order that maximizes leverage; ship each track as its own commit.

Per project memory: bind preview to `127.0.0.1:3000`, use `preview_*`
tools, never bash/curl/Playwright. Nuxt 4.4.2 hides syntax errors as
"IPC connection closed"; if a 500 lands, run `pnpm typecheck` first.

---

## Track A — Slide-over edits across all apps

Phase 2 only landed `AppSlideOver` for `/apps/clients/[id]`. Other apps
still push to a full route on every edit. Decide where slide-overs add
value vs. where pushing is right.

**Heuristic:** slide-over for *one-deep edits inside an app context*
(e.g. editing a project from the Work Gantt floor without losing the
Gantt view). Push for *navigating to a different noun* (e.g. project →
client). Existing FormModal/ResponsiveModal usages stay — they're the
right pattern for self-contained create flows.

Concrete candidates:
- `/apps/work` — project edit, task edit, ticket edit slide-overs from
  any of the floor lists. Today: row click pushes to `/projects/[id]`
  etc. Recommend a row click → slide-over for view/quick-edit, with a
  "Open full page" link for two-deep flows (drilling into tasks of a
  project).
- `/apps/money` — invoice line-item edit. Today: opens classic
  InvoicesFormModal which already uses ResponsiveModal — likely fine,
  no change needed. Confirm by walking the cash-flow → unpaid invoice
  → edit flow.
- `/apps/marketing` — campaign quick-edit (status, dates, goal) from
  the Pulse "Active campaigns" or Campaigns floor without leaving for
  `/marketing-timeline`. Bigger campaign edits stay on the timeline.
- `/apps/organization` — member role change inline (already inline on
  the Members floor — verify it works without a slide-over). Stripe
  Connect onboarding stays full-page (Stripe redirects out anyway).

Out of scope: stacking slide-overs (Phase 7 stays one-deep — see
`project_apps_layout_plan.md` for the depth rules).

## Track B — Multi-home Activity feed on `/apps/clients/[id]`

Today the client detail page tabs separate Messages / Projects /
Invoices / Marketing / Tickets / Meetings. Add a unified **Activity**
tab (chronological, paginated) so a single timeline shows everything
that touched the client recently.

Sources to roll up (all already exist server-side):
- `meeting_notes` (tied via `meeting.related_organization`)
- `tasks` (created/completed timestamps)
- `marketing_touches` (per-contact send events)
- `invoices` (created, paid)
- `tickets` (opened, closed)
- `messages` (last contact)
- `appointments`
- `project_events`

Implementation hints:
- Don't write a new aggregation table. Compose at read time — fan out
  per-source queries with org+client filters, merge by date desc,
  paginate. Reuse the AI context-broker shape (`server/utils/context-broker/`) where overlaps exist.
- Filter chips at the top of the tab: All / Meetings / Money /
  Projects / Marketing / Comms.
- Each row links to its canonical detail route — Activity is a feed,
  not an editor.
- Add `?tab=activity` to the existing tab routing on the detail page.
- This is the foundation for Phase 8's notion of an org-wide Activity
  view, but scope here is **client-scoped only**.

Out of scope: cross-org activity, full-text search over the feed,
saved filters.

## Track C — AppRail polish (bottom + floating positions)

`AppRail.vue` already supports `left`, `right`, `top`. Bottom and
floating are TODOs. The schema field `users.app_rail_position` already
exists from Phase 1.

Deliverables:
- **Bottom mode** — horizontal strip pinned to bottom of viewport
  (mobile-friendly; mirrors iOS tab bar). Reuse the existing
  `app-rail--horizontal` styles, add `app-rail--bottom` positioning.
- **Floating mode** — drag-snap pill that user can dock to any edge
  (top/bottom/left/right). Uses `position: fixed`. Persist edge
  preference back to `users.app_rail_position` (extend the union to
  include `floating-*` variants or add a separate `app_rail_dock`
  field — pick whichever is cleaner).
- Position picker UI: surface inside `/apps/organization` Settings
  floor under a new "Layout" tile, OR in the user-avatar dropdown
  (recommend the avatar dropdown — it's user-scoped, not org-scoped).
- Mobile breakpoint: force bottom on `< md` regardless of preference.

Out of scope: rail width/density customization, custom app reordering.

## Track D — Hat code migration / decision

Apps mode currently bypasses `useHatLayout` entirely. Hats (Default /
PM / Accountant / Salesman / Marketing Manager — see Session 25 in
memory) only function in classic flat-sidebar mode.

Decision required: **deprecate hats** or **keep them as a parallel
paradigm**.

Recommend: **deprecate.** Apps already fragment surfaces by role
(Money for the Accountant, Marketing for the Marketing Manager, Work
for the PM, Clients for the Salesman, Organization for the Owner).
Hats were a vibe-mode that re-skinned the sidebar; apps are
role-shaped destinations. Two paradigms doing the same job will
confuse users.

If deprecating:
- Remove `SpacesSidebar` hat-switcher UI.
- Mark `useHatLayout` deprecated (keep file for one release in case
  classic users have it persisted, then delete).
- Drop `data-hat` references in components if any (memory says Layer
  2 was deferred — likely zero adoption).
- Surface app-mode toggle prominently in the avatar dropdown so
  classic users can find their way to apps.

If keeping:
- Wire hats to apps mode by mapping each hat to a default app +
  preferred floor (e.g. Accountant hat → `/apps/money?floor=cashflow`).
- Document the dual-paradigm explicitly in CLAUDE.md.

## Track E — Cleanup pass: drop legacy flat routes

Some classic routes are now fully covered by their app counterparts.
Audit and drop or redirect:

- `/marketing-feed` — already redirects per memory; confirm it's
  reachable only via stale links and remove the route file if no
  callers found via `grep`.
- `/marketing-timeline` — currently the drill-down target for
  campaigns from `/apps/marketing`. **Don't drop this one** — the apps
  page explicitly defers to it for campaign detail. Revisit only if a
  proper `/apps/marketing/campaigns/[id]` is built.
- `/people` — already merged into `/contacts?view=insights` per memory
  (Session 26). Confirm and remove if redirect-only.
- Any `/organization/*` sub-route that became a settings tile target
  in Phase 6 (Teams, Roles, Document Blocks, Service Templates) —
  **keep** — they're admin tooling and the apps Settings floor
  intentionally links to them.

Also: drop the hidden `people` collection ~2026-05-12 per the memory
"Next up" note.

---

## Verification

Per-track verification (each track is independent):

**Track A** — Click an edit affordance on each app's primary floor.
Confirm slide-over opens, edit persists, slide-over closes without
remounting the floor's data. Verify two-deep navigation pushes to a
full page (slide-overs don't stack).

**Track B** — `/apps/clients/[id]?tab=activity` shows merged
chronological feed. Filter chips narrow correctly. Each row links to
its canonical detail page. Pagination works without re-fetching the
top.

**Track C** — Toggle through left/right/top/bottom/floating in user
prefs. Each persists across reload. Mobile (< md) forces bottom.
Floating mode drag-snaps to nearest edge.

**Track D** — If deprecating: hat-switcher removed from sidebar, app
mode toggle visible in avatar dropdown, no console errors from
removed `useHatLayout` callers. If keeping: each hat lands on its
mapped app+floor.

**Track E** — `pnpm grep "marketing-feed"` returns zero non-redirect
callers before deletion. Same for `/people`. Removed routes 404
cleanly (or redirect with a deprecation log).

---

## Suggested commits (one per track)

1. `feat: AppSlideOver adoption across Work + Marketing apps`
2. `feat: Activity feed on /apps/clients/[id]`
3. `feat: AppRail bottom + floating positions`
4. `chore: deprecate hat layouts in favor of apps mode` (or
   `feat: hat → apps mode bridging`)
5. `chore: drop legacy flat routes superseded by apps`

Split further if any track grows large. Track B (Activity feed) is the
most likely to be its own multi-commit ship.

---

## After Phase 7

With apps complete and the polish tail shipped, the apps-layout
project is **closed**. Anything further should be its own initiative
(e.g. "Activity feed v2 — org-scoped + saved searches" or "Mobile
shell"). The `project_apps_layout_plan.md` memory can be archived
once Track D's hat decision lands.

Ongoing items not part of Phase 7 — see the "Next up" memory:
- name.com email forwarding (user-only, manual)
- OAuth video submission to Google/LinkedIn/Meta/TikTok (user-only)
- Drop hidden `people` collection ~2026-05-12
- Spawned audit: non-tenant-scoped queries in
  `useAIProductivityEngine` — needs per-collection FK-walk or
  Directus perm verification
- Session-7b chat-sessions cold-load (deferred, low priority)

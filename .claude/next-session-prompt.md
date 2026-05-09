# Next session: Apps Layout — Phase 3 (Work app)

Phases 0+1+2 are on `main` and pushed:

- `187e6b0` Phase 0 — ResponsiveModal + modal sweep
- `a57a73f` Phase 1 schema — `users.layout_mode` + `app_rail_position`
- `3b73be8` Phase 1 scaffolding — apps.vue, AppRail, AppHeader, AppSlideOver
- `adea7cc` Phase 2 shell — `/apps/clients/index.vue` + AppHeader showBack rework
- `07343aa` Phase 2 detail — `/apps/clients/[id].vue` + slide-over + Messages mirror

The Clients app is the canonical template. Verified live 2026-05-08.

Phase 3 lands the **Work** app: a unified-Gantt landing with the floor
strip Projects / Tasks / Tickets / Meetings / Calendar.

Per project memory: bind preview to `127.0.0.1:3000`, use `preview_*`
tools, never bash/curl/Playwright.

Read `project_apps_layout_plan.md` for the locked decisions before
starting. Mirror the Clients pattern (parallel route trees, explicit
`:show-back`, Sheet handles its own portaling — don't fight it).

---

## Phase 3 deliverables

### A. Routes under `/apps/work/`

Create alongside (not replacing) the existing `app/pages/projects/`,
`app/pages/tasks*`, `app/pages/tickets/`, `app/pages/meetings/`,
`app/pages/scheduler/`. Classic users keep their flat sidebar entries.

- `app/pages/apps/work/index.vue` — landing. `definePageMeta({ layout:
  'apps', middleware: ['auth'] })`. Pill-segmented floor strip:
  - **Gantt** (default) — unified timeline view across projects,
    tasks, tickets. Re-use whatever the existing project-timeline /
    Clean Gantt component is; just reshell into apps layout.
  - **Projects**
  - **Tasks**
  - **Tickets**
  - **Meetings**
  - **Calendar**
- Detail pages: don't build new ones in Phase 3. Clicking a project
  row should still push to the classic `/projects/[id]` for now (or a
  thin `/apps/work/projects/[id]` wrapper if a detail surface is
  cheap). The locked rule is: two-deep navigation = full-page push,
  not stacked slide-overs.

Each floor uses `<AppHeader title="Work" :show-back="false">` on the
landing (no chevron), and `<AppHeader :title="..." :show-back="true"
back-label="Work">` on any /apps/work/<sub> page.

### B. AppRail wiring

`AppRail.vue` already routes to `/apps/work`. After Phase 3:

- Land on `/apps/work` with the apps shell.
- "Work" icon highlighted.
- Floor strip swap doesn't reload the shell.

No change to `AppRail.vue` should be needed — verify it works.

### C. Multi-home rule

A meeting tagged `client = Acme` should show in:
- Work > Meetings (canonical)
- Acme > Messages tab? — meetings aren't currently a Messages-tab
  surface. **Decision needed**: do meetings need their own tab on
  client detail in Phase 7, or is the Activity feed enough? Document
  in project memory either way.

A task assigned to a client should appear in Work > Tasks (canonical)
and likely a future Tasks tab on client detail (defer to Phase 7).

### D. Out of scope

- Touching classic `/projects/*`, `/tasks*`, `/tickets/*`,
  `/meetings/*`, `/scheduler/*` except for extracting genuinely shared
  data composables. Those trees keep working.
- Editing flows inside slide-overs (Phase 7).
- The other three apps (Money / Marketing / Organization).
- Migrating `useNavPreferences` / hat code.

---

## Verification

1. Toggle apps mode in /account → Layout. Click "Work" in the rail.
   Land on `/apps/work` with the apps shell + Gantt view.
2. Floor-strip switching renders each surface in-place without
   re-mounting the shell.
3. Drilling into a project row goes to a working detail page (apps or
   classic — pick one, document it).
4. Toggle to classic → /projects, /tasks, /tickets still work as
   before.
5. Hydration is clean (no SSR ↔ client mismatch errors beyond the
   pre-existing ones flagged in project memory).

---

## Branch & commit hygiene

- Work directly on `main`. Tip is `07343aa` (Phase 2 ship).
- Plaid bank-sync work parked on `claude/plaid-phase1-bank-sync`.

## Suggested final commits

Keep the diff readable. Two commits is the floor:

1. `feat: Work app shell — /apps/work landing + floor strip`
   (parts A floor-strip + B + F)
2. `feat: Work app sub-floors — Projects/Tasks/Tickets/Meetings/Calendar`
   (parts A floor content)

If A grows large (likely — the unified Gantt is the headline view),
split it again: Gantt landing first, then sub-floors. Don't push until
end-to-end verification passes.

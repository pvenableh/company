# Next session: Apps Layout — Phase 1 (apps shell scaffolding)

Phase 0 is on `main` and pushed (commit `187e6b0` "feat: Apps Layout
Phase 0 — ResponsiveModal + modal sweep", on top of `119663c` perf
wiring). Both rode out behind `users.layout_mode` defaulting to classic
for everyone, so production behaviour is unchanged for current users —
they just inherited the modal-width upgrade and a hidden picker.

Phase 1 builds the parallel apps shell. **No app content yet** — just the
scaffolding + the "Try Apps Layout (preview)" toggle. Phases 2-6 fill the
five apps one at a time.

Per project memory: bind preview to `127.0.0.1:3000`, use `preview_*`
tools, never bash/curl/Playwright.

The full plan is in project memory `project_apps_layout_plan.md`. Pull
it before starting if anything below is unclear. Decisions already locked
there — don't re-litigate.

---

## Phase 1 deliverables (do all five before stopping)

### A. Directus schema

Add two columns to the `directus_users` collection (Directus admin or a
schema migration script — match whichever pattern this codebase already
uses for user schema additions):

- `layout_mode` — string, enum `'classic' | 'apps'`, default `'classic'`,
  nullable false
- `app_rail_position` — string, enum `'left' | 'top' | 'bottom' | 'right' | 'floating'`,
  default `'left'`, nullable false

Update the typed schema in `server/types/directus-schema.d.ts` (or
wherever the user shape is declared in `shared/`). Run typecheck before
moving on. Existing users keep the defaults — no backfill needed since
both default values match the legacy classic behaviour.

### B. Composable: `useAppsMode`

Create `app/composables/useAppsMode.ts`. Mirrors `useLayoutMode` but
sources from the Directus user row, not `localStorage`:

```ts
export function useAppsMode() {
  // current mode, reactive — reads from authenticated user
  const mode = computed<'classic' | 'apps'>(...);
  const isAppsMode = computed(() => mode.value === 'apps');
  const railPosition = computed<RailPosition>(...);

  async function setMode(next: 'classic' | 'apps'): Promise<void>;
  async function setRailPosition(next: RailPosition): Promise<void>;

  return { mode, isAppsMode, railPosition, setMode, setRailPosition };
}
```

`setMode` / `setRailPosition` should `PATCH /users/me` via the existing
Directus auth client and update local user state so the layout flip is
immediate (no full reload). Optimistic update + rollback on error is
fine.

### C. Layout: `app/layouts/apps.vue`

The apps-mode shell. Mounts when `useAppsMode().isAppsMode === true`.
Wires:

- `<AppRail>` (positioned per `railPosition`, default left)
- `<AppHeader>` slot (per-app title + actions; component stub OK if no
  app routes exist yet)
- `<NuxtPage />` for the active app's pages
- `<AppSlideOver>` mount point (teleport target — slide-over content is
  pushed in by individual apps via a composable in a later phase; for
  Phase 1 just register the teleport target)
- Persistent chrome that survives the layout flip: header bell (notices),
  AI sidebar trigger, spotlight, user menu. Reuse the existing components
  from `default.vue` — don't fork them.

Routing: any page that opts into apps layout uses
`definePageMeta({ layout: 'apps' })`. Phase 1 has zero such pages — that's
fine. The toggle (item E) flips an account flag; nothing changes visually
until Phase 2's first app lands.

Keep `default.vue` and the spaces/focus layout stack untouched.

### D. Components

Create three top-level components in `app/components/`:

- `AppRail.vue` — vertical rail listing the five apps as icon+label
  buttons (Clients / Work / Money / Marketing / Organization). For Phase 1
  the buttons are dead links (no app routes exist) but the component
  should render, highlight the active app via `useRoute()`, and respect
  `useAppsMode().railPosition`. Floating + bottom positions can be
  stubbed with a TODO comment — left/top/right are the realistic ones to
  ship now.
- `AppHeader.vue` — top header strip per app. Slots: `default` (title),
  `actions` (right-side controls). Auto-renders the back chevron +
  previous-screen-name when `useRouter().back` is meaningful (i.e. there's
  navigation history within the current app).
- `AppSlideOver.vue` — right-side slide-over panel for one-deep nav.
  Reuses `Sheet` with `side="right"`. API mirrors ResponsiveModal:
  v-model, title, hideClose. Width: `lg` (max-w-2xl) on desktop, full on
  mobile.

Co-locate styles in each `<style scoped>` block. No global CSS.

### E. Account toggle

Add a "Layout" section to the user account page (likely
`app/pages/account/index.vue` — verify the file exists before placing
copy; if the page is split differently, follow the existing IA). The
section has:

- Heading: "Try Apps Layout (preview)"
- Description: "An app-by-app shell for Clients, Work, Money, Marketing,
  and Organization. Hats and your current sidebar stay available — toggle
  back any time."
- A `Switch` bound to `useAppsMode().mode === 'apps'` that calls
  `setMode('apps' | 'classic')`.
- A `Select` for rail position, only visible when mode === 'apps'.

Toggling should immediately flip layouts on the next route resolution.
Test by toggling and navigating — even though no apps pages exist yet,
the rail should appear if you point a temporary `app/pages/apps-test.vue`
with `definePageMeta({ layout: 'apps' })` at it. Remove that test page
before commit.

---

## Verification

1. Toggle on apps mode in account settings — confirm Directus user row
   updates (check via admin or a `useDirectusAuth().user.value`
   inspection).
2. Toggle rail position between left / top / right — confirm
   `<AppRail>` reflows correctly at desktop and mobile.
3. Toggle back to classic — `default.vue` shell takes over, hats and
   sidebar render unchanged.
4. Confirm hydration is clean (no SSR ↔ client mismatch errors in the
   preview console) for both modes.

## Out of scope

- The five actual apps. Clients/Work/Money/Marketing/Organization land
  in Phases 2-6.
- Drag-snap rail positioning, auto-hide, advanced transitions, saved view
  presets — Phase 7 polish.
- Touching hat code, `default.vue`, `SpacesSidebar`, `useHatLayout`, the
  five hat definitions, header bell, AI sidebar, spotlight. Apps mode is
  additive.
- Mirror behaviour for channels/meetings/tasks (the multi-home rule) —
  that's an app-level concern, lands per-app.
- Migrating existing routes into the apps shell — Phase 2+ task.

---

## Branch & commit hygiene

- Work directly on `main`. Tip is `187e6b0` (Phase 0 ship).
- Plaid bank-sync work parked on `claude/plaid-phase1-bank-sync` — leave
  it alone.

## Suggested final commits

Two commits keep the diff readable:

1. `feat: users.layout_mode + app_rail_position schema` (Part A)
2. `feat: Apps Layout Phase 1 — shell scaffolding + preview toggle`
   (Parts B-E)

Don't push until end-to-end verification passes (toggle on, layout
flips, toggle off, classic returns).

# Next session: Commit pending perf wiring, then Apps Layout — Phase 0

Two parts in one session: (1) commit and verify the uncommitted perf
follow-up wiring from May 8, then (2) start Phase 0 of the approved Apps
Layout plan. Phase 0 is the prerequisite work that the apps shell (Phase 1)
builds on, and it gives classic-mode users a free modal width upgrade in the
meantime.

Per project memory: bind preview to `127.0.0.1:3000`, use `preview_*` tools,
never bash/curl/Playwright.

---

## PART 1 — Commit the pending perf wiring

The previous session left work on the working tree but didn't commit. The
diff is small and self-contained:

```
M app/components/DeferUntilVisible.vue       — emits `enter` once when slot becomes visible
M app/components/Tasks/Board.vue             — uses extracted TasksCard
?? app/components/Tasks/Card.vue             — extracted (universal status-dot pattern)
M app/composables/useAIProductivityEngine.ts — audit-trail comments (no logic change)
M app/composables/useHatLayout.ts            — trimmed HAT_MODULES; lazy via loadModule()
M app/pages/index.vue                        — onChatDeskEnter / onFinancialEnter / replayLazyLoaders
```

### Verify before commit

1. **Tasks/Card** — `/projects/<any>/Tasks` board. Cards should render with
   the new pattern: checkbox left, title (line-through when complete),
   priority + due-date row, assignee on right. Drag a card across columns to
   confirm `vuedraggable` still works after the extraction. Toggle the
   checkbox to confirm `toggle-complete` event fires.
2. **Lazy module loaders** — set `localStorage.earnest-active-hat = 'accountant'`
   then reload `/`. Cold mount should show priority-actions / goals /
   suggestions. Scroll down — Financial Quarter widget enters view, and
   `loadModule('invoices')` + `loadModule('deals')` fire. Confirm there are
   no Vue runtime errors and the suggestions list updates.
3. **Hat-switch replay** — switch from default to accountant hat after
   sitting on default for >60s (so the `_moduleCache` TTL has expired).
   Confirm Priority Actions still shows invoice alerts after switch — the
   `replayLazyLoaders()` in `runAnalysis()` should re-fire `loadModule` for
   any deferred widgets that already entered view.

### Commit

```
git add -A
git commit -m "$(cat <<'EOF'
feat: lazy module loaders + Tasks/Card extraction

- DeferUntilVisible emits `enter` once when the slot becomes visible
- HAT_MODULES drops carddesk/channels (PM+Salesman) and invoices/deals
  (Accountant) — these now load when their DeferUntilVisible widget enters
  view via loadModule()
- replayLazyLoaders() in runAnalysis() handles the hat-switch corner case
  where the observer has already fired and won't re-emit on the next
  analyze() pass
- Tasks/Card.vue extracted; Tasks/Board.vue uses it; useStatusStyle pulls in
  priority colors so the kanban matches Projects/Tickets visually
- Audit comments updated for call_logs / messages / social_accounts
  (Directus row perms scope these; no engine-side org filter needed —
  see scripts/audit-tenant-row-perms.ts)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then move into Part 2.

---

## PART 2 — Apps Layout Phase 0

Background: the approved Apps Layout plan is in project memory
`project_apps_layout_plan.md` (originSession 2026-05-08). It introduces a
parallel "apps mode" shell behind `users.layout_mode = 'classic' | 'apps'`,
with five apps (Clients / Work / Money / Marketing / Organization). Phase 0
lands in BOTH modes — it's foundation work, not the apps shell itself.

### Phase 0 has three deliverables. Do all three before stopping.

#### A. Hide dormant layout & timeline chooser options

[useLayoutMode.ts](app/composables/useLayoutMode.ts) already gates `tabs` and
`home` modes behind `hidden: true` in `LAYOUT_MODES`. That works for the
picker, but verify there are no surfaces still rendering them:

```
grep -rn "'tabs' as LayoutMode\|'home' as LayoutMode\|currentMode === 'tabs'\|currentMode === 'home'" app/
```

Goal: Phase 0 leaves codepaths in source (revival-friendly) but hidden
behind `v-if="false"` / `hidden: true`, never deleted.

Same pass on the timeline view chooser. The home Project Timeline
([ProjectTimelineUnifiedGantt](app/components/ProjectTimeline/UnifiedGantt.vue))
has a `nested|flat|today` toggle persisted to `earnest-timeline-view-mode`
localStorage. Audit which views are in active use vs. dormant. Hide the
ones the user no longer wants exposed in the picker. Confirm with a screenshot
of the home dashboard showing only the active toggle states.

#### B. Build `ResponsiveModal` wrapper

**Location:** `app/components/ResponsiveModal.vue` (top-level — NOT
`app/components/ui/`; the `Ui*` prefix collides with the auto-generated
shadcn-vue wrappers).

**Behavior:**
- Mobile (< `md`): renders as a bottom drawer
  ([UDrawer](app/components/ui/drawer)) — full-width, slides up, swipe-down
  to dismiss.
- Desktop (≥ `md`): renders as a centered dialog
  ([UDialog](app/components/ui/dialog)) — comfortable max-width.

**Sizing prop API:**
- `sm` → `sm:max-w-md`  (28rem) — for the smallest existing modals
- `md` → `sm:max-w-lg`  (32rem) — new default
- `lg` → `sm:max-w-2xl` (42rem) — the comfortable target for forms
- `xl` → `sm:max-w-4xl` (56rem) — proposal/contract editors etc.

**Slot & prop parity:** match `UModal`'s API as closely as possible so the
sweep in C is mechanical: `v-model` (open/close), `title`, `hideClose`,
`onInteractOutside`. Default slot for body. The `hideClose` escape-hatch
convention is established (see Session 22 chrome project memory).

**Verification:** mount the component on a temporary surface (an inline
button on `/`), resize via `preview_resize` between 375px and 1024px to
confirm the drawer↔dialog flip, then remove the test surface.

#### C. Sweep existing modals to use ResponsiveModal at comfortable widths

Known starting set (all currently `sm:max-w-md` or narrower):
- [Organization/BillingSurface.vue:564](app/components/Organization/BillingSurface.vue:564) — refund modal
- [TimeTracker/Modal.vue](app/components/TimeTracker/Modal.vue) — time entry edit
- [Leads/ConversionModal.vue](app/components/Leads/ConversionModal.vue) — lead → client
- [Leads/LostReasonModal.vue](app/components/Leads/LostReasonModal.vue) — lost reason (currently `sm:max-w-sm`)
- [Projects/Overview.vue:440](app/components/Projects/Overview.vue:440) — meeting detail
- [ProjectTimelineUnifiedGantt:1228](app/components/ProjectTimeline/UnifiedGantt.vue:1228) — project preview

Run a wider grep at the start to catch the rest:
```
grep -rln "UModal\|sm:max-w-" app/components --include="*.vue"
```

For each modal touched: (1) swap `UModal` → `ResponsiveModal`, (2) raise
width to `lg` or `xl` per content density, (3) verify mobile in preview at
375px and desktop at 1024px+. The plan calls out: do all three, don't
half-finish. A swept modal that's still narrow on desktop is no better
than not sweeping it.

### Decisions already locked (don't re-litigate)

These were debated and decided in the brainstorm — pull from project memory
`project_apps_layout_plan.md` if anything's unclear:

- Toggle is `users.layout_mode = 'classic' | 'apps'`, default `classic`,
  per-user (NOT per-org). Phase 1 ships the column + UI toggle.
- Five apps: Clients, Work, Money, Marketing, Organization. Phase 2-6 each
  ship one app standalone.
- Slide-overs for one-deep nav, full-page push for two+ deep,
  ResponsiveModal wrapper for modals.
- No breadcrumbs. Back chevron + previous-screen-name + pill floor strip.
- Hats stay untouched in classic mode; apps mode replaces them with per-app
  saved view presets.

### Out of scope for this session

- Phase 1 apps shell — `apps.vue` layout, `AppRail`, `AppHeader`,
  `AppSlideOver`, the layout toggle UI. Don't start until Phase 0 lands.
- New schema columns (`users.layout_mode`, `users.app_rail_position`) — go
  with Phase 1.
- Touching hat code, `default.vue`, `SpacesSidebar`, `useHatLayout`, the 5
  hat definitions. Those stay untouched throughout the migration.
- Any Apps Layout brainstorming — the plan is approved. Execute it.

---

## Branch & commit hygiene

- Work directly on `main`. Current tip is `baa4125` (the perf-followups
  merge). No feature branch.
- Plaid bank-sync work parked on `claude/plaid-phase1-bank-sync` (intact,
  awaiting Stripe Product creation per project memory) — leave it alone.

## Suggested final commits

Two commits on `main` keep the diff readable:
1. `feat: lazy module loaders + Tasks/Card extraction` (Part 1)
2. `feat: Apps Layout Phase 0 — ResponsiveModal + modal sweep` (Part 2)

Don't push until both parts pass live verification.

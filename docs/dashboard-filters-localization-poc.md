# Dashboard filters: localize Mine/All + client selector — POC & reference

**Status:** design/POC reference (decision made 2026-07-15 — "localize both").
**Owner cue:** raised because the dashboard Mine/All toggle and client selector
"update some widgets and not others," and toggling Mine/All appears to *remove*
the Priority Actions widget.

---

## 1. The problem

Two controls live in the **global apps-shell header** (`app/layouts/apps.vue`),
so they persist across `/` and every `/apps/*` route:

- `<LayoutClientSelect>` — `apps.vue:33`
- `<LayoutDataScopeSelect>` (Mine/All) — `apps.vue:39`

Both are backed by **global state**, but consumed **inconsistently** — only a
couple of widgets actually react, and Mine/All's most visible effect is *band
reordering*, not filtering. That mismatch is the whole complaint.

### Why Priority Actions "disappears" on All
It isn't removed — it's **reordered below the fold**. In `app/pages/index.vue`:

```
youOrder = isMine ? 1 : 2   // index.vue:100
usOrder  = isMine ? 2 : 1   // index.vue:101
```

Priority Actions is in the YOU band (`index.vue:446`). Switching to **All**
sends YOU to `order:2`, so the whole US band (client/project carousels, CRM,
Marketing, Goals, Financial) renders above it and pushes it far down. The
empty-state ("You're all caught up!") reinforces the "gone" perception.

### Why "some update, some don't"
Mine/All (`useDataScope`) is only genuinely wired into Quick Tasks and, partially
+ lazily, the AI ticket analyzer. The client selector (`useClients.selectedClient`)
is wired into Quick Tasks, the Active *Project* carousel, and 4 AI analyzers, and
silently ignored by ~8 others — including the Active *Client* carousel, which even
computed an `isScoped` guard the page never uses.

Worse, toggling Mine/All **does not re-run** Priority Actions analysis:
`useAIProductivityEngine`'s `isMine` watcher (≈`:1421`) only clears the module
cache, and `index.vue`'s re-analysis watcher (`:351`) watches
`[selectedOrg, selectedClient, selectedTeam]` — **not `isMine`**. So content only
refreshes on some *other* trigger.

---

## 2. Current-state wiring inventory

State sources:
- Mine/All → `app/composables/useDataScope.ts` (`useState('data-scope')`,
  per-user localStorage; non-admins hard-clamped to `mine`).
- Client → `app/composables/useClients.ts` (`useState('selectedClient')`,
  cookie + localStorage). Values: `null`=All, `'org'`=own work, or a client UUID.

| Widget | Reacts to Mine/All | Reacts to Client |
|---|---|---|
| Priority Actions / Suggestions (`useAIProductivityEngine`) | Partial (tickets only) + **no auto-refresh** | Partial (tickets/projects/invoices/channels), auto-refreshes |
| Quick Tasks (`useQuickTasks`) | **Yes** | **Yes** |
| Active Client Carousel | No | **No** (has unused `isScoped` guard) |
| Active Project Carousel | No | **Yes** |
| CRM Pulse (`useCRMIntelligence`) | No | No |
| Project Digests / Today's Briefs | No | No |
| Marketing Pulse (`useMarketingPulse`) | No | No |
| Goals Summary (`useGoals`) | No | No |
| Financial Quarter | No | No |
| Channels / CardDesk cards | No | No |
| Earnest Score / Trend | No | No |

**Net:** both are global but consumed as if local — the worst of both worlds.

---

## 3. Decision — localize both

Rationale (matches the product instinct: *"if I want to work on a client I go to
the client details page, which has everything there"*):

- **Client selector → remove from global chrome.** Client-scoped work belongs on
  the client detail page (`ClientWorkspace`), which now also embeds Channels.
  A global client filter that only ~3 widgets honor is a false promise.
- **Mine/All → keep, but make it a *local* control on Priority Actions** (the one
  widget where "just my stuff" is meaningful), and make it **actually re-run**
  analysis. Remove it from the global chrome and from band-reordering duty.

---

## 4. Localized design (POC)

### 4a. Priority Actions owns Mine/All
Move the toggle into the Priority Actions widget header. Drive analysis from it:

```ts
// In the Priority Actions widget (extracted from index.vue's YOU band)
const scope = ref<'mine' | 'all'>('mine')            // LOCAL, not useState
const engine = useAIProductivityEngine(/* … */)
watch(scope, () => engine.runAnalysis({ mine: scope.value === 'mine' }))
```

- `myFilter()` (`useAIProductivityEngine.ts:141`) must be applied to **all**
  analyzers, not only `analyzeTickets` (`:280`), so "Mine" means the same thing
  everywhere in the widget.
- Delete the `youOrder/usOrder` reorder coupling (`index.vue:100-102`) — Mine/All
  no longer reshuffles the dashboard; it filters one widget's queue.

### 4b. Remove the global controls
- Delete `<LayoutClientSelect>` (`apps.vue:33`) and `<LayoutDataScopeSelect>`
  (`apps.vue:39`) from the shell.
- `useClients.selectedClient` / `useDataScope` can remain as composables for now,
  but nothing global sets them. Consumers that still want scoping take an explicit
  prop instead of reading global state (e.g. Active Project carousel accepts a
  `:client-id`), so the data-flow is legible.

### 4c. Client scoping lives on the client page
No global client filter. `ClientWorkspace` already aggregates projects, invoices,
tickets, tasks, messages/Channels, contacts — that's the "work on a client"
destination.

---

## 5. Migration steps (safe order)

1. **Extract** the Priority Actions section from `index.vue` into a widget with a
   local `scope` toggle; wire `watch(scope) → runAnalysis`. (Reversible, additive.)
2. **Apply `myFilter()` to every analyzer** in `useAIProductivityEngine` so "Mine"
   is consistent; add `isMine` to the analysis watcher so it refreshes.
3. **Drop band reordering** (`youOrder/usOrder`) — render a fixed, legible order.
4. **Remove** the two global chrome controls from `apps.vue`.
5. **Convert remaining client-selector consumers** (Active Project carousel,
   Quick Tasks) to explicit props or leave them unscoped on the dashboard.
6. Delete the unused `isScoped` guard on the Active Client carousel.

## 6. Risks / notes
- `useDataScope` hard-clamps non-admins to `mine` and hides the toggle for them —
  preserve that in the local control (members only ever see their own).
- Several consumers import `selectedClient` directly; grep before deleting the
  composable. Leaving the composable but removing the global *setter* is the least
  disruptive path.
- This is a **UX/data-flow** change, not a schema change — fully reversible.
```

---

_This document is the stored POC/reference for the "localize both" decision. The
production implementation (steps 1–6) is queued as a follow-up._

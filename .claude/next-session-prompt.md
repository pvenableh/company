# Next session: verify the perf follow-ups, finish card unification, sweep loose ends

This continues the May 8 perf push. The four follow-ups in the previous version
of this file shipped on `claude/perf-followups-may08` (commit `492b2dd`) and
need live verification. Card unification (the "universal ticket design"
introduced in `fa06c50`) was applied to Tickets/Card.vue and Projects/Card.vue
but Tasks/Board.vue still renders cards inline with the old pattern. A few
non-tenant-scoped queries that the perf prompt deferred are still open.

Per project memory: bind preview to `127.0.0.1:3000`, use `preview_*` tools,
never bash/curl/Playwright.

## 1. Verify the four perf follow-ups in `492b2dd`

The diff is small (8 files, +191/-70). The pieces:

- **Lazy hat-aware analyze()** — [useHatLayout.ts](app/composables/useHatLayout.ts) exposes `hatModules` (`null` = all). [pages/index.vue](app/pages/index.vue) intersects with `enabledModules` and re-runs `analyze()` on hat switch. [useAIProductivityEngine.ts](app/composables/useAIProductivityEngine.ts) force-includes `tickets` so `metrics.overdueItems` / `tasksCompletedToday` side-effects still populate. New `loadModule(name)` exported but **not yet wired** into any DeferUntilVisible widget — see item 3.
- **Cache headers** — `private, max-age=30` on `crm/health-snapshot`, `marketing/health-snapshot`, `marketing/timeline`, `marketing/recommendations`. Set after auth.
- **Org-filter `_in: accessibleOrgIds`** — `orgFilter()` now allow-lists when `selectedOrg` is null. Same treatment in `analyzeTickets` completed-today and `analyzeInvoices.bill_to`. `analyzeDeals` guard relaxed.
- **`attachCommentCounts` new-IDs-only** — [Projects/Board.vue](app/components/Projects/Board.vue) tracks `_commentCountFetched` set; existing project IDs skip the aggregate.

### Verification steps

Run with the Default hat first, then switch to each persona-shaped hat and
observe.

1. **Hat-aware module loading** — Instrument fetch in preview, capture `/api/directus/items` POSTs by `collection`. Land on `/` with the Default hat: should see priority modules' reads (tickets/projects/tasks/invoices/channels). Switch to **Accountant** hat: tickets/tasks/invoices/deals/goals only — no `social_posts`, no `appointments`, no `call_logs`, no `channels`. Switch to **Marketing Manager**: `tickets/tasks/channels/social_posts/goals`, no `invoices`/`leads`/`call_logs`. Confirm hat switch re-runs (the `watch(activeHat.id)` in [pages/index.vue](app/pages/index.vue)).
2. **Org-filter** — Pick a multi-org admin user. Inspect the `tickets` POST body when no org is selected: filter must include `organization: { _in: [uuid, uuid] }`, NOT `{}`. Pick one org → `{ _eq }`. Same for `projects`, `tasks` (note: tasks is user-scoped via `assignee_id`, ignore), `invoices` (uses `bill_to: { _in }`).
3. **Cache headers** — Use `preview_network` and check the response headers on the four endpoints. Should be `cache-control: private, max-age=30`. Hit twice within 30s; second is `(disk cache)` in DevTools or `from-cache` in `preview_network`. Force-refresh bypasses.
4. **Project comment counts** — On the projects board, watch a card's status get dragged or status flip via realtime. Confirm `directus_comments` aggregate fires only on cold mount + when a brand-new project ID enters the list (e.g. create a project). The previous behavior (one aggregate per WS tick) is gone. Add a comment via `/api/portal/comments` or the chat dock — count won't update without a refresh; that's expected (no WS signal exists for comment creation; the count was always stale on existing IDs anyway).

If anything diverges, fix and amend the commit. The changes are mechanical
enough that I'd be surprised if any are wrong, but the multi-org admin path
(no `selectedOrg`) is the easiest to misjudge — please verify there.

## 2. Wire `loadModule(name)` into the deferred widgets

`loadModule(name)` is now exposed from [useAIProductivityEngine.ts](app/composables/useAIProductivityEngine.ts) but
nothing calls it yet. Three home-dashboard widgets gate behind
`DeferUntilVisible` and would benefit:

- [CommandCenterCardDeskPipeline](app/components/CommandCenter/CardDeskPipeline.vue) — needs `carddesk` module
- [CommandCenterRealtimeChat](app/components/CommandCenter/RealtimeChat.vue) — needs `channels` module
- [CommandCenterFinancialQuarter](app/components/CommandCenter/FinancialQuarter.vue) — needs `invoices` + `deals`

The [hat → modules map](app/composables/useHatLayout.ts:43) currently lists these
upfront for hats that show the widget — which means they fire on cold mount
even if the widget hasn't entered view yet. Two options:

- **(a)** Drop those modules from the hat-default set and have each widget call `loadModule()` from an `onMounted` inside the `DeferUntilVisible` slot. Cold mount drops further; the widget's first paint pays for the fetch when it enters view.
- **(b)** Keep them in the hat-default and skip the lazy wiring. Simpler, but you don't capture the "below-the-fold" win that `DeferUntilVisible` is designed for.

I'd recommend (a). The lazy widgets should expose a small `<DeferUntilVisible
@enter="loadModule('carddesk')">` pattern — match whatever event/prop the
component already emits (look for `enter` or an `IntersectionObserver` ref).

## 3. Card unification — Tasks board still uses the old pattern

`fa06c50` introduced the "universal ticket design": status-dot accent +
title + assignee avatar stack + bottom counts. Applied to:

- [Tickets/Card.vue](app/components/Tickets/Card.vue) — full implementation
- [Projects/Card.vue](app/components/Projects/Card.vue) — pattern adopted, status accent + counts
- [Tasks/Board.vue:62](app/components/Tasks/Board.vue:62) — **still inline, old pattern**: priority text-color, due-date with calendar icon, no status accent dot, no extracted `Tasks/Card.vue`

The mismatch is visually obvious if you switch between `/projects` and a
project's task list. Two paths:

- **Extract** `Tasks/Card.vue` matching the [Projects/Card.vue](app/components/Projects/Card.vue) skeleton: `getStatusAccent` from `useStatusStyle`, status dot, title (line-through when complete), single bottom-meta row with priority + due + assignee. Use the existing checkbox toggle as the "left" element instead of the status dot if you want to keep the inline-complete affordance — or move the checkbox into a hover-only action and let the status dot speak for completion.
- **Keep inline** but match the visual rhythm: same `text-xs`, same `gap-2`, same accent dot, same assignee-avatar shape. Easier diff but loses the reusable component.

Reusable component (extract path) wins on consistency. The two boards now
diverge enough that drag-drop between them — if/when that's wired — will feel
janky.

While you're in there: `Tasks/Board.vue` doesn't use `useStatusStyle` at all
(it's hardcoding red/blue priority colors). Worth pulling
`getPriorityIconClass` / `getPriorityBadgeClasses` to match.

## 4. `call_logs` org-filter audit (deferred from the perf prompt)

[useAIProductivityEngine.ts:analyzePhone](app/composables/useAIProductivityEngine.ts:848) queries `call_logs` with no org
filter and no user_created filter:

```ts
filter: {
  event_type: { _eq: 'missed' },
  status: { _eq: 'published' },
}
```

The previous perf prompt explicitly listed `messages`/`social_posts`/`appointments`
as "intentionally user-scoped, leave alone." It did NOT list `call_logs`. This
analyzer relies on Directus row perms to scope across tenants — the same
ambiguous walk that item 3 of the perf prompt closed everywhere else. Confirm
whether `call_logs` has a row-level read perm tying calls to the caller's org
(via `related_contact.organization` or similar). If yes, leave alone. If
no, add `...orgFilter()` to the filter.

The audit should also touch the `useAIProductivityEngine` collection list
flagged in project memory (`social_accounts`/`call_logs`/`appointments`/
`messages`) — same question for each. Memory says this was spawned as a
separate audit task; check if that task ever ran.

## 5. Tickets board comment-count pattern — confirm it's already fine

The original perf prompt flagged [Tickets/Board.vue:587](app/components/Tickets/Board.vue:587)
as the same chatty pattern. On read it's actually NOT — `attachCommentCounts`
fires only once via `fetchTicketsViaREST → attachCommentCounts` (line 656),
and the WS update path at [line 866](app/components/Tickets/Board.vue:866)
preserves `commentsCount` across diffs instead of re-fetching. So tickets is
already structured the cleaner way; the prompt's note was outdated. **Verify
this in preview** (drag a ticket between columns and watch the network — no
new `directus_comments` aggregate should fire).

If verified, no code change needed; just record the finding.

## 6. Anything we missed from earlier today

The May 8 commits to scan for leftover work:

- `fa06c50` "Updated board performance universal ticket design" — main perf pass + `DeferUntilVisible` + Card refactor. Look for any `// TODO` / `console.log` / commented-out blocks.
- `a5aaf56` "Updated board and cards" — the chatty `attachCommentCounts` (now superseded) + Projects/Card.vue comment-count chip + clientLabel fallback + a new favicon. Confirm Projects/Card.vue's `clientLabel` doesn't break for projects without a client (memory says it falls back to org name; verify the empty-string branch hides the row).
- The `.claude/next-session-prompt.md` file itself was updated twice today (first to add the original 4 items, then by a5aaf56). This commit replaces it with the present file.

## Out of scope

- No new analyzers, no new collections.
- Don't touch `messages`/`social_posts`/`appointments` user-scoped queries (covered by the prior prompt's gotchas).
- Don't preemptively merge to `main` until item 1's verification passes — the four perf items haven't been live-tested yet.
- Don't bump cache TTLs above 60s without asking.

## Branch state

- Working branch: `claude/perf-followups-may08` (commit `492b2dd`).
- Plaid bank-sync work parked on `claude/plaid-phase1-bank-sync` (worktree
  cleaned up; the branch is intact, awaiting Stripe Product creation per
  project memory).
- All other historical `claude/*` branches and worktrees were swept on May 8.

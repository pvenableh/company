# Next session: AI engine + cache headers + org-filter gap

Three deferred follow-ups from prior perf sessions. Land them in one branch
or split as you see fit. Verify in the running preview (per project memory:
bind to `127.0.0.1:3000`, use `preview_*` tools — never bash/curl/Playwright).

## 1. Make analyze() lazy in [useAIProductivityEngine.ts](app/composables/useAIProductivityEngine.ts)

Today, [analyze()](app/composables/useAIProductivityEngine.ts:1444) runs all 11 modules on
mount (5 priority + 6 secondary, both via `Promise.all`). The dock badge,
sidebar tray, and command-center widgets all subscribe to the same
`suggestions`/`metrics` refs, so cold mount fans out 30+ Directus reads
even when the active hat only renders one widget.

**Goal:** run only what the active hat actually shows on first paint;
lazy-load the remaining modules when their consumer widget enters view
(IntersectionObserver) or the hat changes.

**Approach to consider:**
- Map `hat → modules[]` (use [useHatLayout](app/composables/useHatLayout.ts) — Default/PM/Accountant/Salesman/Marketing Manager). Pass the active set into `analyze({ modules: ['tickets', 'projects'] })` and skip the rest.
- For widgets gated by IntersectionObserver, expose a `loadModule(name)` so a widget can request its own data on mount-in-view. Reuse the existing `_moduleCache` map ([useAIProductivityEngine.ts:60](app/composables/useAIProductivityEngine.ts:60)) — it already has 5-min TTL, just route through it.
- Keep the existing priority/secondary split as the *default* for the Default hat; other hats can override with their own subset.
- Watch out for the `metrics.value.overdueItems` / `tasksCompletedToday` side-effects ([useAIProductivityEngine.ts:322](app/composables/useAIProductivityEngine.ts:322)) — they're written from `analyzeTickets` and read by widgets that may not invoke that module. Either compute them lazily on first read, or keep tickets in the always-on set.

**Verify:** In preview, instrument `fetch` to capture `/api/directus/items`
calls. Land on `/` with the Default hat — should see priority modules
only (~5 reads). Switch to the Accountant hat — should see invoice/billing
modules but NOT social/scheduling/etc. Scroll to a deferred widget — that
single module's reads fire. Confirm the suggestions stream still hydrates
without flicker.

## 2. Add 30s cache headers to read-only snapshot endpoints

Both endpoints recompute on every request and return stale-tolerant data.
Adding `Cache-Control: private, max-age=30` lets the browser short-circuit
the back-button and tab-switch case without forcing a refetch.

- [server/api/crm/health-snapshot.get.ts](server/api/crm/health-snapshot.get.ts) — pure algorithmic CRM scoring, no AI tokens
- [server/api/marketing/health-snapshot.get.ts](server/api/marketing/health-snapshot.get.ts)
- [server/api/marketing/timeline.get.ts](server/api/marketing/timeline.get.ts)
- [server/api/marketing/recommendations.get.ts](server/api/marketing/recommendations.get.ts)

Pattern (use h3's `setResponseHeader`):
```ts
setResponseHeader(event, 'Cache-Control', 'private, max-age=30');
```

`private` is important — these are user/org-scoped, must not be cached by
shared proxies. Place the header set after `requireUserSession` so 401s
don't get cached.

**Verify:** Preview the page that consumes the endpoint, hit it twice
within 30s, the second request should `(disk cache)` in the Network tab
(or use `preview_network` to inspect headers). Force-refresh should
bypass cache as expected.

## 3. Close the org-filter gap in analyze()

Project memory entry [project_typecheck_debt.md](.claude/projects/-Users-peterhoffman-Sites-earnest-earnest/memory/project_typecheck_debt.md)
already flags this and the spawned audit task is open. The concrete spots:

- [analyzeTickets](app/composables/useAIProductivityEngine.ts:249), [analyzeProjects](app/composables/useAIProductivityEngine.ts:333), [analyzeTasks](app/composables/useAIProductivityEngine.ts:421), [analyzeInvoices](app/composables/useAIProductivityEngine.ts:488) all use `orgFilter()` ([line 108](app/composables/useAIProductivityEngine.ts:108)) which returns `{}` when `selectedOrg.value` is null (multi-org admin "All Orgs" view).
- Directus row-perm walks then filter via the recursive `organization.users.directus_users_id.id._eq.$CURRENT_USER` path — slow (no indexed entry point) and the security flag noted in [project_directus_perm_filter_gotchas.md](.claude/projects/-Users-peterhoffman-Sites-earnest-earnest/memory/project_directus_perm_filter_gotchas.md).

**Fix:** When `selectedOrg.value` is null, replace `orgFilter()` with an
explicit `{ organization: { _in: <allOrgIds> } }` allow-list, sourced from
[useOrganization](app/composables/useOrganization.ts).accessibleOrgIds (or whichever name the composable
exposes). That narrows the planner to an index seek and removes the
ambiguity that Directus row-perm walks were papering over.

The user-scoped queries (`messages` via channel FK, `social_posts` via
`user_created`, `appointments` via `user_created`) are intentionally
user-scoped and do NOT need org-list scoping — leave them alone. The
previous session's comments at [line 580](app/composables/useAIProductivityEngine.ts:580), [line 681](app/composables/useAIProductivityEngine.ts:681), and [line 780](app/composables/useAIProductivityEngine.ts:780) explain why.

**Verify:** Preview as a multi-org admin. Inspect a `/api/directus/items`
POST body for `tickets` — when no org is selected, the filter should
include `organization: { _in: [uuid, uuid] }` not an empty object. With
one org selected, it should still be `{ _eq }`.

## Out of scope

- Don't add new analyzers or new collections. Mechanics only.
- Don't touch the `messages`/`social_posts`/`appointments` user-scoped queries.
- Don't change cache TTLs to anything > 60s without asking — the user has
  flagged stale data as a concern in past UX feedback.

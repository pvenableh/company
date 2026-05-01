# Session 13 — Finish marketing-screenshot recapture (org-teams loading bug + commit/deploy)

**Status:** Picks up where Session 12 left off
**Blocker:** `/organization/teams` page shows perpetual loading spinner in headless captures despite teams existing & API returning them
**Ships:** Clean marketing-site screenshots on earnest.guru with new demo-org logos + commit/deploy of all Session 11/12/13 fixes
**Out of scope:** new features, marketing-site copy

## Context (read these first)

- [project_directus_perm_filter_gotchas.md](memory/project_directus_perm_filter_gotchas.md) — deref + recursion bugs fixed live in Directus on 2026-04-28. Don't re-introduce.
- [project_useorganization_init_race.md](memory/project_useorganization_init_race.md) — why `initializeOrganizations` caches its in-flight promise on `useNuxtApp()`. Don't switch back to `useState`.
- [reference_dev_server_ipv6.md](memory/reference_dev_server_ipv6.md) — dev server is IPv6-only on `[::1]:3000`. Use `http://localhost:3000`, never `127.0.0.1`.

## TL;DR of Session 12 outcomes (uncommitted, all on disk in [Sites/earnest/earnest](.))

### Root-cause fix that unblocked tickets + leads
**`useOrganization.js` watcher oscillation** — the user.id watch with `immediate: true` ran on every component that calls `useOrganization()` (50+ call sites). Each immediate fire had `oldId === undefined`, which triggered `clearOrganization()` → wiped localStorage + reset `selectedOrg=null`. Init then re-set it. Result: `selectedOrg` oscillated null↔orgId, firing Board.vue's watch repeatedly and trapping `isLoading=true`.

**Patch in [app/composables/useOrganization.js:285-300](app/composables/useOrganization.js)**: skip `clearOrganization()` when `oldId === undefined` (initial fire). Real user-change transitions still trip the clear — but mount-time setup doesn't.

This also fixed the empty `leads-pipeline.png` (was 0 leads visible despite 5 existing).

### Demo seed bug
`teams` were being created with default `status='draft'` so `useTeams.fetchTeams` (which filters `status _eq 'published'`) returned empty. Patched [scripts/setup-demo-agency-org.ts:761](scripts/setup-demo-agency-org.ts) to set `status: 'published'`. Existing prod rows were updated live via API.

### Capture script tuning ([scripts/capture-demo-screenshots.ts](scripts/capture-demo-screenshots.ts))
- `SETTLE_MS` 5s → 8s (heavier dashboards on cold context)
- `waitForFunction(loading-gone)` 10s → 30s
- Predicate now also waits for `.animate-pulse` skeletons to disappear (Priority Actions AI engine takes ~20-30s)

### Layout: footer pinned to bottom
[components/Layout/Modes/SpacesLayout.vue:299](app/components/Layout/Modes/SpacesLayout.vue) and [TabsLayout.vue:143](app/components/Layout/Modes/TabsLayout.vue): wrapped slot in `<div class="min-h-full flex flex-col"><div class="flex-1"><slot/></div><LayoutFooter/></div>` so short pages still anchor footer at viewport bottom. HomeLayout doesn't have a footer — left alone.

### Tiny polish
[app/pages/clients/[id].vue:344](app/pages/clients/[id].vue) — sub-line under client name was `industryName || 'Loading...'`. Changed to em-dash so the brief fetch race doesn't flash "Loading…".

## OUTSTANDING BUG — block on this first

**`/organization/teams` is stuck on `loading=true` in headless captures.**

State in [latest/organization-teams.png](../../earnest-marketing/public/screenshots/latest/organization-teams.png): TEAMS header + CREATE TEAM button, then a spinning sync icon mid-page, then the Earnest Leaderboard card empty. No team cards. No "No Teams Found" empty state either — purely the spinner.

Probe confirmed (in browser console after login as `demo-agency@earnest.guru`):
```js
fetch('/api/directus/items', {
  method:'POST', credentials:'include',
  headers:{'content-type':'application/json'},
  body: JSON.stringify({
    collection:'teams', operation:'list',
    query:{ filter:{ organization:{ _eq:'d409875b-01d7-4f85-84c8-01c9badbb338' }, status:{ _eq:'published' }}, fields:[/* same field list as useTeams.fetchTeams */] }
  })
})
```
returns BOTH teams (Creative + Delivery) with full member detail. So the API + perms are fine.

Yet [app/composables/useTeams.js:103-167](app/composables/useTeams.js) sets `loading.value = true`, then in `finally { loading.value = false }`. Something between is throwing/hanging in a way that bypasses the finally — OR the watch in [pages/organization/teams.vue:393-405](app/pages/organization/teams.vue) never fires (selectedOrg already set on mount, watch is `immediate: true` so should fire).

Suspects:
1. `fetchOrganizationUsers(organizationId)` ([useTeams.js:53](app/composables/useTeams.js)) calls Directus SDK's `readUsers` directly (not via the items proxy). That bypasses our auth/proxy and may hang if the demo-agency token isn't injected.
2. `tryRestoreSelectedTeam` (called inside fetchTeams' try block) reads localStorage; could throw in some edge case.
3. `loading` is `useState('teams_loading')` — global. Maybe a stale `loading=true` from one of the 50+ useTeams call sites was set then never finalized. With my org-watcher fix, this shouldn't happen anymore — but worth a sanity check.

**Easiest reproduction:**
```sh
pnpm dev   # binds [::1]:3000 — use http://localhost:3000
# In browser:
# 1. POST /api/auth/demo-agency-login (no body)
# 2. Navigate to /organization/teams
# 3. Open Vue DevTools → check `loading` and `lastFetchedOrg` on useTeams
# 4. If loading=true forever, try `useTeams().fetchTeams('d409875b-…', { force: true })` from console and see whether it resolves
```

Once you see exactly where it hangs, fix and verify (page renders 2 cards: Creative + Delivery).

## Steps after the bug

1. **Re-run capture against local dev** (after org-teams fix lands):
   ```sh
   set -a && source .env && set +a
   APP_URL=http://localhost:3000 pnpm tsx scripts/capture-demo-screenshots.ts
   ```
   Spot-check 3-4 PNGs in `~/Sites/earnest/earnest-marketing/public/screenshots/latest/` with the Read tool. Confirm: real product, no spinners, no devtools icon, no /organization/new wizard, new black "E" demo-org logo visible in org switcher.

2. **Commit earnest** with all uncommitted changes:
   - [scripts/patch-tenant-row-perms.ts](scripts/patch-tenant-row-perms.ts) — Session 11 perm-deref + recursion fix
   - [scripts/capture-demo-screenshots.ts](scripts/capture-demo-screenshots.ts) — Session 11+12 reliability tuning
   - [scripts/setup-demo-agency-org.ts](scripts/setup-demo-agency-org.ts) — `status:'published'` on teams
   - [app/composables/useOrganization.js](app/composables/useOrganization.js) — Session 11 init-race fix + Session 12 watcher-oscillation fix
   - [app/middleware/needs-org.global.ts](app/middleware/needs-org.global.ts) — Session 11 debug-log strip
   - [app/components/Layout/Modes/SpacesLayout.vue](app/components/Layout/Modes/SpacesLayout.vue), [TabsLayout.vue](app/components/Layout/Modes/TabsLayout.vue) — footer-pin layout fix
   - [app/pages/clients/[id].vue](app/pages/clients/[id].vue) — Loading→em-dash polish
   - any new fix from the org-teams investigation

   Suggested commit message: "Fix org watcher oscillation + footer pin + capture-script reliability + perm patch script"

3. **Commit + push earnest-marketing** at `~/Sites/earnest/earnest-marketing` (only `public/screenshots/` changed). Pushing main triggers Vercel redeploy of earnest.guru so the new logos + clean screenshots go live.

4. **Confirm with user** before pushing either repo — main-branch pushes deploy.

## DoD

- `organization-teams.png` shows 2 real team cards (Creative, Delivery) — not a spinner
- All 11 shots in `public/screenshots/latest/` show the new black "E" demo-org logo + real product (not wizard, not loading state)
- Footer is pinned to the bottom of the viewport on every page (verify on a short page like organization-teams)
- earnest commit landed locally
- earnest-marketing pushed and earnest.guru redeployed

## Critical gotchas (from Session 11/12)

- **Dev server is IPv6-only on `[::1]:3000`.** Use `http://localhost:3000` for `APP_URL`. `127.0.0.1` refuses; `[::1]` direct returns 426.
- **`networkidle` waits hang on prod** because long-poll connections stay open. Capture script uses `domcontentloaded`. Don't switch back.
- **`/api/directus/items` POST returns a raw array `[...]`** for list operations, not `{ data: [...] }`. Items endpoint expects `id` at top level of body, NOT nested under `params`.
- **Demo Solo user**: `demo@earnest.guru` (id `067e56df-5616-4636-b811-8fd5fc4aef9f`), role "Client Manager" with policies "Client" + "Client Manager".
- **Demo Agency user**: `demo-agency@earnest.guru`, prod org `d409875b-01d7-4f85-84c8-01c9badbb338`, has 2 teams (Creative `1b1b9b64-…`, Delivery `56eb2537-…`) and 4 teammate Members.
- **Both demo users blocked from Stripe routes** by `requireOrgRole` ([server/utils/org-permissions.ts:108](server/utils/org-permissions.ts)). Don't regress.
- **Loading-text predicate** in capture script is `/loading\b/i.test(document.body.innerText)` — case-insensitive, word-boundary at end. So "Loading timeline...", "Loading Tickets", "loading…" all trigger the wait. The `animate-pulse` class is also waited on (Priority Actions skeletons).
- **Capture timing**: 30s loading-gone wait + 8s settle = 38s max per shot. 11 shots × 38s + Vite warmup ≈ ~7-8 min for a full run.

## Notes for Claude

- Session 12 verified the watcher fix works for tickets + leads + most other pages by visiting them in the live browser. The org-teams page is the only known broken surface.
- The new demo-org logos (black "E" circle) are visible in the org switcher across all current captures — that part of the user's request is already done. The only blockers are the org-teams loading bug and the commit/push.
- The `.claude/prompts/launch-queue/session-12-marketing-screenshots-finish.md` file is also untracked — include or delete during commit cleanup. Same pattern for this session-13 file.

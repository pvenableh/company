# Session 12 — Finish marketing-screenshot recapture + commit/deploy

**Status:** Not started — picks up where Session 11 (perm-patch + demo-redirect fix) left off
**Blocker:** none
**Ships:** Clean marketing-site screenshots on earnest.guru + commit of capture-script + composable race-fix changes
**Out of scope:** new features, marketing-site copy

## Context (read these first)

- [project_directus_perm_filter_gotchas.md](memory/project_directus_perm_filter_gotchas.md) — the deref + recursion bugs that were fixed live in Directus on 2026-04-28. Don't re-introduce.
- [project_useorganization_init_race.md](memory/project_useorganization_init_race.md) — why `initializeOrganizations` caches its in-flight promise on `useNuxtApp()`. Don't switch back to `useState`.
- [reference_dev_server_ipv6.md](memory/reference_dev_server_ipv6.md) — dev server is IPv6-only on `[::1]:3000`. Use `http://localhost:3000`, never `127.0.0.1`.

## Prompt

The screenshots that the marketing site at earnest.guru consumes from `~/Sites/earnest/earnest-marketing/public/screenshots/latest/` are mostly good after Session 11's fix (real product, not /organization/new wizard) — but `tickets-kanban.png` still shows a "LOADING TICKETS" spinner overlay, and a few index pages may show emptier states than ideal. Finish the recapture, then commit + push both repos so the marketing site redeploys.

### TL;DR of Session 11 outcomes (already shipped)

- 47 Directus row-perms patched live (3 recursive `organizations` filters + 44 `$CURRENT_USER.organizations.id` derefs).
- 8 new perms added live (`project_tasks`, `tasks_directus_users`, `social_accounts`, `call_logs` for Client / Carddesk / Client Manager policies).
- Local edits in [Sites/earnest/earnest](.) — uncommitted:
  - [scripts/patch-tenant-row-perms.ts](scripts/patch-tenant-row-perms.ts) — corrected deref + reverse-M2M for `organizations` case.
  - [scripts/capture-demo-screenshots.ts](scripts/capture-demo-screenshots.ts) — devtools hide CSS, `domcontentloaded` instead of `networkidle`, API-based detail-id resolver, loading-text waitFor with timeout fallback, SETTLE_MS=5000.
  - [app/composables/useOrganization.js](app/composables/useOrganization.js) — in-flight init promise cached on `useNuxtApp()`.
  - [app/middleware/needs-org.global.ts](app/middleware/needs-org.global.ts) — debug logs already stripped.

### Steps

1. **Diagnose tickets-kanban loading spinner.** Even after the perm fix, the kanban page stays on "LOADING TICKETS" overlay during capture. Probe confirmed the demo user CAN fetch the 2 tickets via `/api/directus/items` POST with the same `fields` array used by [components/Tickets/Board.vue:428](app/components/Tickets/Board.vue:428). [components/Tickets/Board.vue:736](app/components/Tickets/Board.vue:736) sets `isLoading=false` immediately after REST returns, but the screenshot still shows the spinner — likely `useRealtimeSubscription` (line 638-ish) doesn't connect or `ticketsData.value` doesn't repopulate from the WS path. Check Directus realtime perms for the demo user, or whether the WS connection requires anything the demo user lacks. **Easiest fix if WS is the blocker:** display REST-fetched tickets immediately and only switch to WS-driven data when the connection succeeds (current code may already do this — verify by adding a temporary log to confirm `localTickets.value` is populated after REST).

2. **Audit demo Solo data sparseness.** The Solo demo org `40c4d2e5-79d2-4008-9a97-9c14f94dfd0e` has counts: tickets:2, projects:2, clients:5, leads:5, tasks:7, teams:1. The leads page captured looking empty (`0 total leads` in the header) despite 5 leads existing — investigate whether the demo Solo user's perms or the leads page filter is dropping them. If counts are accurate-but-low, decide with the user whether to bulk up the seed via [scripts/setup-demo-org.ts](scripts/setup-demo-org.ts) before re-capturing.

3. **Re-run capture against local dev** (after #1 fix lands):
   ```sh
   set -a && source .env && set +a
   APP_URL=http://localhost:3000 pnpm tsx scripts/capture-demo-screenshots.ts
   ```
   Spot-check 3-4 PNGs in `~/Sites/earnest/earnest-marketing/public/screenshots/latest/` with the Read tool to confirm real product, no spinners, no devtools icon, no /organization/new wizard.

4. **Commit earnest** with all uncommitted Session-11 changes + any new fix from step 1. Suggested message: "Fix demo-org race + capture-script reliability + perm patch script". Don't push; let the user decide.

5. **Commit + push earnest-marketing** at `~/Sites/earnest/earnest-marketing` (only screenshots changed in `public/screenshots/`). Pushing main triggers a Vercel redeploy of earnest.guru so the marketing-site hero + feature pages pick up the new shots.

6. **Confirm with user** before pushing either repo — main-branch pushes deploy.

### DoD

- `tickets-kanban.png` shows a populated board (or at least an honest empty state, not a spinner overlay).
- All 11 shots in `public/screenshots/latest/` show real product (not wizard, not loading state).
- earnest commit landed locally.
- earnest-marketing pushed and earnest.guru redeployed.

## Deferred from Session 11

- The 4 collections that surfaced 403s mid-capture (`project_tasks`, `tasks_directus_users`, `social_accounts`, `call_logs`) had perms added live but are NOT in the patch script's `TENANT_COLLECTIONS` list. If `patch-tenant-row-perms.ts` is ever re-run from scratch on a fresh Directus, those perms won't be re-created. Add them to the script for reproducibility — `social_accounts` scopes by `client.organization`, `call_logs` scopes by `_or` (user_created OR related_contact.client.organization OR related_lead.organization), junctions get unfiltered read.

## Critical gotchas

- **Dev server is IPv6-only on `[::1]:3000`.** Use `http://localhost:3000` for `APP_URL`. `127.0.0.1` refuses the connection; direct `[::1]` returns 426.
- **`networkidle` waits hang on prod** because `app.earnest.guru` keeps notification long-poll connections open. The capture script uses `domcontentloaded`. Don't switch back.
- **The capture script's API resolver** (used to find first `/contacts/<id>`, `/clients/<id>`, etc.) does `page.evaluate(fetch('/api/directus/items'))` — needs an established origin. Resolver pre-navigates to `/command-center` with `domcontentloaded` first. Don't break that.
- **`/api/directus/items` POST returns a raw array `[...]`**, not `{ data: [...] }`. Resolver handles both shapes — keep that.
- **Demo Solo user**: `demo@earnest.guru` (id `067e56df-5616-4636-b811-8fd5fc4aef9f`), role "Client Manager" with policies "Client" + "Client Manager".
- **Demo Agency user**: `demo-agency@earnest.guru`, prod org `d409875b-01d7-4f85-84c8-01c9badbb338`, has 2 teams (Creative `1b1b9b64-…`, Delivery `56eb2537-…`) and 4 teammate Members.
- **Both demo users blocked from Stripe routes** by `requireOrgRole` ([server/utils/org-permissions.ts:108](server/utils/org-permissions.ts:108)). Don't regress.
- **Agency demo-login was observed to 500 once mid-capture** then succeeded on retry — likely a transient cache or perm issue. If it recurs deterministically, dig in; if it's still flaky, retry once before declaring failure.

## Notes for Claude

- The session that produced this prompt finished with the demo-redirect fix verified by the user (`/try-demo` → Solo lands on dashboard) and 10/11 captures looking real. Only outstanding visible defect is the tickets spinner.
- Session 11 also created memory entries for the deref bug and the init race — those are the load-bearing pieces of context for understanding why the Directus perms and `useOrganization.js` look the way they do now.
- The marketing repo's last deploy commit (`fbac4be Updated screenshots`, 2026-04-28 19:28 ET) committed broken /organization/new wizard PNGs — that's what's currently live on earnest.guru. Replacing those is the user-visible payoff of this session.

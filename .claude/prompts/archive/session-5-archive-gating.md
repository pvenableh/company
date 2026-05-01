# Session 5 — Archive-first org lifecycle (4b: query gating + cron)

**Status:** Not started
**Blocker:** Session 4 must have shipped (`organizations.archived_at` must exist in schema and `/api/orgs/:id/archive` must be live).
**Ships:** query gating across ~20 surfaces + archived-org UI banner + org-switcher filter + cleanup cron + bug-4 closure

## Prompt

Archive-first org lifecycle — query gating + cleanup cron. Part 2 of 2.

**Prerequisite:** Session 4 shipped.

TL;DR: Session 4 added `archived_at` + endpoints but archived orgs still leak into every org-scoped view because queries don't filter them out. This prompt closes that gap (Phase C₂-sized audit) and wires the retention cleanup cron.

### Steps

1. **Query-gating audit.** For every org-scoped data fetch, add `{ archived_at: { _null: true } }` to the filter. Surfaces:
   - `app/composables/use*.ts` (14 audited in Phase C₂ — same pattern)
   - `server/utils/entity-context.ts` (AI context broker — critical)
   - `server/utils/org-permissions.ts`
   - Every `server/api/*` route that queries on org
   - Admin dashboards that list orgs (SUDO-level views excluded — those SHOULD show archived)
   - Search / global command palette
   Report as a checklist per file.
2. **UI banner.** When `selectedOrg.archived_at` is set, render a banner: "Organization archived — restores until {archived_at + 90 days}" and block writes (disable create/edit/delete actions).
3. **Org switcher.** Exclude archived orgs unless "Show archived" toggle is on.
4. **Cleanup cron.** Directus Flow (schedule, daily) that:
   - Finds orgs with `archived_at < now() - 90 days`
   - Calls `purge-demo-org.ts` walk as a server endpoint
   - Dry-run mode gated by feature flag for the first week
5. **Update `purge-demo-org.ts`** header: remove Bug-4-workaround comments, note it's now the cleanup-job body.
6. **Close Bug 4** as "superseded — archive-first lifecycle shipped."

### DoD

- A newly archived org disappears from every sidebar / list / AI context immediately.
- Write actions blocked in archived orgs.
- Cleanup cron exists in dry-run mode; verified by fixture test.
- Bug 4 closed.

## Notes for Claude

- The Phase C₂ audit pattern ships as `{ org_id: { _eq: orgId }, archived_at: { _null: true } }`. Do NOT replace the existing org filter — extend it.
- `entity-context.ts` is load-bearing for the AI sidebar — a leak here means an archived org's data could be fed to a sibling org's AI chat. Test this path explicitly.
- `purge-demo-org.ts` lives at `scripts/purge-demo-org.ts` per memory. Confirm current location.
- "Bug 4" refers to the cascade-delete bug tracked in `memory/project_demo_seed_bugs.md` (on the Mac). That file is local — if you're on iPad/Codespace without that memory, skip the closure step and leave a note that the Mac memory must be updated later.
- Dry-run feature flag: grep for existing feature-flag infra. If none, use a single env var like `ORG_CLEANUP_DRY_RUN=true` for the first week, default to true if unset.

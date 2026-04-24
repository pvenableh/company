# Session 7a — Phase C₂ deferred composables

**Status:** Not started
**Blocker:** post-launch; needs null-org backfill run first
**Ships:** org-scoping guards on `useLeads` and `useProposals`

## Prompt

Phase C₂ deferred composables — finish the audit.

Context: during Phase C₂, 14 composables were audited and guarded for org-scoping. Two were deferred because some orgs in the DB had null org FKs on the underlying rows, which would have made the guard break existing flows. Those need backfilling first, then the same guard pattern applied.

### Steps

1. **Backfill first.**
   - `useLeads`: run `scripts/backfill-null-org-leads.ts` if it exists (grep to confirm). Dry-run, inspect, then apply.
   - `useProposals`: check if a backfill script exists for proposals. If not, clone the leads script's pattern to create one.
2. **Apply guards.** Same pattern as the 14 already-audited composables: add `{ org_id: { _eq: orgId } }` to the Directus filter, plus `{ archived_at: { _null: true } }` if Session 5 shipped.
3. **Smoke-test** each composable: create a lead/proposal in Org A, switch to Org B, confirm it's not visible.

### DoD

- Both composables scoped to the current org.
- Smoke test confirms no cross-tenant visibility.
- Any deferred-task memory entries closed.

## Notes for Claude

- Look up `useLeads` and `useProposals` in `app/composables/`.
- The 14-composable Phase C₂ pattern is in commits `6741feb`, `19acdcc`, `5f745c5` per Mac memory — `git log --all --grep="Phase C₂"` or check those commits for the exact edit shape.
- If Session 5 hasn't shipped, skip the `archived_at` guard and just scope on `org_id`.

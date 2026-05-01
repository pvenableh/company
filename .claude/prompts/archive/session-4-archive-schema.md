# Session 4 — Archive-first org lifecycle (4a: schema + routes)

**Status:** Not started
**Blocker:** none
**Ships:** schema migration + two endpoints + Stripe cancellation wiring + UI archive toggle
**Out of scope:** query gating (goes to Session 5) and hard-delete cleanup (also Session 5)

## Prompt

Archive-first org lifecycle — schema + routes. Part 1 of 2.

TL;DR: Per user direction, orgs never hard-delete through user flows. Churn = archive (soft delete). Actual DELETE happens later via a cleanup cron (see Session 5). This prompt covers the schema + endpoints + Stripe cancellation wiring + UI archive toggle. The query-gating audit — which is Phase C₂-sized — is deliberately deferred to Session 5.

Replaces Bug 4 in `memory/project_demo_seed_bugs.md` (cascade-delete).

### Steps

1. **Schema.** Add `organizations.archived_at` (timestamp nullable). Idempotent setup script.
2. **POST `/api/orgs/:id/archive`:**
   - Sets `archived_at = now()`
   - Cancels Stripe subscription (decide: immediate vs. at-period-end)
   - Logs audit event
   - Blocks demo orgs via `requireOrgRole`
3. **POST `/api/orgs/:id/restore`:**
   - Clears `archived_at`
   - Optionally reactivates Stripe
4. **UI.** Archive button on org settings → confirmation modal. Clear copy: "Your data is retained for 90 days. Restore any time before then."
5. **Basic smoke:** archive a throwaway org → Stripe sub cancelled → restore → sub reactivated.

### DoD

- Schema migrated.
- Archive + restore routes work end-to-end.
- Stripe integration correct.
- UI button wired.

### OUT OF SCOPE (goes to Session 5)

- Query gating — archived orgs will still leak into views until Session 5 lands. This is acceptable short-term; warn users not to archive a live org between Sessions 4 and 5.
- Cleanup cron — no hard-delete happens yet.

## Notes for Claude

- `requireOrgRole` lives in `server/utils/` — grep for its exact path.
- Demo orgs to block: look up the two demo-user emails in memory or in `scripts/setup-demo-*.ts`. Pattern is `demo@earnest.guru` + `demo-agency@earnest.guru`.
- Stripe wiring reference: search for existing cancel-subscription flow in `server/api/` — there's likely a webhook handler pattern to mirror.
- Idempotent setup script convention: the repo already has several at `scripts/setup-*.ts` — mirror that structure (read existing state, patch only if missing).

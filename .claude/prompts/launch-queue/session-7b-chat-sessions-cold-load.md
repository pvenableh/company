# Session 7b — Newer chat sessions not surfacing on cold load

**Status:** Not started
**Blocker:** post-launch
**Ships:** fix for a data-side bug spotted during Phase A₂

## Prompt

Phase A₂ data-side bug — newer chat sessions not surfacing on cold load.

Symptom: when a user cold-loads the app (hard nav, no prior session state), the AI sidebar's list of prior chat sessions is missing the most recent ones. On a client-side navigation or refresh the list fills in correctly. Suggests an SSR vs. CSR divergence in the fetch path — likely the same class of bug as the Phase C SSR cold-load cascade (commit `7121ea0`), where `$fetch` in a composable didn't forward the request cookie during SSR.

### Steps

1. **Reproduce.** Hard-nav to any entity page with the AI sidebar open. Check the chat-session list: does the very latest session appear? If not, refresh — does it now appear?
2. **Identify the fetch.** Grep for the composable/endpoint that populates the AI sidebar's session list — probably `useAIChat*`, `useAINotes`, or similar, hitting `/api/ai/sessions` or equivalent.
3. **Diagnose.** Likely causes, in order:
   - `$fetch` instead of `useRequestFetch()` during SSR (same bug as Phase C — fix pattern is identical)
   - Stale cache keyed on empty session state during SSR
   - Missing `org_id` filter now that org scoping exists (less likely — would fail fully, not intermittently)
4. **Fix and verify.** Hard-nav test, then incognito + cold-load test.

### DoD

- Freshly created chat session appears in the sidebar list after a hard-nav.
- No regression on client-nav list render.

## Notes for Claude

- The Phase C fix pattern: `$fetch` → `useRequestFetch()`, and bypass module-level cache during SSR. See commit `7121ea0` / `server/utils/` or `app/composables/useDirectusItems.ts`.
- If the fix is identical to Phase C, the PR should be tiny — just the two changes on whichever composable owns chat sessions.

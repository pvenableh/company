# Session 6 — Pre-launch smoke test (final gate)

**Status:** Not started
**Blocker:** Sessions 1–5 all shipped. If any are deferred, note in the smoke report which scenarios are expected to fail.
**Ships:** nothing new — this session is a checklist-driven verification pass
**Gating:** **any failed scenario blocks launch.**

## Prompt

End-to-end smoke test of every critical user path on prod `earnest.guru` before opening signups.

**Prerequisite:** Sessions 1–5 all shipped. If any are deferred, note in the smoke report which scenarios are expected to fail.

TL;DR: Last gate before going live. Exercise the golden path for each persona (new user, admin, member, demo-agency), confirm no 500s or data leaks across tenants.

### Steps

1. **New user signup → Stripe checkout → org created → first login → dashboard loads.** Verify:
   - Welcome tour fires
   - Default data present
   - AI tokens initialized
   - Plan gating reflects purchased tier
2. **Existing user login** → sidebar, notices, search all render — no "Broken." pages, no 403/500 in network panel.
3. **Org switching.** User in multiple orgs: switch orgs, confirm no data from Org A leaks into Org B views (sidebar, AI context, mailing lists, contacts, clients).
4. **Demo mode.** Both `/try-demo` paths (solo + agency) still work post-plan rename. Demo user blocked from Stripe routes (404 or friendly error).
5. **Marketing surface.** Now that Bug 2 is fixed: create a list, add multiple contacts, send a test newsletter. Confirm unsubscribe link works.
6. **OAuth social connects.** Meta, TikTok, LinkedIn all round-trip.
7. **Mobile viewport check.** Every top-level route at 375px width — no layout break.
8. **AI sidebar on every entity.** Open sidebar on a ticket, lead, proposal, invoice, contact, client, project, team — confirm context loads.
9. **Stripe Customer Portal.** Cancel, reactivate, update payment method — all round-trip correctly.
10. **Archive flow.** Archive a throwaway org, confirm it disappears from switcher + all views, restore it.

**Report format:** markdown checklist, one bullet per scenario, pass/fail, evidence links (`preview_screenshot` outputs). Any fail blocks launch.

### DoD

- Every bullet above passes or has an approved workaround.
- No 500s in server logs during smoke test.
- No cross-tenant data leaks observed.

## Notes for Claude

- Run against **prod `app.earnest.guru`**, not local dev. Use the preview tooling to actually browse prod.
- For item 3 (cross-tenant leak): pick one email address that has orgs in at least two different tenants (or set that up first). Verify AI sidebar specifically — it's the highest-risk surface.
- For item 4 (demo users): both `demo@earnest.guru` and `demo-agency@earnest.guru` should 404 or friendly-error on any `/api/stripe/*` or `/account/subscription` route.
- For item 6 (OAuth): prerequisite is that the 8 redirect URIs from `.claude/prompts/launch-queue/` sibling doc (the paste table at `/social/setup`) have been entered into the correct dev consoles.
- For item 10 (archive): depends on Sessions 4 + 5. If either is deferred, skip this bullet and flag in the report.
- Write the final report to `docs/launch-smoke-report.md` so it's committed alongside the ship.

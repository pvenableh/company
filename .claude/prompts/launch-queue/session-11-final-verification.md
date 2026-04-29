# Session 11 — Final pre-launch verification

**Status:** Not started
**Blocker:** Sessions 8 + 9 + 10 shipped 2026-04-28. Pick this up only after the live Stripe env vars are pasted into Vercel and at least one production deploy has happened against the new code.
**Ships:** the last verification gates before opening public signups — mobile viewport, AI sidebar parity, end-to-end Stripe checkout smoke, and arming the archive-cleanup cron.
**Out of scope:** new features, code changes (anything beyond a one-line bug fix should become a separate session).

## Prompt

Final-verification pass before opening signups on `app.earnest.guru`. The point of this session is to **prove the launch is safe**, not to add anything. If a check fails, file a follow-up — don't silently fix and move on.

### Steps

1. **Mobile viewport at 375px.** The Session-6 smoke report noted that `resize_window` does not actually change the rendered viewport — Chrome still serves desktop breakpoints. So this check needs a real mobile device OR Chrome DevTools device-emulation mode (Cmd+Shift+M, pick iPhone 14, refresh). Do NOT trust any agent that says "tested at 375px" via headless browser tools.

   Routes to load and inspect at 375×812:
   - `/` (dashboard) — does the nav drawer open? Do the widget cards stack cleanly? Do the empty-state CTAs from session 10 render?
   - `/tickets` — table or card view? Filters reachable?
   - `/clients` — list legible? "+ New Client" button reachable?
   - `/leads` — pipeline board horizontal-scrolls? Junk filter visible?
   - `/scheduler` — day Gantt readable at narrow width?
   - `/marketing` — at-a-glance numbers fit?
   - `/financials` — quarter cards stack vs. truncate?
   - `/account` — settings forms not clipped?

   Look for: horizontal scroll on body (red flag), modals that exceed viewport, FloatingDock conflicting with iOS bottom bar, illegible text under 11px, tap targets under 44×44pt.

   **DoD for this step:** screenshot each route at 375px and paste into the report. Flag any layout breaks as separate bug tickets — do not inline-fix in this session.

2. **AI sidebar parity spot-check.** From a logged-in account that has data in every entity type (the agency demo `demo-agency@earnest.guru` is the easiest), open the contextual AI sidebar on one example of each:
   - ticket detail
   - lead detail
   - proposal detail
   - invoice detail
   - contact detail
   - client detail
   - project detail
   - team detail

   For each, confirm: (a) sidebar opens, (b) entity context loads (no "no context available" fallback when there should be one), (c) sending a message gets a response that references entity-specific facts (lead stage, ticket status, invoice amount — something proving the broker fed real data in). The Session-6 smoke report skipped this because the Chrome MCP connection dropped; do it now from a real browser.

   **DoD:** all 8 entity types confirmed working. If any fail, capture the network request to `/api/ai/chat` (request body + response) and file a follow-up.

3. **Stripe checkout smoke (live mode, real card).** Once the live env vars are in Vercel and a deploy has rolled out, do one full end-to-end signup as a brand new email:
   - `/auth/register` → set up org → `/organization/new?step=plan` → pick **Solo Monthly** (cheapest live SKU)
   - Complete Stripe checkout with a real card (not the test 4242 numbers — those won't work in live mode)
   - Confirm: redirect back to `/organization/new?step=invite&checkout=ok`, org gets `plan` set, invoice created, welcome email arrives
   - Visit `/account` → confirm subscription status reads "active"
   - Cancel via Stripe Customer Portal — confirm the org doesn't immediately archive (cancellation should mark `cancel_at_period_end`, not delete)

   **DoD:** one paid signup that you can visually trace from card-charged → org-active → email-sent. Refund the test charge from the Stripe dashboard once verified.

4. **Arm the archive-cleanup cron.** From the archive-lifecycle ship (Session 5), the daily Vercel cron at `/api/org/cleanup-archived` runs in dry-run mode. Watch the cron output for ~2 days (deploy logs at 11:00 UTC each day) — confirm it lists the orgs it *would* delete and matches your expectations. When you're confident, set `ORG_CLEANUP_DRY_RUN=false` in Vercel env vars and redeploy.

   **DoD:** at least 2 dry-run cron logs reviewed; arming flip recorded with a date. If the dry-run shows orgs you don't want deleted, debug before arming.

5. **Drop the legacy `people` collection.** Session 10 hid the `people` collection (Directus admin → Settings → Data Model → `people` → meta hidden + deprecation note) and disabled the `Contacts Sync` and `People Sync` flows. After at least 2 weeks of "nobody noticed":
   - Confirm both flows still show `inactive` (someone might re-enable by accident)
   - Confirm no app code references `people` (`grep -r "useDirectusItems\(['\"]people['\"]\)"` and `grep -r "/items/people"` should return nothing in `app/` or `server/`)
   - Drop via Directus admin → Data Model → `people` → "Delete Collection". This cascades the rows.

   **DoD:** collection gone; one final `pnpm tsx scripts/audit-people-vs-contacts.ts` confirms the 403 (collection not found).

### DoD (overall)

- All 8 routes render cleanly at 375px (or any breaks have follow-up tickets)
- AI sidebar verified on all 8 entity types
- One end-to-end live Stripe signup completed and visually traced
- `ORG_CLEANUP_DRY_RUN=false` flipped, deployment recorded
- `people` collection dropped (or, if still inside the 2-week window, this step deferred to a future session)

## Notes for Claude

- Steps 1, 2, 3 require a human-driven browser. An agent without a real visible browser **cannot** verify these — say so explicitly rather than claiming success. Step 4 and 5 are CLI/admin tasks an agent can handle.
- For step 3, the live Stripe env vars must already be in Vercel. If they're not, stop and tell the user — don't try to test against test-mode keys (the URL paths and webhook IDs differ).
- Don't inline-fix anything found here. The point of a verification session is to *report*, not to mix verification and remediation in the same pass — that's how regressions get missed.
- After this session ships, the launch-queue queue is empty except for sessions 7a–7d (post-launch deferred). Update `MEMORY.md` "Next up" to reflect the launched state and remove the launch-queue table from the README's "in flight" column.

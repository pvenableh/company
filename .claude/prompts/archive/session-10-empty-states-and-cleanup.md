# Session 10 — Empty-state polish + people→contacts cleanup + miscellaneous

**Status:** Not started
**Blocker:** Sessions 8 + 9 should ship first — empty-state work is wasted if the data is wrong, and Stripe wiring should be live before users see "set up your first invoice" prompts
**Ships:** empty-state CTAs across dashboard widgets, deprecation of the `people` collection in favor of `contacts`, lead-form spam protection, miscellaneous polish
**Out of scope:** new features

## Prompt

Polish + housekeeping pass before opening signups.

### Steps

1. **Empty-state CTAs on the dashboard widgets.** When a brand-new org loads `/`, the user currently sees skeleton loaders that resolve to "0" / "—" / blank charts with no guidance on what to do next. Add a clear empty-state for each widget that includes a CTA:
   - **Financial Analysis / Revenue widgets** → "Create your first invoice" → `/invoices/new` (or whatever the create route is)
   - **CRM Health** → "Add your first client" → `/clients/new`
   - **Project Timeline** → "Create your first project" → `/projects/new`
   - **Earnest Score** → "Complete your first ticket to start scoring" (no destination CTA — score is automatic)
   - **Goals** → already has "Create a Goal" empty state — verify it works
   - **Priority Actions** → already has "You're all caught up!" empty state — fine as is
   - **Quick Tasks** → already has "No tasks yet / Add tasks above or let AI suggest some" — fine
   - **Suggestions** → has 4 hardcoded suggestions; for orgs with no data those are wrong context. Either suppress for empty orgs or rewrite generation logic to match new-org context.
   - **Channels** → "No channels yet" CTA → "Create a channel"
   - **CardDesk** → "Start scanning cards"
   - **Recent Activity** → "Your activity will appear here as you work"
   - **Ticket Activity** → already shows skeleton — replace with "Open your first ticket" CTA when count is 0

2. **`people` → `contacts` cleanup** (legacy collection drop):
   - Audit `people` collection rows that don't appear in `contacts` (compare by email). With ~10-row delta from last check, hand-resolve.
   - Add `is_team_member` field to `contacts` if you want an explicit flag (or rely on `contacts.user IS NOT NULL` as the team-member signal — pick one and document)
   - Backfill: for every `people` row with `is_team_member: true`, ensure a corresponding `contacts` row exists via `ensureContactForUser`-style upsert
   - Update or remove any Directus Flows that write to `people`
   - Rename `people` → `_legacy_people` in Directus (keeps data, hides from UI)
   - Drop `_legacy_people` after a couple of weeks of "no one noticed"

3. **Lead-form spam protection.** Smoke report flagged 42 spam/junk leads in prod (`/leads` showed entries like "ZXQFWSVseISJlkxiwJJTk fPGEEtRVEYycVATgvVhgNndbPGsUqirjJYQxd", lorem-ipsum, dot-trick gmail addresses). Add either:
   - hCaptcha or Turnstile widget on the public lead form (preferred — no backend rate limiting needed, free tier is fine for volume)
   - Or a simple rate-limit middleware on `/api/leads/submit` (or wherever the public form posts) — N submissions per IP per hour
   - Sweep existing junk leads (script that flags leads matching a heuristic — short random-string names, disposable domains, no IP — and either soft-deletes or moves to a "spam" stage)

4. **Mobile viewport pass.** The Session-6 smoke report couldn't verify mobile because `resize_window` doesn't actually scale the rendered viewport. Either:
   - Test on a real device or via browser devtools at 375px wide
   - Or verify via Cypress / Playwright with mobile viewport emulation
   - Top routes to check: `/`, `/tickets`, `/clients`, `/leads`, `/scheduler`, `/marketing`, `/financials`, `/account`. Look for: nav drawer reachable, no horizontal scroll, modals fit, dock doesn't conflict with mobile tab bar.

5. **AI sidebar parity.** Smoke report deferred this; verify briefly that opening the sidebar on each entity type (ticket, lead, proposal, invoice, contact, client, project, team) loads context without error.

6. **Miscellaneous bugs noted but not blocking:**
   - `[SmartPrompts] Fetch failed — falling back to static prompts: TypeError: e.getItems is not a function` — broken `useDirectusItems` destructure somewhere; falls back gracefully but hunt down the root cause.
   - `/tasks` shows "Connection Lost — Attempting to reconnect…" on first hit (realtime websocket); resolves on its own but creates a confusing first-impression for new signups.
   - Org-switcher button at [`ClientSelect.vue:76-77`](app/components/Layout/ClientSelect.vue:76) sets `title="Switch organization"` but click handler hardcodes `navigateTo('/organizations')` — the modal switcher (`LayoutOrgSwitcher`) is never reachable from the header. Either honor the modal path or remove the dead `@open-org-switcher` emit + mount in `Header.vue`.
   - `/organizations` page shows "H" initials avatar instead of the org logo even when an icon is set — `getIconUrl()` is computed correctly but the page doesn't render `<img>`. Cosmetic.

### DoD

- Empty-state CTAs render for every dashboard widget when the org has no data
- `people` collection is renamed (or dropped) and no active code reads from it
- Lead form has spam protection in place; existing junk swept
- Mobile viewport renders cleanly at 375px on all top-level routes
- AI sidebar loads on all 8 entity types

## Notes for Claude

- Empty-state pattern: most widgets already have the structure (`v-if="loading"` skeleton, `v-else-if="data.length"` content). Add a `v-else` empty branch with a Lucide icon, label, and a `Button` linking to the relevant create route.
- For the Suggestions widget specifically: check if generation logic respects "this org has no data" — if so, the right move is to seed first-run-friendly suggestions ("invite your team", "create your first invoice", "add a client").
- People-cleanup audit: `compare-people-contacts.ts` script doesn't exist yet — you'll write it. Pattern: `SELECT email FROM people WHERE email NOT IN (SELECT email FROM contacts)`.
- For mobile testing without a real device: use Chrome DevTools' device emulation (Cmd+Shift+M, pick iPhone 14, refresh). The `resize_window` MCP tool doesn't change the viewport breakpoint — it just resizes the OS window.

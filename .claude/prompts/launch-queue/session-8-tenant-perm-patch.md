# Session 8 — Tenant row-perm patch (real cross-tenant fix)

**Status:** Not started
**Blocker:** none — but ship before opening signups
**Ships:** Directus permission patch + Vue state reset on user change + verification re-run
**Out of scope:** new features, UI work

## Prompt

Close the cross-tenant read leak that the smoke report flagged as a launch blocker. Audit script already exists.

TL;DR: Currently any authenticated user can read every other tenant's `mailing_lists`, `contacts`, `tickets`, `projects`, `invoices`, etc. by sending a query without an `organization` filter. The app's UI hides this with composable-level filters, but the actual security boundary is missing — anyone with devtools can scrape every tenant's data. Plus Vue state retains the previous user's `organizations` list across user-change in the same browser, which masks the bug from showing up in normal flows.

### Background

The audit was run during the Session-6 smoke test and the results are committed at `scripts/audit-tenant-row-perms.ts` (read-only). Re-run before patching:

```bash
pnpm tsx scripts/audit-tenant-row-perms.ts
```

Last run found **50 unscoped reads across 4 non-admin policies**:
- **Public** policy (`$t:public_label`) has wide-open reads on tenant collections — applies to authenticated users as a fallback, that's the actual leak
- **Client Manager** (default Directus role for new users via `NUXT_PUBLIC_DIRECTUS_ROLE_USER`) only has 1 explicit read row (expenses) — relies on Public for everything else
- **Client** policy has unscoped reads
- **Carddesk User** has unscoped reads

Schema check: `directus_users.organizations` is an M2M alias (verified). The right filter shape is `{ "organization": { "_in": "$CURRENT_USER.organizations.id" } }`.

### Steps

1. **Inventory public-facing routes** that legitimately need unauthenticated reads. At minimum check:
   - Public booking pages (`video_meetings`, host availability)
   - Public invoice preview (`invoices`, `clients`, `organizations`)
   - Public unsubscribe (`mailing_list_contacts`, `mailing_lists`)
   - Public lead-form submission (write only — verify reads aren't needed)
   - Public approval pages (`/approve/*`)
   Document the minimum read fields each needs.

2. **Backup current `directus_permissions`** to a JSON file before any change. Single-row revert path.

3. **Patch Public policy:**
   - Drop blanket reads on tenant collections
   - Add narrow reads only for the surfaces in step 1, scoped by row filter where possible (e.g. `mailing_list_contacts.read` filtered by a token field for unsubscribe)

4. **Patch Client Manager policy:**
   - Add scoped read for every tenant collection: `{ "organization": { "_in": "$CURRENT_USER.organizations.id" } }`
   - Tenant collections to cover (from the audit + smoke-report findings):
     `tickets`, `projects`, `tasks`, `clients`, `leads`, `contacts`, `contact_connections`, `proposals`, `invoices`, `invoice_items`, `payments_received`, `expenses`, `mailing_lists`, `mailing_list_contacts`, `email_templates`, `email_campaigns`, `comments`, `products`, `time_entries`, `video_meetings`, `calendar_events`, `channels`, `channel_messages`, `teams`, `team_goals`, `org_roles`, `org_memberships`, `ai_notes`, `ai_notices`, `ai_chat_sessions`, `ai_chat_messages`, `ai_context_snapshots`, `ai_preferences`
   - For `organizations` itself: `{ "id": { "_in": "$CURRENT_USER.organizations.id" } }`

5. **Patch Client + Carddesk User policies** — same pattern, restrict to their org via the same filter.

6. **Vue state reset on user change.** [`useOrganization.js:196`](app/composables/useOrganization.js:196) bails if `isInitialized.value` is already `true`, so Vue state retains the previous user's orgs across login swaps. Either:
   - Reset `isInitialized`, `organizations`, `selectedOrg`, `error` on `loggedIn` watch fire (in `useDirectusAuth.js:260` watcher), or
   - Reset in `clearOrgSelection()` and call it on signOut/register/signIn (already wired)

7. **Verification:**
   - Re-run `scripts/audit-tenant-row-perms.ts` — every Client Manager / Client / Carddesk row should show `OK: has organization scope`
   - As a throwaway user with one empty org, hit the dashboard. Should show **zero** of every tenant collection (no leak from hue).
   - As `peter@huestudios.com`, hit the dashboard. Should still show hue's data normally.
   - Open devtools, fire `fetch('/api/directus/items', { method: 'POST', body: JSON.stringify({ operation: 'list', collection: 'mailing_lists', query: { fields: ['id','name','organization'] } })})` — should return only your own org's lists.

### DoD

- Audit script returns 0 unscoped reads on Client Manager / Client / Carddesk policies
- Public policy reads only the minimum needed for unauth flows
- Backup JSON of pre-change permissions saved (path documented in commit message)
- Verification queries all return tenant-scoped results
- Vue state resets on user-change so the symptom can't surface even briefly

## Notes for Claude

- Backup before any mutation. Use the Directus REST API at `/permissions?filter=...` to fetch all current rows; write to `docs/perms-backup-YYYY-MM-DD.json`.
- The Directus filter language: `$CURRENT_USER.organizations.id` resolves the M2M alias. Test with one collection first (`mailing_lists`) before bulk-applying.
- Public unsubscribe needs `mailing_list_contacts` reads scoped by `unsubscribe_token` — narrow to that one field path, not the whole row.
- `organizations.read` for Client Manager: filter to `{ "id": { "_in": "$CURRENT_USER.organizations.id" } }`. Without this they can't even render the org switcher.
- Smoke-test verification flow: re-run the relevant scenarios in `session-6-smoke-test.md` (#3 cross-tenant leak, #5 marketing) — both should pass after this lands.

# Pre-launch smoke report — `app.earnest.guru`

**Run date:** 2026-04-28
**Tester:** Claude (driven by Peter Hoffman)
**Account used:** `peter@huestudios.com` (Member of `hue` org only)
**Scope:** Session 6 launch-queue checklist (`.claude/prompts/launch-queue/session-6-smoke-test.md`)

## Verdict: 🚨 **BLOCK LAUNCH**

Three critical defects in the marketing/list pipeline plus a tenant-isolation gap. Per the Session-6 DoD ("any failed scenario blocks launch" + "no cross-tenant data leaks observed"), these gate launch on their own.

## Scenario summary

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | New signup → Stripe checkout → org → first login | ⏭️ DEFERRED | Stripe live price IDs not wired (per `reference_stripe_wiring.md`). Untestable until they are. |
| 2 | Existing user login + nav | ✅ PASS *(with caveat)* | All 13 top-level routes render. One transient burst of 17 × `/api/directus/*` 500s at 1:31:39 PM did not recur after console clear + re-nav. Suspected cold-start. |
| 3 | Org switching, no cross-tenant leak | 🚧 BLOCKED | `peter@huestudios.com` is a member of **only one** org (`hue`). The leak test requires an account in ≥2 orgs. Need to either (a) add peter to a second org, or (b) test from a different multi-org account. |
| 4 | Demo mode + Stripe-route block on demo users | ✅ PASS *(code-level)* | `try-demo.vue` uses `middleware: 'guest'`; logged-in user bounced to `/organizations` as expected. `requireOrgRole` ([server/utils/org-permissions.ts:108-141](server/utils/org-permissions.ts:108)) hard-blocks both demo emails with 403. All 4 Stripe-subscription routes plus `org/*/archive` and `org/*/restore` use `requireOrgRole`. Full runtime test would require swapping to the demo session, which would clobber peter's. |
| 5 | Marketing — list, contacts, newsletter, unsubscribe | ❌ **FAIL** | **Three confirmed bugs.** See "Critical findings" below. UI is unusable; data layer cannot be exercised end-to-end. |
| 6 | OAuth Meta / TikTok / LinkedIn round-trip | ⏭️ DEFERRED | Per user: redirect URIs still pending in dev consoles. |
| 7 | Mobile viewport at 375px | 🚧 PARTIAL | `resize_window` to 375×812 did not actually scale the viewport (browser kept rendering at desktop ≥1396 wide). Mobile breakpoint behavior cannot be verified through the current tooling — needs a real mobile device or DevTools-emulated viewport. |
| 8 | AI sidebar context on every entity | ⏭️ NOT RUN | Chrome MCP connection dropped before this could start. |
| 9 | Stripe Customer Portal | ⏭️ NOT RUN | Mutates billing state; held until user explicitly approves running it. |
| 10 | Archive throwaway org + restore | ⏭️ NOT RUN | Destructive on shared infra; held until user explicitly approves. |

## Critical findings

### 🚨 1 — Cross-tenant read leak on `mailing_lists`

Authenticated as `peter@huestudios.com` (Member of `hue` only), a request to `/api/directus/items` for collection `mailing_lists` **without an org filter** returns lists from every org:

```
totalLists: 4,
listsByOrg:
  423f5e7e... (hue):              ['Hue Newsletter', 'Smoke Test 2026-04-28']
  d409875b... (Earnest Demo — Agency): ['Active Clients', 'Prospects']
```

The app-level filter in [`useMailingLists.ts:13-22`](app/composables/useMailingLists.ts:13) does scope by `organization`, so the UI hides this — but a user with devtools (or any third-party API client) can read every other tenant's mailing-list metadata.

**Same query also returns the full `organizations` collection** (3 orgs total) when peter only belongs to one. Less severe but still a tenant-isolation concern.

**Root cause:** Directus row-level permissions for the Member role on `mailing_lists` (and likely `organizations`) don't enforce an org-scoped filter. Same shape of bug as the closed `Public Write Audit` from 2026-04-17, but on the *authenticated read* axis instead of the *public write* axis.

**Recommended fix:** Audit Member-role row filters across every collection that has tenant data (`mailing_lists`, `mailing_list_contacts`, `email_templates`, `contacts`, `clients`, `leads`, `proposals`, `invoices`, `tickets`, `projects`, …). Add `organization._eq.$CURRENT_USER.organizations.id` (or equivalent) wherever it's missing.

### 🚨 2 — `<ListCard>` and `<ListMemberTable>` don't auto-import in Nuxt 4

[`app/pages/lists/index.vue:46`](app/pages/lists/index.vue:46) references `<ListCard>` and [`app/pages/lists/[id].vue:69`](app/pages/lists/[id].vue:69) references `<ListMemberTable>`. Under Nuxt 4's directory-prefixed component naming (the codebase uses `<ListsFormModal>` correctly two lines below `<ListCard>`), these need to be `<ListsListCard>` and `<ListsListMemberTable>` respectively.

Symptom: the components render as literal `<listcard>` / `<listmembertable>` HTML elements with empty content. The lists index page shows the heading + "+ New List" button and *nothing else* — even when 2 lists exist in the org. The detail page renders the title but its body never escapes the skeleton state because the component slot is empty.

**Fix:** rename two occurrences. Trivial.

### 🚨 3 — `mailing_list_contacts` Directus perms 403 on nested fields

[`useMailingLists.ts:52-64`](app/composables/useMailingLists.ts:52) queries `mailing_list_contacts` with filters on `contact_id.status`, `contact_id.email_subscribed`, `contact_id.email_bounced`. Directus returns:

> 403 — You don't have permission to access fields "contact_id.status", "contact_id.email_bounced", "contact_id.email_subscribed" in collection "mailing_list_contacts" or they do not exist.

Because `loadData()` in `lists/[id].vue` doesn't catch the rejection, `loading.value` stays `true` and the page is permanently stuck on skeleton placeholders. Even after the auto-import bug above is fixed, the page won't show contacts.

**Fix:** Update the Member role's permissions on `mailing_list_contacts` to allow reading those nested `contact_id.*` fields, OR restructure the query to avoid the nested filter (denormalize, or fetch contact metadata in a follow-up).

### ⚠️ 4 — Transient burst of 17 × 500 errors on `/api/directus/*`

At 1:31:39 PM during the nav spot-check (scenario 2), 17 errors fired in a single second:
- 14 × `Failed to fetch org membership: FetchError: [POST] "/api/directus/items": 500`
- 1 × `Error loading notifications: FetchError: [POST] "/api/directus/notifications": 500`
- 1 × `Error fetching organization users: FetchError: [POST] "/api/directus/users": 500`
- 1 × `[useQuickTasks] Failed to load tasks: FetchError: [POST] "/api/directus/items": 500`

Did not recur after console clear + 4 fresh navigations across `/`, `/scheduler`, `/marketing`, `/financials`. Most likely a Vercel function cold-start or a brief Directus connection drop. Worth one capture under load (e.g. k6 or hey burst) before launch to confirm it's not load-induced.

## Other observations (non-blocking)

- **Lead-form spam landed in prod**: `/leads` shows 42 entries including obvious junk ("ZXQFWSVseISJlkxiwJJTk fPGEEtRVEYycVATgvVhgNndbPGsUqirjJYQxd", "Pariatur Quis moles…", several "Test Submission/Test Corp" rows, dot-trick gmail addresses) and a fake $895K pipeline value. Recommend rate-limit + CAPTCHA on the public lead-submission endpoint before opening signups.
- **`SmartPrompts` warning** on the dashboard: `[SmartPrompts] Fetch failed — falling back to static prompts: TypeError: e.getItems is not a function` at `fetchSmartData` ([_nuxt/Dcw6tLj2.js:1:3950](.) — bundled, source path unclear). Non-blocking (falls back), but suggests a `useDirectusItems` destructure mismatch worth chasing.
- **Org-switcher button title vs. behavior mismatch**: [`ClientSelect.vue:76-77`](app/components/Layout/ClientSelect.vue:76) sets `title="Switch organization"` for multi-org users, but the click handler hard-codes `navigateTo('/organizations')` regardless. The wired-up `LayoutOrgSwitcher` modal is reachable from `ContextPill.vue` but never from the header. Either honor the modal path or remove the dead `@open-org-switcher` emit and `LayoutOrgSwitcher` mount from `Header.vue`.
- **`/organizations` page avatar shows "H" initials** instead of the hue logo even though the icon URL is computed correctly. Cosmetic.
- **`/tasks` shows "Connection Lost — Attempting to reconnect…"** on first hit, presumably the realtime websocket. Resolves on its own after a moment but is a confusing first-impression for new signups.

## What to fix before re-running this checklist

1. ⛔ **Member-role row-perm audit** across every tenant collection (root cause of #1).
2. ⛔ **Two-line rename** in `lists/index.vue:46` and `lists/[id].vue:69` (#2).
3. ⛔ **`mailing_list_contacts` perm grant** for nested `contact_id.*` fields, or refactor the query (#3).
4. 🔧 **Stripe live price IDs** so scenario 1 can be exercised end-to-end.
5. 🔧 **OAuth redirect URIs** in Meta / TikTok / LinkedIn dev consoles (scenario 6).
6. 🔧 **Spam-protect the public lead form** before opening signups.
7. 🧪 Add a multi-org test account (or add `peter@huestudios.com` to a second org) so scenario 3 can run.
8. 🧪 Re-run the smoke checklist after the above; expect scenarios 7-10 to also need new evidence.

## Test artifacts

- One created mailing list `Smoke Test 2026-04-28` (id 9) in org `hue`. Disposable — safe to delete with `mailing_lists.id=9` removal. No contacts attached.
- No emails were sent. No Stripe state was mutated. No orgs were archived.

# Earnest Companion PWA — Integration Answers

> Answers to all integration questions from the companion app reference document, based on analysis of the main Earnest codebase.

---

## 1. `channels` — Team Messaging (Messages Tab)

- [x] **Does the `channels` collection have a `status` field?**
  Yes. Values: `'published' | 'draft' | 'archived'`

- [x] **Does `channels.date_updated` exist and update when new messages are posted?**
  The field exists, but **does NOT auto-update on new messages**. It only updates when the channel record itself is modified (name, org, etc.). Messages have their own `date_created`. The companion will need to aggregate latest message `date_created` per channel for sorting.

- [x] **How does the main app determine which channels a user can see?**
  **Org filter + optional client filter only.** No team/project membership checks. Uses `orgFilter()` and `clientFilter()` from composables.

- [x] **Is there a `client` field on channels for client-scoped access?**
  Yes. `client?: string | null` — channels can be org-wide (null) or client-scoped.

---

## 2. `messages` — Channel Messages (Messages Tab)

- [x] **Does `messages` have a `status` field?**
  Yes. Values: `'published' | 'draft' | 'archived'`. Created with `'published'`.

- [x] **Is `user_created` automatically set by Directus, or does the main app set an explicit `user` field?**
  **Explicitly set** by the app: `user_created: user.value.id` in the create payload.

- [x] **Does `messages.text` allow rich text/HTML, or is it plain text?**
  **Full rich HTML** via TipTap editor. Stored as HTML, rendered with `v-html`. Supports bold, italic, lists, links, images, @mentions, file embeds.

- [x] **How does the main app handle message threading via `parent_id`?**
  Recursive nesting. Replies set `parent_id` to the parent message ID. The Message component renders child replies recursively with realtime subscriptions.

---

## 3. `directus_notifications` — Activity Feed (Activity Tab)

- [x] **What are the actual `status` values for `directus_notifications`?**
  **Not just `status`.** The main app adds custom fields: `read: boolean` and `read_at: string | null`. Default status on creation is `'inbox'`. **The companion's assumption of `null`=unread won't work** — you need to check the `read` boolean field instead.

- [x] **Does the main app use a custom wrapper or query directly?**
  **Custom wrapper.** Uses `useDirectusNotifications()` composable and server route `/api/directus/notifications`.

- [x] **Are there any additional fields beyond the standard system fields?**
  Yes: `organization` (org-scoped), `metadata` (arbitrary JSON), `read` (boolean), `read_at` (timestamp).

- [x] **How are notifications created?**
  **Both.** Server-side via `/api/notifications/trigger.post.ts` (called by Directus Flow webhooks). Uses `resolveNotificationTargets()` to determine recipients based on mentions, assignees, channel members, etc.

### ⚠️ Action Required
Update companion to use the `read` boolean field instead of checking `status` for read/unread state.

---

## 4. `earnest_scores` — Score Dashboard (Score Tab)

- [x] **Is there one `earnest_scores` record per user per org?**
  Yes. Filtered by `user_created` + `organization`.

- [x] **What does `dimension_scores` JSON look like?**
  ```json
  {
    "followThrough": 80,
    "consistency": 70,
    "responsiveness": 90,
    "proactivity": 85,
    "depth": 75
  }
  ```
  Each value is 0–100, but individual max contributions differ: followThrough=30, consistency=25, responsiveness=20, proactivity=15, depth=10.

- [x] **What does `badges_unlocked` JSON look like?**
  **String array** of badge IDs:
  ```json
  ["first-flame", "keeper-of-promises", "seven-day-resolve"]
  ```
  8 possible badges: `first-flame`, `keeper-of-promises`, `seven-day-resolve`, `thirty-day-pillar`, `rapid-responder`, `deep-current`, `the-preparator`, `team-anchor`. Each unlock grants +75 EP.

- [x] **Is `current_score` a 0-100 daily score, and `total_ep` is cumulative points?**
  Yes. `current_score` = 0–100 daily score. `total_ep` = cumulative lifetime Earnest Points.

- [x] **Which field should the leaderboard sort by?**
  **`-total_ep`** (not `-current_score`). Confirmed in `fetchTeamRanking()` and `fetchAllMemberScores()`.

### ⚠️ Action Required
- Update companion leaderboard to sort by `-total_ep` instead of `-current_score`.
- Update dimension score field names: use `followThrough`, `consistency`, `responsiveness`, `proactivity`, `depth` (NOT `velocity`, `quality`, `collaboration`, `growth`).

---

## 5. `org_memberships` — Organization Context (All Tabs)

- [x] **Confirm `org_memberships.user` is a direct M2O FK to `directus_users`**
  Confirmed. `user: DirectusUser | string` (marked `@required`).

- [x] **Confirm `org_memberships.role` is a M2O FK to `org_roles`**
  Confirmed. `role: OrgRole | string` (marked `@required`).

- [x] **Does `organization.logo` return a file UUID or a URL?**
  **File UUID.** Needs `/assets/{id}` URL construction. Usage: `` `${directusUrl}/assets/${org.logo}?key=avatar` ``

- [x] **Does `useOrganization()` use the same query pattern?**
  Similar but different. Fetches orgs with `fields: ['id', 'name', 'logo', 'icon', 'plan']` and memberships separately with `fields: ['id', 'organization', 'role.id', 'role.name', 'role.slug', 'client.id', 'client.name']`. Note: also includes a `client` relationship.

---

## 6. `user_presence` + Presence API — Team Presence (Team Tab)

- [x] **Does the `user_presence` Directus collection get updated, or is it only the in-memory approach?**
  **Two separate systems exist:**
  - **System A (in-memory):** `usePresence.ts` — heartbeat every 30s, 90s TTL. Endpoints: `POST /api/presence/heartbeat`, `GET /api/presence/online`.
  - **System B (Directus collection):** `useUserPresence.js` — location-based presence with WebSocket updates to `user_presence` collection.
  They are independent.

- [x] **Should the companion hit `/api/presence/online` instead of querying `user_presence` directly?**
  **Yes.** Use the in-memory system's endpoints for online/offline status.

- [x] **Is `user_id` a M2O FK or plain string UUID?**
  **M2O FK** to `directus_users`.

- [x] **Does the companion need to send its own heartbeats?**
  **Yes**, if you want companion users to appear online. Send `POST /api/presence/heartbeat` with `{ status: 'online' }` (requires authentication).

### ⚠️ Action Required
Update companion to hit the main app's `/api/presence/online` and `/api/presence/heartbeat` endpoints instead of querying the `user_presence` collection directly.

---

## 7. `tickets` + `projects` — Assigned Items (Activity Tab)

- [x] **Confirm ticket status enum**
  `'Pending' | 'Scheduled' | 'In Progress' | 'Completed'`

- [x] **Confirm project status enum**
  `'Pending' | 'Scheduled' | 'In Progress' | 'completed' | 'Archived'` — **note inconsistent lowercase `completed`**.

- [x] **Does the M2M filter work through junction tables?**
  Confirmed. `assigned_to: { directus_users_id: { _eq: userId } }` works through `tickets_directus_users` and `projects_directus_users` junction tables.

- [x] **Should the companion also show `tasks`?**
  **Yes, recommended.** Full `tasks` collection exists with status values: `'new' | 'approved' | 'in_progress' | 'completed'`, linked to tickets via `ticket_id`.

---

## 8. `comments` + `reactions` — Inline Actions (Activity Tab)

- [x] **`comments.user` is explicit M2O FK for author?** Confirmed. `user?: DirectusUser | string | null`
- [x] **`comments.item` is plain string?** Confirmed. `item?: string | null`
- [x] **`comments.collection` stores collection name as string?** Confirmed. `collection?: string | null`
- [x] **`reactions.user` (not `user_created`) is FK?** Confirmed. `user?: DirectusUser | string | null`
- [x] **`reactions.table` stores collection name?** Confirmed. `table?: string | null`
- [x] **`reactions.item` stores item ID as string?** Confirmed. `item?: string | null`
- [x] **`reactions.reaction` — emoji character or keyword?**
  **Keyword strings.** Legacy: `'love'`, `'like'`, `'idea'`, `'dislike'`. Emoji: `'grinning-face'`, `'thumbs-up'`, `'fire'`, `'rocket'`, etc. Displayed via `fluent-emoji-flat:${emoji}` icon names. **Not raw emoji characters.**

### ⚠️ Action Required
Ensure companion stores and matches reaction keywords, not emoji characters.

---

## 9. `push_subscriptions` — Push Notifications

- [x] **Does `push_subscriptions` exist in the Directus schema?**
  **No.** Not in the schema or type definitions.

- [x] **If not, should it be created?**
  **Yes.** The main app has an in-app notification system (DirectusNotification records via webhook at `/api/notifications/trigger.post.ts`) but no Web Push API implementation.

- [x] **Is there a Directus Flow for push?**
  Flows trigger the `/api/notifications/trigger.post.ts` webhook which creates in-app notifications only. No browser push.

- [x] **Webhook secret format?**
  Configured via `notificationWebhookSecret` in `nuxt.config.ts` runtime config.

### ⚠️ Action Required
Create the `push_subscriptions` collection in Directus and implement Web Push. The existing `/api/notifications/trigger.post.ts` endpoint is a good place to extend — after creating in-app notifications, dispatch web push to subscribed devices.

---

## Summary of Critical Fixes Needed in Companion App

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Notification read status** — use `read` boolean field, not `status` | High |
| 2 | **Leaderboard sort** — use `-total_ep`, not `-current_score` | High |
| 3 | **Dimension score field names** — `followThrough`, `consistency`, `responsiveness`, `proactivity`, `depth` (not `velocity`, `quality`, `collaboration`, `growth`) | High |
| 4 | **Reactions format** — store keyword strings, not emoji characters | Medium |
| 5 | **Channel sorting** — `date_updated` won't reflect new messages; aggregate latest message `date_created` | Medium |
| 6 | **Presence system** — hit main app API endpoints, not `user_presence` collection | Medium |
| 7 | **Push subscriptions** — collection doesn't exist yet; needs to be created in Directus | New Feature |
| 8 | **Tasks support** — consider adding `tasks` collection queries to Activity tab | Enhancement |

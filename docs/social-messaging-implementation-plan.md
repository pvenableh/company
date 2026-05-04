# Social Messaging + Performance Analytics — Implementation Plan

**Status:** Handoff doc — ready to start in a fresh session.
**Prerequisite:** Meta App Review for the 3 new gated scopes (`pages_messaging`, `pages_manage_metadata`, `instagram_manage_messages`) is *in progress* — warm-up calls already done. Code can be built and tested in dev mode against the user's own Page (huestudios / Hue) before review clears.
**Companion doc:** [docs/meta-app-review-justifications.md](meta-app-review-justifications.md) — the per-scope justification text + screen recording plan.

---

## What's already in place

### Code
- `server/adapters/facebook.ts` — OAuth, Page discovery, post publishing (text/photo/album/video), insights, comments (read/reply/delete). **No conversations or messaging yet.**
- `server/adapters/instagram.ts` — OAuth, account discovery, post publishing, insights, comments. **No conversations or messaging yet.**
- `server/adapters/types.ts` — `PlatformAdapter` interface — needs extension for messaging.
- `server/api/social/oauth/facebook/webhook.{get,post}.ts` — verification + receiver stubs (POST handler just logs and returns 200).
- `server/api/social/oauth/instagram/webhook.{get,post}.ts` — same shape, same stub.
- `app/pages/marketing.vue` — current marketing dashboard with publish/schedule/analytics. **No inbox/messaging UI yet.**

### Meta dashboard
- App is **Business** type. Products: Facebook Login for Business, Webhooks, Instagram, Messenger.
- Webhook subscriptions configured:
  - **Page (Messenger)**: `messages`, `messaging_postbacks`, `feed`, `mention`, `message_echoes`, `message_reactions`, `message_reads`, `leadgen`, `leadgen_update`
  - **Instagram (Messenger → IG Settings)**: `messages`, `messaging_postbacks`, `messaging_seen`, `message_reactions`, `message_edit`, `comments`, `messaging_referral`, `live_comments`
- Webhook callback URLs:
  - FB: `https://earnest.guru/api/social/oauth/facebook/webhook` (env: `FACEBOOK_WEBHOOK_VERIFY_TOKEN`)
  - IG: `https://earnest.guru/api/social/oauth/instagram/webhook` (env: `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`)
- Hue Page (FB ID `100614343319513`, IG ID `17841401531795911` / `huestudios`) is the test target.

---

## Scope of this plan

Build the Earnest-side functionality that uses the new scopes:

1. **Adapter messaging methods** — FB + IG conversations + send + ack
2. **Webhook event ingestion** — route incoming events into a unified inbox collection
3. **Per-Page subscription registration** — `subscribed_apps` on Page connect/disconnect
4. **Directus schema** — `social_threads`, `social_messages`, `social_activity` collections
5. **Server API routes** — list/get/send/mark-read for threads + activity feed
6. **UI** — unified Inbox tab on /marketing (or dedicated /inbox route), realtime activity bell in app header
7. **Performance analytics UI** — beef up existing Marketing dashboard with per-post + per-account charts using existing `getAccountMetrics` + new per-post insight calls
8. **Marketing site updates** — earnest-marketing project: README, `features.ts`, sellsheet bullets

---

## 1. Adapter messaging methods

### Files to edit
- `server/adapters/types.ts` — extend `PlatformAdapter` with optional messaging methods
- `server/adapters/facebook.ts`
- `server/adapters/instagram.ts`

### `PlatformAdapter` additions (types.ts)

```ts
type PlatformConversation = {
  threadId: string
  participantId: string         // PSID for FB, IGSID for IG
  participantName?: string
  participantAvatar?: string
  lastMessageAt: string         // ISO
  lastMessagePreview?: string
  unread?: boolean
}

type PlatformMessage = {
  messageId: string
  threadId: string
  fromId: string                // PSID/IGSID of sender, or Page ID if outgoing
  isOutgoing: boolean
  text?: string
  attachments?: Array<{ type: 'image' | 'video' | 'audio' | 'file'; url: string }>
  createdAt: string
  reactions?: Array<{ fromId: string; emoji: string }>
}

type PlatformAdapter = {
  // ... existing
  getConversations?(accountId: string, accessToken: string, cursor?: string): Promise<{
    conversations: PlatformConversation[]
    nextCursor?: string
  }>
  getMessages?(threadId: string, accessToken: string, cursor?: string): Promise<{
    messages: PlatformMessage[]
    nextCursor?: string
  }>
  sendMessage?(
    threadId: string,                    // or recipient PSID for first-reply scenarios
    accessToken: string,
    payload: { text?: string; mediaUrl?: string; mediaType?: 'image' | 'video' | 'audio' | 'file' }
  ): Promise<{ messageId: string }>
  markRead?(threadId: string, accessToken: string): Promise<{ success: boolean }>
}
```

### Facebook adapter — new methods

```ts
// GET /{page-id}/conversations?fields=id,participants,updated_time,snippet,unread_count
async function getFacebookConversations(pageAccessToken: string, pageId: string, cursor?: string)

// GET /{conversation-id}/messages?fields=id,from,to,message,created_time,attachments,reactions
async function getFacebookMessages(threadId: string, pageAccessToken: string, cursor?: string)

// POST /me/messages with { recipient: { id: psid }, message: { text }, messaging_type: 'RESPONSE' }
async function sendFacebookMessage(recipientPsid: string, pageAccessToken: string, payload)

// POST /me/messages with { recipient: { id: psid }, sender_action: 'mark_seen' }
async function markFacebookConversationSeen(recipientPsid: string, pageAccessToken: string)
```

**Notes:**
- The `threadId` from `/conversations` is `t_{numeric}`. The `recipient_psid` for sending is in `participants.data[].id` (the one that isn't the Page ID).
- `messaging_type: 'RESPONSE'` requires the most recent inbound message to be inside the 24h window. For outside the window, would need `MESSAGE_TAG` with a `tag` (e.g., `CONFIRMED_EVENT_UPDATE`) — out of scope for v1.
- Attachments via `message.attachment.payload.url` for outgoing media.

### Instagram adapter — new methods

Same shape as FB but:
- All endpoints take `?platform=instagram` query param OR are addressed via the IG account ID directly
- Use `me/conversations?platform=instagram` with the **Page Access Token** (not User Token — this was the gotcha during warm-up)
- Send: `POST /me/messages?recipient={"id":"{igsid}"}&message={"text":"..."}` with Page Token
- IG doesn't support all FB attachment types — supports image, video, audio (no generic file)

### Update adapter instances at the bottom of each file
Wire the new functions into `facebookAdapter` and `instagramAdapter` exports.

---

## 2. Webhook event ingestion

### Files to edit
- `server/api/social/oauth/facebook/webhook.post.ts`
- `server/api/social/oauth/instagram/webhook.post.ts`
- New: `server/utils/social-inbox-router.ts` — shared parsing logic

### Payload shapes (handle both)

FB Page webhook:
```json
{
  "object": "page",
  "entry": [{
    "id": "{page-id}",
    "time": 123,
    "messaging": [{
      "sender": { "id": "{psid}" },
      "recipient": { "id": "{page-id}" },
      "timestamp": 123,
      "message": { "mid": "...", "text": "..." }
    }],
    "changes": [{
      "field": "feed",
      "value": { "item": "comment", "comment_id": "...", "from": {...}, "message": "..." }
    }]
  }]
}
```

IG webhook (similar, `object: "instagram"` and `messaging[].sender.id` is IGSID).

### Router logic
1. Look up the connected Page/IG account by `entry.id` → get `social_accounts.organization`. If no match, log + 200 (it's a webhook for an account we no longer manage).
2. For each `entry.messaging[]`: upsert `social_threads` (by `entry.id` + thread participant PSID/IGSID) and insert `social_messages`.
3. For each `entry.changes[]` of type `feed` / `comments` / `mention`: insert `social_activity` row.
4. Trigger AI notice generator (existing pattern from `useAINotices`) for net-new threads or @mentions.
5. Return 200 immediately. Move slow work to a background job if Directus writes get slow.

### Signature verification (security)
Meta signs webhook bodies with the app secret. Add a verification helper:
```ts
// server/utils/meta-webhook-signature.ts — verify X-Hub-Signature-256 against META_APP_SECRET + raw body
```
Reject 401 if signature mismatches. Required before going to Live mode (in dev mode the signing is enforced but you control the app so it's a sanity check).

---

## 3. `subscribed_apps` registration on Page connect

### Files to edit
- `server/api/social/oauth/facebook/callback.get.ts` — after Page is connected, call `POST /{page-id}/subscribed_apps`
- `server/api/social/oauth/instagram/callback.get.ts` — same for IG account
- `server/api/social/accounts/[id].ts` — on DELETE, call `DELETE /{page-id}/subscribed_apps` to unsubscribe

### What to subscribe to (already configured in dashboard, but Page must opt in)
- FB: `subscribed_fields=messages,messaging_postbacks,messaging_seen,message_echoes,message_reactions,feed,mention`
- IG: `subscribed_fields=messages,messaging_postbacks,messaging_seen,message_reactions,comments`

### Why this matters
The dashboard webhook subscription is **app-level**. To actually receive events for a *specific* Page, that Page must be added via `subscribed_apps`. Without this step, the user connects a Page in Earnest, but webhooks never fire for it.

---

## 4. Directus schema

### New collections

`social_threads`
- id (uuid)
- organization (FK organizations) — tenant isolation
- account (FK social_accounts)
- platform (enum: facebook, instagram)
- thread_id (string) — Meta's `t_{...}` for FB, conversation ID for IG
- participant_id (string) — PSID/IGSID
- participant_name (string)
- participant_avatar (string, nullable)
- last_message_at (timestamp)
- last_message_preview (text)
- unread_count (int, default 0)
- archived (bool, default false)
- assigned_to (FK directus_users, nullable) — for team triage
- date_created, user_created, date_updated, user_updated
- **Indexes:** `(organization, last_message_at DESC)`, `(account, thread_id)` UNIQUE
- **Perms:** Client/Admin policies — same row filter pattern as social_posts (FK-walk to organization)

`social_messages`
- id (uuid)
- thread (FK social_threads)
- organization (FK — denormalized for perm filter speed)
- platform_message_id (string) — Meta's `mid`
- from_id (string) — PSID/IGSID or Page ID
- is_outgoing (bool)
- text (text, nullable)
- attachments (json, nullable) — `[{ type, url }]`
- reactions (json, nullable) — `[{ from_id, emoji }]`
- created_at (timestamp)
- date_created
- **Indexes:** `(thread, created_at)`, `(platform_message_id)` UNIQUE
- **Perms:** mirror social_threads

`social_activity`
- id (uuid)
- organization (FK)
- account (FK social_accounts)
- platform (enum)
- type (enum: comment, mention, reaction, follow, lead) — extensible
- ref_id (string) — Meta's comment_id, post_id, etc.
- post_id (string, nullable) — parent post if applicable
- actor_id (string) — who did it
- actor_name (string)
- preview (text)
- raw_payload (json) — keep the original webhook for debugging + future parsing
- read (bool, default false)
- created_at (timestamp)
- **Indexes:** `(organization, created_at DESC)`, `(organization, read, created_at DESC)`
- **Perms:** mirror social_threads

### Setup script
New: `scripts/setup-social-inbox-collections.ts` — idempotent collection + perm creation, mirror the pattern from `scripts/setup-team-goals-collection.ts` and `scripts/patch-tenant-row-perms.ts`.

---

## 5. Server API routes

### New routes
- `GET /api/social/threads` — list threads for current org, query params: `?platform=fb|ig|all`, `?archived=false`, `?cursor=...`
- `GET /api/social/threads/[id]` — single thread + recent messages
- `GET /api/social/threads/[id]/messages?cursor=...` — paginated message history
- `POST /api/social/threads/[id]/messages` — body: `{ text, mediaUrl?, mediaType? }` → calls adapter `sendMessage` → inserts into `social_messages`
- `PATCH /api/social/threads/[id]` — body: `{ archived?, assigned_to?, unread_count? }`
- `POST /api/social/threads/[id]/mark-read` — calls adapter `markRead` + updates DB
- `GET /api/social/activity` — list activity items for current org, query params: `?type=...`, `?read=false`, `?cursor=...`
- `POST /api/social/activity/[id]/mark-read`

### Patterns to follow
- All routes go through `requireOrgMembership()` from `server/utils/marketing-perms.ts` (same pattern as marketing endpoints, since `social_*` collections are tenant-scoped).
- Use `getTypedDirectus()` for the DB calls (admin token + perm filter is enforced via the require helper).
- Return short-lived cached responses (`max-age=10`) on the list endpoints.

---

## 6. UI — Unified Inbox + activity bell

### New surfaces
- **Inbox tab on /marketing** OR dedicated **/inbox route** (recommend /inbox so it's discoverable from the sidebar; cross-link from /marketing)
- **AppShell activity bell** (header) — shows unread `social_activity` count + dropdown with last 10 items

### Inbox layout (Clean-Gantt aesthetic per CLAUDE.md design system)
- **Left pane**: thread list — sticky platform filter chips at top, then `social_threads` rows ordered by `last_message_at`. Each row shows: avatar, participant name, platform pill (FB/IG), last preview, relative time, unread badge.
- **Right pane**: selected thread — message bubbles (incoming left, outgoing right), reply composer at bottom with media upload, mark-as-read on view, reactions bar.
- **Empty state**: "Connect a Page to start receiving messages" with CTA to /settings/connected-accounts.

### New components
- `app/components/Inbox/InboxLayout.vue` — split-pane shell
- `app/components/Inbox/ThreadList.vue` — left pane
- `app/components/Inbox/ThreadView.vue` — right pane
- `app/components/Inbox/MessageComposer.vue` — reply box + media picker
- `app/components/Inbox/ActivityBell.vue` — header bell + dropdown
- `app/composables/useSocialInbox.ts` — fetch threads, send, mark read
- `app/composables/useSocialActivity.ts` — fetch activity feed

### Realtime updates
Two paths, ship the simpler one first:
1. **v1 — polling**: composable polls `/api/social/threads` every 30s when tab is visible. Cheap, works.
2. **v2 — server-sent events**: new `/api/social/stream` SSE route streams events as they hit the webhook. Requires session + org-scoped fanout but eliminates poll latency.

---

## 7. Performance analytics UI

### Existing
- `getAccountMetrics()` in adapters returns reach/impressions/engagement/follower count for the *account*.

### Add
- **Per-post analytics** — `getPostInsights(postId, accessToken)` in each adapter. FB: `/{post-id}/insights?metric=post_impressions,post_engaged_users,post_reactions_by_type_total`. IG: `/{ig-media-id}/insights?metric=impressions,reach,engagement,saved,video_views`.
- **Time-series** — daily snapshot of `getAccountMetrics()` written to a new `social_metrics_daily` collection (cron-driven, see existing cron pattern in `server/api/social/cron/publish-scheduled.ts`). Powers 30/60/90-day charts.
- **Dashboard cards on /marketing** — extend the existing PlatformTile (`app/components/Marketing/PlatformTile.vue`) to show 7d trend sparkline + week-over-week delta. Add new `<MarketingPostInsightsTable>` listing the 10 most recent published posts with reach/engagement columns.

### Data flow
- Cron `/api/social/cron/refresh-metrics` (daily, 4 AM UTC) → for each `social_accounts` row → call adapter → upsert `social_metrics_daily`.
- UI reads from `social_metrics_daily` directly (no live API calls per page load — too slow).

---

## 8. earnest-marketing project updates

**Repo:** `~/Sites/earnest/earnest-marketing` (separate from app repo)

### Changes

**`README.md`** — under "What Earnest does" / feature list section, add a bullet for:
- "Unified social inbox for Facebook + Instagram DMs, comments, and mentions"
- "Per-account and per-post performance analytics with 90-day trends"

**`app/data/features.ts`** — add two new feature entries:
- `social-inbox` — title, summary, screenshot path, detail body. Slug becomes `/features/social-inbox`.
- (Optional) split out `social-analytics` if the existing marketing-dashboard feature doesn't already cover it deeply enough.

**`app/components/SellSheetModern.vue`** — auto-renders from `features.ts`, but check the homepage hero/sub-hero copy in case messaging warrants a top-line callout (e.g., "All your client conversations in one place.").

**`public/screenshots/`** — capture new screenshots from the Earnest dev environment:
- `inbox-overview.png` — split-pane inbox with thread list + open conversation
- `inbox-mobile.png` — responsive thin-screen view if the inbox supports it
- `analytics-dashboard.png` — beefed-up performance dashboard

Use the existing capture pipeline: `scripts/capture-demo-screenshots.ts` in the *earnest* (app) repo. Add new entries to the `DemoShot` union and capture script. Per-run archive at `<YYYY-MM>/<timestamp>/` per the screenshot-archiving feedback memo.

### Don't change
- Privacy policy / data deletion / terms — already cover the new scopes since they all live under "we connect to your social accounts to publish, read insights, and reply to comments/messages." Verify wording but probably no change needed.

---

## Recommended build order (if doing all in one shot)

| Phase | What | Why first |
|---|---|---|
| 1 | Directus schema + setup script | Everything below writes to these tables |
| 2 | Adapter messaging methods (FB then IG) | Pure functions, easy to test against Hue with Page Token |
| 3 | Webhook event router + signature verification | Real events start populating tables — proves the pipeline end-to-end |
| 4 | `subscribed_apps` registration in OAuth callbacks | Without this, only Hue (manually subscribed) sends events |
| 5 | API routes | UI dependency |
| 6 | Inbox UI (thread list → thread view → composer → activity bell) | The visible deliverable |
| 7 | Daily metrics cron + per-post insights + dashboard improvements | Decoupled from inbox; can ship as parallel track |
| 8 | Marketing site updates (features.ts, README, screenshots, sellsheet copy) | Last — needs the actual UI to screenshot |

## Testing strategy

- **Adapter methods**: hit Graph API Explorer first to confirm payload shapes against the Hue Page, then port to TS.
- **Webhook routing**: use the **Test** button next to each subscribed field in Meta's webhook UI — it sends a synthetic payload to your callback. Cheap way to exercise the router without real DMs.
- **End-to-end**: send a real DM from your phone to the Hue Page → confirm it shows in /inbox within 30s.
- **Signature verification**: temporarily set `META_APP_SECRET` to a wrong value, confirm webhook returns 401.
- **Multi-tenant isolation**: connect a second Page from a different org account, confirm threads don't leak across.

## Out of scope for v1 (flag for later)

- **24-hour-window vs message tags** — the standard messaging window covers normal customer service. Supporting `MESSAGE_TAG`, `HUMAN_AGENT`, recurring notifications, marketing message broadcasts → separate feature, separate review path.
- **Multi-app handover protocol** (`messaging_handover`, `standby` fields) — only relevant if Earnest will share the inbox with another app like Manychat. Skip.
- **WhatsApp Business** — different product, different review, different code path entirely.
- **Threads inbox** — Threads adapter already exists with replies scope, but Threads has its own review track that hasn't been started.
- **AI auto-reply** — explicit non-goal for review per the justification text ("we never reply without explicit user action"). Could add AI-suggested replies (user reviews + clicks Send) but full auto-reply violates Meta's stated terms for the messaging permissions.

## Reference — env vars needed

Already set:
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
- `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (added during this session)
- `META_APP_ID`, `META_APP_SECRET` (in nuxt runtimeConfig under `social.facebook` / `social.instagram`)

Add:
- `META_APP_SECRET` exposed as runtime env for webhook signature verification (might already be on `runtimeConfig.social.facebook.appSecret` — reuse).

## Quick-start commands for the next session

```sh
# Confirm Meta dashboard state hasn't drifted
gh repo view --web   # not relevant; use Meta dashboard manually

# Confirm the warm-up calls still pass before building (sanity check)
# In Graph API Explorer with a fresh Hue Page Token:
#   GET /me/conversations
#   GET /me/subscribed_apps
#   GET /me/conversations?platform=instagram

# Start the dev server
pnpm dev

# Run the Directus schema setup once it's written
pnpm tsx scripts/setup-social-inbox-collections.ts
```

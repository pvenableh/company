# Meta App Review — Permission Justifications

App: **Earnest** (https://earnest.guru)

Reviewer-facing description: Earnest is a SaaS workspace for independent agencies, studios, and freelancers. The social/marketing module lets a user connect their Facebook Pages and Instagram Business/Creator accounts, then compose, schedule, publish, and report on posts across them from a single dashboard. Users also triage incoming activity (comments, mentions, Page DMs, IG Direct messages) in a unified inbox and receive realtime activity alerts.

This document covers the **15 scopes** in the review submission (14 new + 1 renewal). Each section is written to paste directly into Meta's "Tell us why you're requesting…" field. Pair them with the single screen recording at the bottom.

**Scope index**
- [Existing access — renewal](#existing-access--renewal)
  - [`public_profile`](#public_profile-renewal)
- [Facebook Page scopes](#facebook-page-scopes)
  - [`pages_show_list`](#pages_show_list)
  - [`pages_read_engagement`](#pages_read_engagement)
  - [`pages_manage_posts`](#pages_manage_posts)
  - [`pages_manage_engagement`](#pages_manage_engagement)
  - [`pages_read_user_content`](#pages_read_user_content)
  - [`pages_messaging`](#pages_messaging)
  - [`pages_manage_metadata`](#pages_manage_metadata)
  - [`read_insights`](#read_insights)
  - [`business_management`](#business_management)
- [Instagram Graph API](#instagram-graph-api)
  - [`instagram_basic`](#instagram_basic)
  - [`instagram_content_publish`](#instagram_content_publish)
  - [`instagram_manage_comments`](#instagram_manage_comments)
  - [`instagram_manage_insights`](#instagram_manage_insights)
  - [`instagram_manage_messages`](#instagram_manage_messages)
- [Warm-up calls for gated scopes](#warm-up-calls-for-gated-scopes)

---

## Existing access — renewal

### `public_profile` *(renewal)*

Earnest uses Facebook Login as one of the sign-in / connect-account methods. After the user authenticates we read their public profile (id, name, profile picture) so we can display *"Connected as {name}"* in our Connected Accounts UI and so the user can confirm they linked the right Facebook account before we proceed to discover Pages. This is the standard, default-granted Facebook Login behavior and the data is used solely to label the connected account inside the user's own workspace.

**Why it adds value:** users can see clearly which Facebook identity they connected and disconnect/reconnect with confidence.

**Why it is necessary:** Facebook Login requires this scope; without it we cannot identify the authenticating user at all.

**What we do NOT use it for:** we do not access friend lists, posts, or any non-public data; we do not share the profile outside the user's workspace; we do not use the profile data for marketing, advertising, or third-party analytics.

---

## Facebook Page scopes

### `pages_show_list`

Earnest helps users connect the Facebook Pages they manage so they can publish content and view analytics from inside our app. After the user signs in via Facebook Login, our server (`server/adapters/facebook.ts`, `getFacebookPages`) calls `GET /me/accounts` to retrieve the list of Pages the user is a direct admin of. We then render that list in our "Connect Page" UI so the user can pick which Page(s) to link to their Earnest workspace.

**Why it adds value:** users explicitly tell us which Page(s) they want connected — they are not forced to either connect everything or guess Page IDs.

**Why it is necessary:** there is no other Graph endpoint that returns the Pages a user administers; without this scope our connect flow cannot present any options.

**What we do NOT use it for:** we do not enumerate Pages of other users, we do not connect Pages without explicit user selection, and we do not store the list beyond the duration of the connect flow.

---

### `pages_read_engagement`

Once a user has connected a Page, Earnest displays Page metadata (name, category, follower count, profile photo) in the connected-accounts list, lists the Page's recent posts in the analytics dashboard, and surfaces incoming comments in our unified social inbox. The relevant calls are `GET /{page-id}` (Page profile/follower fields), `GET /{page-id}/posts` (recent published posts), and `GET /{post-id}/comments` (comments on those posts), all in `server/adapters/facebook.ts` (`getFacebookPageInsights`, `getFacebookComments`).

**Why it adds value:** the user can monitor and respond to engagement on their own Pages without leaving Earnest, which is the core value proposition of the inbox feature.

**Why it is necessary:** Page profile fields, post lists, and comment lists are all gated behind this scope.

**What we do NOT use it for:** we never read engagement on Pages the user did not explicitly connect, we do not aggregate engagement across users, and we do not share or republish any Page's content outside of the user's own Earnest workspace.

---

### `pages_manage_posts`

This is the core publishing scope. After a user composes (or AI-drafts) a post in Earnest's Marketing module and either publishes it immediately or schedules it, our server publishes that post to the user's selected Page on their behalf. Specifically we call `POST /{page-id}/feed` for text posts, `POST /{page-id}/photos` for single-image and album posts, and `POST /{page-id}/videos` for video posts (see `publishFacebookTextPost`, `publishFacebookPhoto`, `publishFacebookPhotoAlbum`, `publishFacebookVideo` in `server/adapters/facebook.ts`).

**Why it adds value:** users can plan, schedule, and publish Page content from the same dashboard where they manage clients, projects, and other marketing channels — instead of context-switching to facebook.com.

**Why it is necessary:** publishing to a Page is gated behind this scope; nothing else in the Graph API offers an alternative.

**What we do NOT use it for:** we never publish without an explicit user action (composer "Publish" or "Schedule"); we do not publish to Pages other than the ones the user connected; and we do not boost or promote posts as ads.

---

### `pages_manage_engagement`

Earnest's social inbox lets a user reply to comments on their Page posts, and delete spam/abusive comments, without leaving the dashboard. We call `POST /{comment-id}/comments` to publish a reply (`replyToFacebookComment`) and `DELETE /{comment-id}` to remove a comment (`deleteFacebookComment`).

**Why it adds value:** small agencies frequently triage comments across many client Pages. Doing this in one inbox saves significant time vs. logging into each Page individually.

**Why it is necessary:** these write operations on comments are gated behind this scope.

**What we do NOT use it for:** we never reply or delete without explicit user action in the inbox UI; we do not auto-reply via AI without the user clicking "Send"; we do not modify reactions, mentions, or any non-comment engagement.

---

### `pages_read_user_content`

Earnest's social inbox surfaces user-generated content (comments and mentions) on the connected Page so the user can see and respond to it. Reading Page comments and the surrounding conversation (`GET /{post-id}/comments`, `GET /{comment-id}` for replies) requires this scope when the comment author is not the Page itself.

**Why it adds value:** without this scope the inbox would only show Page-authored content and miss the entire incoming-conversation side of engagement, which defeats the inbox's purpose.

**Why it is necessary:** comments authored by Page visitors (not the Page itself) require this scope to read.

**What we do NOT use it for:** we do not store comment-author profile information beyond what's needed to render the inbox row (display name + comment text + timestamp); we do not contact, message, or profile the commenters; we do not export UGC out of the user's workspace.

---

### `pages_messaging`

Earnest's social inbox includes a Facebook Page Messenger thread view: the user sees the list of conversations on their connected Page, opens a thread, reads the message history, and types/sends a reply — all without leaving Earnest. This is the same triage pattern as our comment inbox, extended to Page DMs. The relevant calls are `GET /{page-id}/conversations` (list threads), `GET /{conversation-id}/messages` (thread history), and `POST /{page-id}/messages` (send a reply, used inside Meta's 24-hour standard-messaging window with `messaging_type: "RESPONSE"`).

**Why it adds value:** agencies and studios responding to client/customer DMs across multiple Pages currently need to switch into each Page's inbox individually. Earnest gives them one queue spanning all connected Pages alongside their other CRM and project context.

**Why it is necessary:** reading a Page's conversation list, reading message contents, and sending Page replies all require this scope.

**What we do NOT use it for:** we never send a message without an explicit user "Send" action in the inbox UI; we do not initiate cold outreach (only replies inside the standard messaging window); we do not auto-reply with AI without the user clicking Send; we do not access conversations on Pages the user did not explicitly connect; we do not export message content outside the user's workspace.

---

### `pages_manage_metadata`

Earnest delivers realtime activity alerts (new comment on a Page post, new Page DM, new mention) so users see notifications in the dashboard immediately rather than waiting for our next polling interval. To receive these events Earnest must subscribe each connected Page to webhook fields. We call `POST /{page-id}/subscribed_apps` with `subscribed_fields=feed,messages,messaging_postbacks,mention` after a Page is connected, and `DELETE /{page-id}/subscribed_apps` when the user disconnects the Page. We also call `GET /{page-id}/subscribed_apps` to confirm subscription state in our diagnostics view.

**Why it adds value:** users receive activity alerts the moment something happens on their Page instead of polling-delayed updates, which is essential for responsive customer service.

**Why it is necessary:** subscribing a Page to webhook events on the user's behalf is gated behind this scope; without it our backend would have to poll every Page on a short interval, which is far less timely and would eventually trip Meta's rate limits at scale.

**What we do NOT use it for:** we do not modify Page settings, Page name, Page category, Page profile photo, Page roles, or any other Page metadata; we do not subscribe Pages without an explicit user connect action in our UI; we do not subscribe to webhook fields beyond those that drive in-app activity alerts.

---

### `read_insights`

Earnest's Marketing module shows the user a per-Page analytics card with reach, impressions, engagement rate, and follower growth. We call `GET /{page-id}/insights` with metrics `page_impressions`, `page_post_engagements`, and `page_fan_adds` over a 28-day window (`getFacebookPageInsights` in `server/adapters/facebook.ts`).

**Why it adds value:** users see Page performance alongside their other marketing data (email, Instagram) in one dashboard rather than logging into Meta Business Suite separately.

**Why it is necessary:** Page insights are gated behind this scope.

**What we do NOT use it for:** we do not access ad insights, ad spend, audience demographics, or any non-organic Page metrics; we do not aggregate insights across customers; we do not share insights outside the user's own workspace.

---

### `business_management`

Earnest's connect flow needs to discover Pages the user manages **through Business Manager**, not just Pages they are a direct admin of. After OAuth, our server (`getFacebookPages` in `server/adapters/facebook.ts`) calls three endpoints to build the full list of Pages the user can choose to connect:

1. `GET /me/accounts` — Pages the user is a direct admin of.
2. `GET /me/businesses` — the Business Manager accounts the user belongs to. **This call requires `business_management`.**
3. For each business returned by step 2, `GET /{business-id}/owned_pages` and `GET /{business-id}/client_pages` — Pages the business owns or has partner access to. **These calls also require `business_management`.**

We then merge and de-duplicate by Page ID and present the list in the connect UI so the user can pick which Page(s) to connect.

**Why it adds value:** the majority of agencies and studios we serve manage their Page through Business Manager (often because a marketing partner originally set the Page up, or because the Page was migrated under Business Manager for ad/team-management reasons). Without `business_management`, `/me/accounts` returns an empty or partial list and those users see "no Pages found" even though they clearly own a Page — they cannot complete onboarding.

**Why it is necessary:** there is no alternative endpoint that returns Business Manager–owned or client Pages.

**What we do NOT use it for:** we do not read, create, modify, or claim ad accounts; we do not access ad insights, ad spend, or audience data; we do not modify Business Manager assets, users, roles, or permissions; we do not enumerate or write to any business asset other than the page-discovery endpoints above. The permission is used solely to read the user's own businesses' Pages so the user can authorize them inside Earnest.

---

## Instagram Graph API

> Note: the Instagram scopes are requested via the same Facebook Login dialog. The `pages_show_list`, `pages_read_engagement`, and `business_management` scopes (already justified above) are also reused in the IG flow because every IG Business/Creator account is linked to a Facebook Page and we must walk the Page list to resolve the connectable IG accounts.

### `instagram_basic`

After a user connects via Facebook Login, Earnest reads the linked Instagram Business/Creator account's profile (username, profile picture, follower count) and recent media so the user can confirm the right account is connected and see their posts inside Earnest's analytics view. Calls: `GET /{ig-user-id}` and `GET /{ig-user-id}/media`.

**Why it adds value:** users immediately see "yes, my @studioxyz account is connected" and can browse their existing IG posts in our dashboard.

**Why it is necessary:** profile and media reads on an IG Business/Creator account require this scope.

**What we do NOT use it for:** we do not read other users' IG profiles; we do not download or republish media outside the user's workspace.

---

### `instagram_content_publish`

This is the core IG publishing scope. When a user composes or schedules an IG post in Earnest, our server uses the Instagram Content Publishing API to create a media container (`POST /{ig-user-id}/media`) and publish it (`POST /{ig-user-id}/media_publish`). Earnest supports single image, carousel, video, and Reels formats.

**Why it adds value:** users plan, schedule, and publish IG content from the same dashboard where they manage other channels — without context-switching to the IG app.

**Why it is necessary:** publishing media to an IG Business/Creator account is gated behind this scope.

**What we do NOT use it for:** we never publish without an explicit user "Publish"/"Schedule" action; we do not boost or promote posts as ads; we do not publish to accounts the user did not connect.

---

### `instagram_manage_comments`

Earnest's social inbox shows comments on the user's IG posts and lets the user reply to or delete them, in the same UI as Facebook comments. Calls: `GET /{ig-media-id}/comments`, `POST /{ig-comment-id}/replies`, `DELETE /{ig-comment-id}`.

**Why it adds value:** unified comment triage across FB + IG saves agency users significant time vs. switching between apps.

**Why it is necessary:** reading and writing IG comments is gated behind this scope.

**What we do NOT use it for:** we never reply or delete without explicit user action; we do not auto-reply via AI without the user clicking "Send"; we do not message commenters via DM.

---

### `instagram_manage_insights`

Earnest's Marketing dashboard shows per-post and account-level IG metrics (reach, impressions, saves, profile views, follower growth) so the user can see how their content is performing. Calls: `GET /{ig-media-id}/insights` and `GET /{ig-user-id}/insights`.

**Why it adds value:** users see IG performance alongside their other marketing data in one dashboard rather than opening the IG app or Meta Business Suite separately.

**Why it is necessary:** IG insights endpoints are gated behind this scope.

**What we do NOT use it for:** we do not access ad insights or paid-promotion metrics; we do not aggregate insights across customers; we do not share insights outside the user's own workspace.

---

### `instagram_manage_messages`

Earnest's social inbox includes Instagram Direct: the user sees their IG conversation list, opens a thread, reads message history, and types/sends a reply from inside Earnest. The relevant calls are `GET /{ig-user-id}/conversations` (list threads), `GET /{conversation-id}` (message history), and `POST /{ig-user-id}/messages` (send a reply, inside the standard messaging window).

**Why it adds value:** users triaging IG DMs across multiple Business accounts (common for agency clients) get one consolidated queue alongside their FB Page DMs, comments, and other CRM activity.

**Why it is necessary:** reading IG conversations and message contents and sending IG replies all require this scope.

**What we do NOT use it for:** we never send a message without an explicit user "Send" action; we do not initiate cold outreach (replies only, inside the standard messaging window); we do not auto-reply with AI without the user clicking Send; we do not access DMs on accounts the user did not explicitly connect; we do not export message content outside the user's workspace.

---

## Warm-up calls for gated scopes

Three of the requested scopes (`pages_messaging`, `pages_manage_metadata`, `instagram_manage_messages`) require Meta's "successful test API call" check before the **Request Advanced Access** button activates. Use [Graph API Explorer](https://developers.facebook.com/tools/explorer/) — no terminal required.

**Setup once per scope:** in the top-right of Graph API Explorer, pick your app, click **Get Token → Get Page Access Token**, select your test Page, and add the scope to the requested list before generating.

| Scope | Warm-up call (in Graph API Explorer) | Notes |
|---|---|---|
| `pages_messaging` | `POST /me/messages` with body `{"recipient":{"id":"{psid}"},"message":{"text":"test"},"messaging_type":"RESPONSE"}` | First send a message *to* your test Page from another Facebook account (creates a thread + a PSID inside the 24-hour reply window). Get the PSID from `GET /me/conversations` → `participants.data[].id` (the one that isn't your Page ID). |
| `pages_manage_metadata` | `GET /{page-id}/subscribed_apps` | Returns current webhook subscriptions for the Page; counts as a successful call even if empty. To go further: `POST /{page-id}/subscribed_apps` with `subscribed_fields=feed`. |
| `instagram_manage_messages` | `GET /{ig-user-id}/conversations?platform=instagram` | First send a DM *to* your IG Business account from another IG account so a conversation exists. To exercise write side: `POST /{ig-user-id}/messages` with the same body shape as `pages_messaging`. |

After a 200 response, wait up to 24 hours for the Request Advanced Access button to activate, then submit for review with the justification text from this document.

---

## Screen recording

You can submit **a single recording (~3–4 minutes)** that exercises every scope in this review. Reviewers accept one walkthrough as long as the OAuth dialog showing each scope is on-screen and legible.

Use a real account that has at least one Page owned via **Business Manager** (not just `/me/accounts`) and at least one IG Business/Creator account linked to a Page. Before recording, send a test DM to the Page and to the IG account from another account so a thread exists for the messaging steps.

1. Sign in to https://earnest.guru with a real account. (covers `public_profile`)
2. Navigate to **Settings → Connected Accounts** and click **Connect Facebook**.
3. Show the Facebook Login dialog clearly. **Pause long enough that all 9 Page scopes (including `pages_messaging`, `pages_manage_metadata`, `business_management`) are legible.**
4. Approve.
5. Show the Page picker in Earnest. Highlight a Page that comes from Business Manager (voice-over or on-screen text: *"This Page is owned by my Business Manager — `business_management` is what makes it visible here."*).
6. Connect the Page. Show it appears in the connected-accounts list with name, photo, and follower count. (covers `pages_show_list`, `pages_read_engagement`)
7. Show a brief diagnostics/notification toast or settings indicator confirming "Realtime activity enabled" for this Page (this is the Page→subscribed_apps call). (covers `pages_manage_metadata`)
8. Open the Marketing composer, write a short post, and click **Publish** → show the post appears on the Page. (covers `pages_manage_posts`)
9. Open the analytics dashboard and show the Page's reach/impressions/engagement card. (covers `read_insights`)
10. Open the social inbox, show an incoming comment on a Page post, type a reply, click **Send**, then show the reply appears. (covers `pages_manage_engagement`, `pages_read_user_content`)
11. Switch to the **Messages** tab in the inbox, open the test conversation thread, type a reply, click **Send**, and show the message appears in the thread. (covers `pages_messaging`)
12. Back in Connected Accounts, click **Connect Instagram**.
13. Show the Facebook Login dialog with the IG-specific scopes (`instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `instagram_manage_messages`) plus the reused Page/business scopes.
14. Approve, pick the IG account, then in the composer publish a quick image post to IG. (covers `instagram_content_publish`, `instagram_basic`)
15. Open IG analytics → show insights card. (covers `instagram_manage_insights`)
16. Open IG inbox → show a comment, reply, and **Send**. (covers `instagram_manage_comments`)
17. Switch to the IG **Messages** tab, open the test DM thread, type a reply, click **Send**, show the reply lands. (covers `instagram_manage_messages`)

### Recording requirements

- MP4, ≤ 1 GB.
- Browser at desktop resolution; OAuth dialog text must be legible at full screen (1080p or higher recommended).
- No edits/cuts during the OAuth dialog screens — reviewers want continuous capture so they can verify the scopes shown match what the app actually requested.
- Voice-over is optional but recommended for the Business Manager moment in step 5.
- Upload the same file under each scope request — Meta de-duplicates by hash, so this does not bloat your submission.

---

## Submission checklist

- [ ] Warm-up calls completed in Graph API Explorer for `pages_messaging`, `pages_manage_metadata`, `instagram_manage_messages` → wait up to 24h → confirm Request Advanced Access button is active for each
- [ ] Justification text from this doc pasted into each of the 15 scope requests
- [ ] Single recording uploaded under each scope request (or as the App Review attachment)
- [ ] Test user / test Page provided to reviewers (or use your own account if Standard Access)
- [ ] Privacy Policy URL set: https://earnest.guru/privacy-policy
- [ ] Terms of Service URL set
- [ ] Data Deletion callback URL set (Meta requires for any app using Login)
- [ ] App Domain + redirect URIs match production: `https://earnest.guru` and `https://earnest.guru/api/social/oauth/{platform}/callback`
- [ ] App Icon, category, and short description filled in on the Basic Settings tab

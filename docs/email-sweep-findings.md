# Email QA Sweep — Findings & Fixes

**Date:** 2026-07-15
**Scope:** Every outbound email in the Earnest app (Nuxt 3 + MJML) — transactional/lifecycle templates **and** the 9 notification categories — reviewed for **render**, **design**, **content/tone**, and **correctness** in both Earnest-default and org-branded modes.

**How to reproduce:** run the dev server and open `/email/preview-transactional` (brand toggle: Earnest | Org), or hit the API directly:

```
GET /api/email/preview-mjml?template=<name>&brand=earnest|org[&format=json][&org=<id>]
```

`format=json` returns `{ html, text, errors }`. Notification categories render via the new
`template=notification:<category>` variants (see [Preview coverage added](#preview-coverage-added)).

---

## TL;DR

- **21 email variants × 2 brand modes = 42 renders. Zero MJML errors, zero unsubstituted `{{vars}}`, all CTAs resolve to `https://app.earnest.guru/…`, all Directus-hosted imagery (logo, hero, 7 app-chip icons) loads.**
- **Fixed (this pass):**
  1. Plain-text (`text`) fallback produced hundreds of blank lines **and dropped every CTA URL** → now collapses whitespace and preserves link destinations. This was actually shipping on the `generic`-template sends (contract-signature + AI-composed email).
  2. Malformed `href="{{ctaUrl}}"padding=…` (missing space) in **9 templates** → fixed (was parsing by luck, not by spec).
  3. `meeting-time-changed`: the struck-through old time had no label in HTML → added **"Was:"** (matches the plain-text part).
  4. Reaction-notification preview sample corrected to the copy the app actually sends.
- **Flagged for your decision (not auto-changed):** Handlebars `noEscape:true` disables HTML-escaping of `{{vars}}` (injection/layout-break risk); reaction email says "Someone" instead of the known actor; a few subjective copy/redundancy notes. See [Flagged](#flagged--needs-a-decision).
- **Preview tooling extended** so all 9 notification categories are permanently reviewable.

---

## Preview coverage added

Previously the preview rendered `notification` with a single generic sample, so the 9 categories
weren't individually reviewable. Added:

- **`server/api/email/preview-mjml.get.ts`** — a `notification:<category>` variant for each of the
  9 categories. Each one is built through the **exact** var-construction path
  `sendNotificationEmail` uses (`server/utils/notification-emails.ts`): heading == subject,
  HTML-escaped body with `<br>`, the per-category CTA label from `ctaLabelFor()`/`CATEGORY_CTA`,
  and an explicit plain-text alternative. Sample subjects/bodies are lifted from the real strings in
  `server/utils/notificationRecipients.ts` so the preview reflects production copy.
- **`app/pages/email/preview-transactional.vue`** — the 9 `notification:<category>` entries added to
  the template list.

Category → CTA label → click-through (verified):

| Category | CTA label | Sample destination |
|---|---|---|
| conversations | View conversation | `/tickets/T-241` |
| reactions | View item | `/tickets/T-241` |
| tickets | View ticket | `/tickets/T-241` |
| tasks | View task | `/projects/P-12` |
| projects | View project | `/projects/P-12` |
| invoices | View invoice | `/invoices/INV-1042` |
| contracts | View contract | `/contracts/C-30` |
| proposals | View proposal | `/proposals/PRO-88` |
| meetings | View meeting | `/meetings/M-7` |

---

## Fixes applied

### 1. Plain-text (`text`) fallback was unusable — `server/utils/email-templates.ts`

**Symptom:** `htmlToText()` ran on the full MJML-compiled HTML. MJML's nested-table output leaves a
space on hundreds of otherwise-empty lines, so the `\n{3,}` collapse never matched — the plain-text
part was ~150 blank lines with content scattered through it. Worse, the anchor-stripping dropped the
CTA's `href`, so a plain-text reader saw "Open your dashboard" / "Join meeting" with **no link**.

**Who shipped it:** every sender passes an explicit `text` **except** the two `generic`-template
callers — `server/api/contracts/[id]/send.post.ts` (contract-signature email) and
`server/utils/ai-action-executors.ts` (AI-composed email). Those two were shipping the broken
fallback to real recipients.

**Fix:** trim spaces hugging every newline *before* collapsing runs, and preserve link destinations
as `label: url`. `generic` plain-text now reads cleanly and the CTA URL is present.

Before → after (generic):

```
(≈150 blank lines, "Open Earnest" with no URL)
→
A quick update from Northwind Studio.

A quick update

Hi Alex,
This is an AI-composed message wrapped in the branded chrome. It can contain rich HTML and multiple paragraphs.

Open Earnest: https://app.earnest.guru/

This is an automated message from Earnest: https://earnest.guru.
```

### 2. Malformed button attribute — 9 `.mjml` templates

`<mj-button href="{{ctaUrl}}"padding="…">` was missing the space between attributes. MJML's lenient
parser happened to split it correctly (verified: `href` and outer `padding` both applied), so it
rendered fine — but it's invalid and a hazard for any future parser/minifier. Fixed in: `invite`,
`generic`, `welcome`, `password-reset`, `video-invite`, `notification`, `meeting-invited`,
`meeting-time-changed`, `meeting-reminder`.

### 3. `meeting-time-changed` — unlabeled struck-through old time

The old date/time rendered as a bare strikethrough line with no lead-in, so it wasn't obvious it was
the *previous* time. Added **"Was:"** in front of the struck text, matching the plain-text version
(`Was: …`).

### 4. Reaction preview sample — faithfulness

The reaction sample now shows "Someone reacted 🎉 to your comment" — the copy the app actually
generates (`notificationRecipients.ts`), rather than an invented named-actor string. (The
"Someone"-vs-actor weakness itself is [flagged below](#flagged--needs-a-decision), not changed.)

---

## Per-email results

Design is shared via `_layout.mjml` / `_header.mjml` / `_footer.mjml` (600px body, flat white,
pill CTA in brand color, whitelabel-aware footer). Earnest chrome = "Earnest." wordmark + "Do good
work." lockup; org chrome = org logo (or org name in `brand_color`) + "Powered by Earnest" footer
(suppressed when `whitelabel`). All items below rendered clean in both modes unless noted.

### Transactional / lifecycle

| Template | Render | Notes |
|---|---|---|
| `welcome` | ✅ | Clean. Sent Earnest-chrome in practice (platform→customer); org toggle is hypothetical. |
| `early-access-welcome` | ✅ | The showpiece: hero image, green/amber/red traffic-light rules, 7-icon app-chip strip — all imagery loads. Marketing voice is intentional. |
| `invite` | ✅ | Role line + "ignore this email" reassurance read well. |
| `password-reset` | ✅ | Correct expiry copy, safe-to-ignore reassurance, optional org-workspace line. |
| `video-invite` | ✅ | Detail card (title/date/time/duration) + per-recipient link note + Join CTA. |
| `generic` | ✅ | Plain-text now fixed (see Fix #1). Used by contract-signature + AI email. |
| `meeting-invited` | ✅ | Detail card + Join CTA. |
| `meeting-time-changed` | ✅ | "Was:" label added (Fix #3). New details card + Join CTA. |
| `meeting-removed` | ✅ | No CTA (correct — nothing to join). "Reach out to host" line. |
| `meeting-cancelled` | ✅ | No CTA (correct). Terse and clear. |
| `meeting-reminder` | ✅ | "Starts in 15 minutes" + details + Join CTA. |

### Notification categories (all via `notification.mjml`)

All 9 render with correct per-category heading (== subject), `Hi {name},`, escaped body (emoji
render correctly), the right CTA label, and a production URL. The now-opt-in **reaction** email
renders correctly and is included.

| Category | Render | Notes |
|---|---|---|
| conversations | ✅ | Comment preview + "View conversation". |
| reactions | ✅ | Opt-in (off by default). Emoji renders. CTA "View item" is vague — see flagged. |
| tickets | ✅ | Status/assignment/new-ticket subjects. |
| tasks | ✅ | Routes to `/projects/{id}` (tasks live under projects — correct). |
| projects | ✅ | Completed / status / due-date / plan-approved subjects. |
| invoices | ✅ | Issued/paid. |
| contracts | ✅ | Sent/signed. |
| proposals | ✅ | Sent/accepted/declined. |
| meetings | ✅ | Generic path only; day-to-day meeting mail uses the bespoke `meeting-*` templates. |

---

## Flagged — needs a decision

These are real but either subjective or too broad to change blind in a QA pass.

### A. `noEscape: true` disables HTML-escaping of `{{vars}}` — potential injection / layout break
**`server/utils/mjml-compiler.ts`** compiles with `Handlebars.compile(source, { noEscape: true })`.
This **contradicts the documented contract** in `email-templates.ts` ("plain `{{var}}` values are
HTML-escaped by Handlebars") — with `noEscape`, both `{{x}}` and `{{{x}}}` are raw. Values that are
*not* pre-escaped and can contain other users' content flow in raw: `subject`/`heading` (a ticket or
project **title**), `meetingTitle`, `orgName`, `recipientName`. A title containing `<`, `>`, `&`, or
markup would break layout or inject HTML into the email.
*Why not auto-fixed:* flipping `noEscape` to the default is the right direction (it's what the docs
describe), but `{{var}}` also appears in attribute/style/color/href contexts across every template,
so it needs a deliberate regression pass. **Recommend:** flip it, keep `*Html` fragments on triple
braces, and re-run this sweep. Body fragments are already escaped (`escapeHtml` in
`notification-emails.ts`), so only the "plain" vars change.

### B. Reaction email says "Someone" though the actor is known
`notificationRecipients.ts` builds the reaction message as `Someone reacted {emoji} to your …` even
though `actorName` is resolved in `notify-event.ts` (it's used for the bell fold). Now that reaction
email is opt-in and can actually be sent, "**Jordan Lee** reacted 🎉 to your comment" would be
warmer and more useful. Small copy change in the resolver.

### C. Reaction CTA label "View item" is vague
`CATEGORY_CTA.reactions = 'View item'`. Every other category names the thing ("View ticket", "View
invoice"). Consider "View comment" / "View reaction" — or resolve it from the reacted collection.

### D. Notification heading == subject == body can read redundantly
For status-style notifications the H1 and the sentence restate each other (heading "Invoice paid:
INV-1042", body "Invoice INV-1042 has been paid."). It's how `sendNotificationEmail` maps
`heading = subject`; acceptable, but a shorter heading (e.g. "Invoice paid") with the reference in
the body would read better. Product call, not a bug.

### E. `welcome` / `early-access-welcome` / `password-reset` org-branded previews are hypothetical
These are platform→user emails and always send in Earnest chrome. The brand toggle still renders
them org-branded for completeness; nothing to fix, just don't be surprised by "Powered by Earnest"
under an org header there.

---

## Files touched

- `server/utils/email-templates.ts` — `htmlToText()` whitespace collapse + link-destination preservation.
- `server/emails/*.mjml` (9 files) — button attribute spacing; `meeting-time-changed` "Was:" label.
- `server/api/email/preview-mjml.get.ts` — `notification:<category>` variants + faithful samples.
- `app/pages/email/preview-transactional.vue` — expose the 9 notification variants.

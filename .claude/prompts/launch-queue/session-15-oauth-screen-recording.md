# Session 15 — OAuth screen recording for app-review submissions

**Status:** Not started
**Ships:** A 60–90s `.mp4` (or `.webm`) video that shows Earnest exercising the OAuth scopes we're requesting from Google / LinkedIn / Meta / TikTok. User attaches this to each provider's app-review form.
**Out of scope:** completing the OAuth round-trips themselves (Google / Meta / LinkedIn / TikTok app reviews are still pending — redirect URIs aren't final), submitting the review forms (user-driven), per-provider trimmed variants (do those only if a reviewer rejects the master).
**Blocker:** none. Self-contained.

## Pre-flight context

- App is at `app.earnest.guru` (prod) or `http://localhost:3000` (dev). Use **localhost** for the recording — prod video would be lossy due to network latency and compression artifacts on the public CDN.
- The dev server's `.claude/launch.json` already binds with `--host 0.0.0.0`, so `http://localhost:3000` resolves cleanly without the IPv6 426 issue.
- Both demo accounts are seeded with marketing channels, scheduler events, and clients/contacts. Use the **agency demo** (`demo-agency@earnest.guru`, `DEMO_AGENCY_USER_PASSWORD` env var) — it has Admin role, which surfaces every UI surface the OAuth flows need (org settings, team management, full marketing). The solo demo (`demo@earnest.guru`) is Member-role only and won't show as much.
- Playwright is already in `package.json` and is the same library `scripts/capture-demo-screenshots.ts` uses — copy that file's wiring (login helper, viewport, browser context setup) verbatim.
- The capture-demo-screenshots script's auth helper writes session cookies into the Playwright context — use the same approach, not the public login UI, so the recording starts already-authenticated.

## What the recording must cover

Each OAuth provider needs to see Earnest *actually using* the requested scopes. A 60–90s sequence that hits these surfaces in order:

1. **Login landing → command center / dashboard** (3–5s) — proves the user is authenticated as an org owner, sets the "this is a real product, not a mock" tone.
2. **`/marketing`** (10–15s) — channels grid, click into one (LinkedIn first since LinkedIn's review is strictest), surface the connection state, the "Compose Post" button, the scheduled-posts strip. Each provider's app review wants to see at least *one* second of their channel, so make sure the camera lingers on each.
3. **`/channels/setup`** or wherever the OAuth connect buttons are wired (10s) — hover over each "Connect …" button so the OAuth scope-list dialog surfaces. **Do NOT actually click through to the provider** (that would require completing the round-trip, which is the very thing we're getting reviewed). Just make the scope dialog visible.
4. **`/scheduler`** (10s) — show the upcoming-posts timeline, demonstrate posts are *scheduled*, not sent. This matters for Meta + TikTok reviewers who specifically care that you're not blasting content.
5. **`/clients/[id]`** (10s) — pick a seeded client. Show that the marketing context is per-client, which proves OAuth tokens are scoped per-org-per-client, not user-global. This is a key trust signal.
6. **End on `/calendar` or `/scheduler` again** (3s) — show the integrated workflow ties together. This is the "tell, don't sell" closer.

Per-provider emphasis (in case a reviewer pushes back on the master cut and wants a focused variant):
- **Google (Workspace OAuth):** linger longer on `/calendar` + any email-send modal if those flows exist.
- **LinkedIn:** make sure the org-page picker is visible — LinkedIn's review wants to see *which* org page you'd post to.
- **Meta:** show the FB-page selector + IG business account picker if both are wired.
- **TikTok:** show the content-draft + scheduling UI; TikTok review specifically wants to see the *posting* (not browsing) intent.

## How to capture

Build a one-off Playwright script that mirrors `scripts/capture-demo-screenshots.ts` — same browser launch, same login helper, same viewport. The difference is `recordVideo` instead of `screenshot`.

Sketch (`scripts/record-oauth-walkthrough.ts`, new file):

```ts
import { chromium } from 'playwright';

const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_AGENCY_USER_PASSWORD;
if (!PASSWORD) { console.error('DEMO_AGENCY_USER_PASSWORD required'); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: '/tmp/oauth-walkthrough', size: { width: 1440, height: 900 } },
  // Reuse the cookie-injection trick from capture-demo-screenshots.ts so we
  // don't burn 2s recording the login form.
});

// loginAsDemoAgency(context)  ← copy from capture-demo-screenshots.ts

const page = await context.newPage();

// Drive the sequence above. Use page.waitForTimeout liberally — videos
// look choppy when the camera moves faster than a human eye can follow.
// Aim for ~2s on each click target.
await page.goto(`${APP_URL}/`);
await page.waitForTimeout(3000);

await page.goto(`${APP_URL}/marketing`);
await page.waitForTimeout(2000);
// click LinkedIn channel card
await page.click('[data-channel="linkedin"]');
await page.waitForTimeout(2000);
// ...etc.

await context.close();  // flushes the video to disk
await browser.close();
```

**Output path:** `/tmp/oauth-walkthrough/<uuid>.webm` (Playwright auto-names). Move/rename to a stable path before handing to the user.

**Format conversion:** LinkedIn historically rejects `.webm` — convert to `.mp4` if any reviewer pushes back:

```sh
ffmpeg -i /tmp/oauth-walkthrough/*.webm -c:v libx264 -crf 23 -preset fast oauth-walkthrough.mp4
```

`ffmpeg` is on most macOS dev boxes via Homebrew. If missing, `brew install ffmpeg`.

## Steps for the agent

1. Read `scripts/capture-demo-screenshots.ts` end-to-end. Lift the login helper (the bit that injects session cookies into the Playwright context). The agency demo cookies + token shape are identical.
2. Confirm `DEMO_AGENCY_USER_PASSWORD` is in `.env`. If missing, ask the user to source it from Vercel before writing code.
3. Start the dev server via `preview_start` (or check it's already running with `preview_list`).
4. Write `scripts/record-oauth-walkthrough.ts` mirroring the structure of `capture-demo-screenshots.ts`. Sequence the navigation per the section above.
5. Run it. Verify the output file size (~2–4 MB for ~75s at 1440×900 webm is normal; <100 KB means it didn't actually capture).
6. Open the video locally (`open /tmp/oauth-walkthrough/<file>.webm`) — confirm it plays, the OAuth scope dialogs are legible, and there's no post-login flash where credentials accidentally got captured.
7. Convert to `.mp4` proactively (don't wait for a rejection — most reviewers prefer mp4).
8. Hand both files to the user. They upload to each provider's review form.
9. Commit `scripts/record-oauth-walkthrough.ts` (the script, not the video — videos are too large for git). Update `.gitignore` if needed to exclude `/tmp/oauth-walkthrough/` patterns from accidental commits.

## DoD

- `scripts/record-oauth-walkthrough.ts` committed and idempotent — running it twice produces clean output without state pollution.
- A 60–90s `.mp4` (and `.webm` master) on disk, files named `oauth-walkthrough-<YYYY-MM-DD>.{mp4,webm}` for clean attachment.
- The video shows: login → marketing → OAuth scope dialogs (all 4 providers) → scheduler → per-client marketing context. No bare credentials, no developer chrome (devtools, terminal), no inadvertent capture of anything in `/tmp` or other tabs.
- User has both files in hand and is unblocked to submit Google / LinkedIn / Meta / TikTok app reviews.

## Notes for Claude

- **Resolution / aspect:** 1440×900 is the sweet spot. Smaller looks low-rent on review forms; bigger blows past Meta's 10MB upload limit. If the file ends up >8MB, drop to 1280×800 and re-run.
- **No login form on camera.** Inject cookies, don't type the password. If a reviewer freeze-frames the video they shouldn't see a password field with the password autofilled.
- **No personal data in seeded clients.** The demo seed uses fake names — confirm before recording. If a real-looking name slips in (e.g., "Stacey Duncan" from the partner-activation seed), pick a different demo client.
- **Don't actually complete an OAuth round-trip during recording.** Hovering on the connect button to surface the scope dialog is enough. Clicking through would either hit a real provider OAuth page (which you can't drive in the recording) or fail because the redirect URIs aren't final yet. Either failure mode looks bad on review.
- **The `--headless` flag matters.** Run headless so the browser chrome doesn't appear in the recording. If you need to see the browser while debugging the script, use `headless: false` only during dev — never for the final capture.
- **Re-runnable.** Treat the script like `capture-demo-screenshots.ts` — anyone should be able to re-run it after a UI change to refresh the video, with no manual setup beyond `pnpm install` + `.env`.

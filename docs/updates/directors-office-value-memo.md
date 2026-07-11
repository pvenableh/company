# Director's Office — value memo & recommended direction

_2026-07-10 · assessment of current state + recommendation_

## What it is today

One org member "convenes" a session; Earnest AI drafts a briefing + a numbered
plan of proposed actions from real business data. Invited teammates get a
notification and can join the same session. Everyone sees a **synchronized deck**
— same advisor, same view mode, same slide the presenter navigates to — plus a
shared roster with presence dots, a shared "Ask Earnest" Q&A thread, and a shared
step list they approve/skip together. Approvals execute real changes through the
`ai_actions` queue; humans can also mint tasks/tickets on the spot. The AI
briefing and step decisions persist as history.

Transport is Directus realtime (WebSocket) with a 7s polling backstop; the whole
live layer degrades to single-user if the `director_sessions` collections/perms
aren't provisioned.

## The three questions you raised

**1. "No audio — what's the point of the live multiplayer session?"**
Confirmed: there is **zero** audio/voice anywhere in the feature (no Daily/WebRTC/
getUserMedia). So a "live meeting" today still needs an external call (Zoom/Meet/
phone) running alongside — the app only synchronizes the on-screen artifact. This
is the single biggest gap versus the "convene a meeting" framing.

**2. "Does it actually share screens?"**
No — verified. Followers do **not** see the host's screen. They mirror three
synchronized pointers (`shared_subject`, `shared_view_mode`, `current_slide`) and
re-render their own local copy of the same deck. It's "same slide index," not
screen sharing — nothing outside the deck is visible, no cursor, no arbitrary page.

**3. Session review / notify / minutes?**
- Invite notifications: **yes** (bell + push + email, deep-links to auto-join).
- "Mark visible / notify a team to review after the fact": **no**.
- Minutes/summary: **no real artifact.** The "minutes" slide is an ephemeral
  client-side count of step statuses — never saved, never sent. History is really
  "past AI briefings," not "past meetings"; ended sessions persist but aren't
  listed or replayable.

## Recommendation

**Stop selling it as a live meeting; reposition it as an async "decision room."**
The delivered value is a synchronized, shared AI-briefing-and-approval workspace.
That's genuinely useful — but the live/multiplayer framing over-promises because
there's no audio and no real screen share. Two viable directions:

### Option A (recommended) — lean into async, ship the review loop
Drop the pretense of a synchronous meeting; make the artifact the product.
1. **"Save this session's decisions"** — persist a real minutes record
   (`director_minutes`: session id, subject, the approved/skipped/executed steps,
   captured tasks, the Q&A thread, a one-paragraph AI-generated summary). Generate
   the summary server-side from data already in `ai_actions` + `director_qa`.
2. **"Share for review"** — mark a session visible and tag a user/team/org; fan
   out a `director_session_review` notification (reuse the existing
   `emitNotification` path from `invite.post.ts`) with a deep link to a read-only
   recap page rendering the minutes.
3. **Recap page** — a browsable, read-only view of the minutes (reuse
   `DirectorSlides` in a non-interactive mode). This is the "auto-generate minutes
   for others to read" idea, and it's the highest-leverage piece: it turns a
   one-off working session into a durable, shareable decision record.

This is mostly additive (one collection, one notification type, one read-only
route + a summary prompt) and makes the feature valuable **without** solving
audio/screen-share.

### Option B — make it a real live meeting (heavier)
Only if you want true synchronous review: add audio via Daily (already a
dependency elsewhere in the app for video meetings) and optional real screen
share. This is a much bigger lift, competes with Zoom/Meet, and doesn't play to
Earnest's strength (the AI briefing + approval queue). Not recommended as the
next step.

**Suggested next step:** build Option A's minutes + review-notification + recap
page. It's the smallest change that closes the "why is this multiplayer" gap and
delivers the specific ideas you floated (visible-to-others, notify-to-review,
auto-minutes) — no audio required.

# Session 14 — Onboarding completion + OAuth screen-recording + post-launch cleanup

**Status:** Not started
**Ships:** Stripe checkout + welcome email in wizard, OAuth-approval screen recording, A₂ chat-sessions fix, IPv6 dev-env close-out, C₂ useLeads/useProposals row-scoping
**Out of scope:** marketing-site pricing UI, full customer-portal redesign, name.com email forwarding (user-only manual step)

## Pre-flight context (read first)

- **Stripe live env vars** ARE now fully in Vercel as of 2026-04-29 (user confirmed all price IDs + secret key + webhook secret). Test-mode equivalents already in local `.env`. Welcome email + checkout wiring is the only remaining app-side blocker.
- **Earnest hosted at [earnest.guru](https://earnest.guru)**, OAuth redirects are pending for Meta / TikTok / LinkedIn / Google. User needs an in-app screen recording to submit with the OAuth-app review forms.
- Three deferred bugs from earlier passes — full prompts already exist as separate files; this session bundles + sequences them.

## TL;DR — five tasks, do them in this order

| # | Task | Detailed prompt | Why this order |
|---|------|-----------------|----------------|
| 1 | Stripe checkout + welcome email in wizard | [session-9-onboarding-completion.md](./session-9-onboarding-completion.md) | Pre-launch blocker. Every other task is post-launch. |
| 2 | OAuth screen recording | (this file, §2) | User-blocked on this; agent can drive a Playwright recording. |
| 3 | Newer chat sessions not surfacing on cold load | [session-7b-chat-sessions-cold-load.md](./session-7b-chat-sessions-cold-load.md) | Phase A₂ data-side bug. |
| 4 | IPv6 `localhost` 426 dev-env fix | [session-7c-ipv6-localhost.md](./session-7c-ipv6-localhost.md) | Dev-only nuisance. **Note:** Session 13 confirmed `http://localhost:3000` already works because `.claude/launch.json` starts dev with `--host 0.0.0.0`. So this may already be closed in practice — just confirm and update memory. |
| 5 | useLeads + useProposals row-scoping | [session-7a-c2-deferred.md](./session-7a-c2-deferred.md) | Deferred pending data backfill — verify backfill state before touching. |

## §1 — Onboarding completion (Stripe checkout + welcome email)

**Defer to [session-9-onboarding-completion.md](./session-9-onboarding-completion.md).** That file is the source of truth — read it end-to-end before touching code. Quick pointers:
- Wizard at [app/pages/organization/new.vue](app/pages/organization/new.vue) currently 4 steps; insert payment step between plan-selection and invite-team.
- Backend already exists: [`server/api/stripe/subscription/checkout.post.ts`](server/api/stripe/subscription/checkout.post.ts), [`server/api/stripe/addons/subscribe.post.ts`](server/api/stripe/addons/subscribe.post.ts).
- `startCheckout(priceId)` is already exported from [`useSubscription.ts:112`](app/composables/useSubscription.ts:112) but never called.
- Welcome email: copy SendGrid SDK wiring from [`email/newsletter-send.post.ts`](server/api/email/newsletter-send.post.ts).

DoD per session-9: payment step blocks dashboard entry unless user picks Free, Stripe Checkout round-trips, webhook updates `organizations.plan`, welcome email lands.

Stripe env vars (all 12 price IDs + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`) are confirmed live in Vercel as of 2026-04-29 — no env-var sanity check needed before shipping. Reference [reference_stripe_wiring.md](memory/reference_stripe_wiring.md) for the full var list if a name lookup is needed during wiring.

## §2 — OAuth screen recording for app-review submissions

User needs a screen recording of Earnest in action to attach to OAuth-app review forms for: **Google** (Workspace OAuth), **LinkedIn** (org/page posting), **Meta** (FB/IG posting), **TikTok** (posting). All four review boards want to see the app actually using the requested scopes.

### What to record

A 60–90s walkthrough showing the integrated workflow from a marketer's POV. Recommended sequence:

1. **Login** → demo-agency dashboard ([http://localhost:3000](http://localhost:3000) → demo-agency-login)
2. **Navigate to /marketing** → show channels grid, click into one (e.g. LinkedIn) → show connection state, "Compose Post" button, scheduled posts
3. **Navigate to /channels/setup** (or wherever the OAuth connect buttons live) → hover/click "Connect LinkedIn" to surface the OAuth scope-list dialog (don't actually complete the OAuth — just show what scopes Earnest requests and why)
4. **Navigate to /scheduler** → show the upcoming post timeline, demonstrate that posts are scheduled, not sent
5. **Navigate to /clients/[id]** → show that the marketing context is per-client (proves OAuth tokens are scoped per-org, not user-global)

Each OAuth provider has its own emphasis:
- **Google:** Workspace mail/calendar — show the calendar page + an email send modal if those flows exist
- **LinkedIn:** show the org-page picker (LinkedIn's review wants to see *which* org page you'd post to)
- **Meta:** show the page-selector for FB pages + IG business account
- **TikTok:** show the content draft + scheduling UI

Treat a single combined recording as a draft only — TikTok and Meta reviewers have historically rejected generic clips that don't show their specific scope being exercised. Plan to trim per-provider variants from the master recording if any reviewer pushes back.

### How to capture

Use Playwright's video recording — it's already in the dependencies (used by `scripts/capture-demo-screenshots.ts`). Sketch:

```ts
// scripts/record-oauth-walkthrough.ts (new file, mirror capture-demo-screenshots.ts wiring)
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: '/tmp/oauth-walkthrough', size: { width: 1440, height: 900 } },
});
await loginAsDemo(context, 'agency');
const page = await context.newPage();
// scripted nav: command-center → marketing → channels/setup → scheduler → clients/<id>
// Use page.waitForTimeout between navs so the recording captures the full state, not just transitions.
await context.close(); // flushes the video to disk
```

Output as `.webm` at `/tmp/oauth-walkthrough/<uuid>.webm`. Convert to `.mp4` if any of the OAuth review forms reject `.webm` (LinkedIn historically does):

```sh
ffmpeg -i /tmp/oauth-walkthrough/*.webm -c:v libx264 -crf 23 -preset fast oauth-walkthrough.mp4
```

Hand the resulting file path back to user — they upload to each provider's app-review form.

### DoD

- A 60–90s `.mp4` (or `.webm`) on disk that shows the marketing/scheduler workflow + OAuth scope dialogs
- User is unblocked to submit Google / LinkedIn / Meta / TikTok app reviews
- Optional: commit the recording script for future re-runs (don't commit the video itself — too large for git)

## §3 — Newer chat sessions cold-load bug

**Defer to [session-7b-chat-sessions-cold-load.md](./session-7b-chat-sessions-cold-load.md).** Likely the same Phase C SSR cookie-forwarding pattern: `$fetch` → `useRequestFetch()`. Find which composable feeds the AI sidebar's session list (probably `useAIChat*` or `useAINotes`), apply the fix, verify with cold incognito hard-nav.

## §4 — IPv6 `localhost` 426 dev-env

**Defer to [session-7c-ipv6-localhost.md](./session-7c-ipv6-localhost.md), but read this update first:** Session 13 (2026-04-29) verified that `http://localhost:3000` works correctly when `pnpm dev` is started via the `.claude/launch.json` config (which uses `--host 0.0.0.0`). The original 426 bug was reproduced under the bare `pnpm dev` flag. So options:

1. Confirm the launch.json workaround is enough for daily dev → close the bug as "use launch.json" and remove from queue
2. OR root-cause why bare `pnpm dev` (no `--host`) returns 426 on `[::1]`

Lean toward (1) unless user wants the deeper fix. Update [reference_dev_server_ipv6.md](memory/reference_dev_server_ipv6.md) with the new "use --host 0.0.0.0" workaround note either way.

## §5 — useLeads + useProposals row-scoping

**Defer to [session-7a-c2-deferred.md](./session-7a-c2-deferred.md).** Before touching code, check whether the data backfill that this was waiting on has happened — query for `leads.organization` and `proposals.organization` null counts in prod. If still nullable, push back to user before fixing.

## DoD for the whole session

- §1: Stripe checkout + welcome email shipped + verified end-to-end on test-mode
- §2: OAuth walkthrough video on disk + recording script committed
- §3: Phase A₂ chat-sessions bug closed
- §4: IPv6 localhost bug closed (either workaround-confirmed or root-fixed)
- §5: useLeads/useProposals row-scoping shipped (or punted with a clear reason)

## Notes for Claude

- §1 is the only pre-launch blocker. If time runs short, ship §1 + §2 (user-blocked) and punt §3/§4/§5 to a later session.
- Don't regress demo accounts: `requireOrgRole` still blocks `demo@earnest.guru` + `demo-agency@earnest.guru` from Stripe routes.
- The dev server is IPv6-bound when started without `--host` — see `reference_dev_server_ipv6.md`. For Playwright (§2 recording), use `http://localhost:3000` since launch.json starts dev with `--host 0.0.0.0`.
- After §1 lands, smoke-test the wizard with a fresh email → Stripe test card 4242-4242-4242-4242 → confirm `organizations.plan` updates via webhook + welcome email arrives.
- For §2, the demo-agency context already has marketing channels seeded — leverage that rather than seeding new ones.
- Ask user to confirm before pushing — main is the deploy branch.

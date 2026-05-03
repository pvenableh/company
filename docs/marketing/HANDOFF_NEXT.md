# Marketing feed — next-session handoff

Use this as a `/handoff` prompt for a new Claude Code session. Repo at `/Users/peterhoffman/Sites/earnest/earnest`, branch `main`, all five marketing commits already pushed to origin.

## What's shipped (already on origin/main)

| Commit | Title |
|---|---|
| `1f15526` | Marketing feed: scaffold + Anthropic generators for all 3 card types |
| `6a66926` | Marketing cron: signal extractors + deterministic ranker + weekly refresh |
| `bf34fe1` | Marketing timeline + push-button Do-all + role gate |
| `1cb81d9` | Marketing send-time machinery (DRY-RUN, NOT auto-armed) |
| `50077d6` | Demo data seed: backdate contacts + qualified leads for marketing cron |

End-to-end verified against the demo Solo org `40c4d2e5-79d2-4008-9a97-9c14f94dfd0e`:
- All 3 card-type generators produce real Anthropic-grounded drafts (~2-4K tokens / 8-25s).
- Weekly cron `/api/marketing/cron/refresh-recommendations` picks 3 candidates per dry-run, ranker scoring works.
- Send cron `/api/marketing/cron/send-due-touches` returns clean JSON in dry-run mode.
- `/marketing-feed` and `/marketing-timeline` both render and pass tooltips/snapshot checks.
- "Do all N" actually generates+schedules the full feed in one click for managers+.

## What's NOT done (in priority order)

### 1. Per-touch regenerate (next-clearest win)
The `[Regenerate · 200]` pill in [TouchEditor.vue](app/components/Marketing/TouchEditor.vue) is wired to nothing. Build:
- `POST /api/marketing/touches/[id]/regenerate` — re-runs the generator on a single touch with a "vary" instruction. Saves the prior version into `marketing_touches.regenerate_history` (jsonb) for one-click undo.
- Reuse the dispatch pattern in [generate.post.ts](server/api/marketing/recommendations/%5Bid%5D/generate.post.ts) — read the touch + parent campaign, look up the card_type's generator, pass the existing draft as a "previous attempt, vary the angle" hint in the user message.

### 2. Per-recipient personalization
The `Personalize · ~1.7K` button in [TouchEditor.vue](app/components/Marketing/TouchEditor.vue) is also wired to nothing. Build:
- New collection `marketing_touch_variants` (FK to touch + contact, holds personalized subject/preview/body).
- `POST /api/marketing/touches/[id]/personalize` — uses prompt caching (the base draft is the cached portion) and runs the per-recipient personalization prompt for each contact in the audience snapshot.
- Send cron must pick the per-contact variant when present, falling back to the base touch otherwise.

### 3. Arm the send cron (manual, requires user judgment)
- Verify a few campaigns end-to-end with `dryRun: true` on production.
- Set Vercel env `MARKETING_SEND_DRY_RUN=false`.
- Add to [vercel.json](vercel.json):
  ```json
  { "path": "/api/marketing/cron/send-due-touches", "schedule": "0,15,30,45 * * * *" }
  ```
- This is intentionally NOT in vercel.json yet — see big SAFETY block at the top of [send-due-touches.ts](server/api/marketing/cron/send-due-touches.ts).

### 4. Drawer polish (low-effort, high-feel)
In [marketing-feed.vue](app/pages/marketing-feed.vue) `onScheduleAll`:
- Currently nulls `activeRec/activeDraft` immediately, leaving the closed Sheet portal hanging briefly.
- Wrap the null in `setTimeout(..., 300)` to match the Sheet close animation.

### 5. Timeline auto-scroll edge case
[marketing-timeline.vue](app/pages/marketing-timeline.vue) auto-scrolls to the now-line via `watch(() => totalCount.value, scrollToNow)`. The watcher fires once on data load, but if the user lands on the page with `selectedOrg` already set, the watcher may miss because `totalCount` doesn't change. Add `{ immediate: true }` or add a separate `onMounted(() => scrollToNow())`.

### 6. Audience-list editor + adjust-timing strip
Both surfaces are referenced in [ReviewDrawer.vue](app/components/Marketing/ReviewDrawer.vue) but not wired:
- Click the audience strip → modal to add/remove contacts from `audience_snapshot.contact_ids`.
- "Adjust timing" footer button → expand an inline strip showing each touch's `send_offset_hours` as draggable bars.

### 7. Token-economics tightening (post-launch)
- Cold dormant calls: ~3,700 tokens (75% over the 2,100 spec budget — `available_facts` JSON dominates).
- Warm calls (within 5-min cache window): ~1,100 tokens.
- Decide: tighten facts JSON, switch dormant to Haiku 4.5, or accept higher per-card cost.

### 8. Voice fingerprint subsystem (deferred from spec)
All three generators currently call `getResolvedVoice()` which returns `NEUTRAL_VOICE`. The full voice-ingestion subsystem (analyze sent emails → extract formality/warmth/signature_phrases) is designed but not built. Until it ships, every org gets the same voice — fine for v1 but a key differentiator promised in the brand pitch.

## Verification commands

```bash
# Re-seed demo source data so cron has signals to find
pnpm tsx scripts/seed-marketing-source-data.ts

# Re-seed the 3 demo recommendations directly (bypasses cron)
pnpm tsx scripts/seed-marketing-recommendations.ts

# Smoke-test the cron in dry-run (returns 3 candidates per current state)
curl -sX POST http://127.0.0.1:3000/api/marketing/cron/refresh-recommendations \
  -H 'content-type: application/json' \
  -d '{"organizationId":"40c4d2e5-79d2-4008-9a97-9c14f94dfd0e","dryRun":true}' | jq

# Smoke-test send cron (returns dueCount=0 if nothing scheduled in the window)
curl -sX POST http://127.0.0.1:3000/api/marketing/cron/send-due-touches \
  -H 'content-type: application/json' \
  -d '{"dryRun":true,"lookbackMinutes":43200}' | jq
```

## Critical gotchas (from prior session memory)

- All `marketing_*` collections use **integer auto-increment IDs**, not uuid. FKs to them must be integer.
- All marketing endpoints route through `getTypedDirectus()` after `requireOrgMembership(event, orgId)` from [server/utils/marketing-perms.ts](server/utils/marketing-perms.ts) — collections have no row-level perms.
- Dev server: use `http://127.0.0.1:3000`, not `localhost` (ipv6 ::1 returns 426).
- Modern theme uppercases `h1/h2/h3` globally — long sentence headlines need `style="text-transform: none; letter-spacing: -0.01em"` inline (Tailwind's `!normal-case` doesn't win specificity).
- Demo Solo org id: `40c4d2e5-79d2-4008-9a97-9c14f94dfd0e`.

## Ship/no-ship status for production

**Safe to deploy from main as-is.** The send cron is dry-run by default both in code (`MARKETING_SEND_DRY_RUN` not set) and in scheduling (no entry in vercel.json). The refresh cron is in vercel.json and will fire Mondays 13:00 UTC, but it too defaults to dry-run unless `MARKETING_REFRESH_DRY_RUN=false` is set.

To go live: set both env vars and add the send-cron entry to vercel.json (only after verifying audiences are real opted-in recipients).

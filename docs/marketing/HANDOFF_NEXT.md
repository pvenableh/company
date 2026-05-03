# Marketing feed — next-session handoff

Use this as a `/handoff` prompt for a new Claude Code session. Repo at `/Users/peterhoffman/Sites/earnest/earnest`, branch `main`, all marketing commits already pushed (or about to be — `git push` if not).

## What's shipped (already on origin/main)

| Commit | Title |
|---|---|
| `1f15526` | Marketing feed: scaffold + Anthropic generators for all 3 card types |
| `6a66926` | Marketing cron: signal extractors + deterministic ranker + weekly refresh |
| `bf34fe1` | Marketing timeline + push-button Do-all + role gate |
| `1cb81d9` | Marketing send-time machinery (DRY-RUN, NOT auto-armed) |
| `50077d6` | Demo data seed: backdate contacts + qualified leads for marketing cron |
| `01011f0` | Marketing handoff: docs/marketing/HANDOFF_NEXT.md |
| `20ef3b0` | Marketing per-touch regenerate + persistent drafts |

End-to-end verified against the demo Solo org `40c4d2e5-79d2-4008-9a97-9c14f94dfd0e`:
- Cold generate persists `marketing_campaigns(status=draft)` + N `marketing_touches(status=pending)` and returns IDs in the `DraftedCampaign` payload.
- Re-clicking Generate on a drafted card hits the reload path (~700ms, no token spend).
- Per-touch Regenerate pill in the drawer actually regenerates one touch via single-touch generator (~10s, ~3.3K tokens), pushes prior into `regenerate_history`.
- Undo pill appears once history is non-empty; restore is token-free and pops the head entry.
- Discard deletes the draft campaign (CASCADE takes touches) and resets the rec to `pending`.
- Schedule promotes the existing draft (PATCH `scheduled_for` + flip statuses) instead of re-creating rows — `marketing_touches.id` stays stable across the lifecycle.
- `/marketing-feed` and `/marketing-timeline` both render and pass tooltips/snapshot checks.

## Lifecycle reference (committed in 20ef3b0)

```
marketing_recommendations: pending → drafted → approved | skipped | expired
marketing_campaigns:               draft → scheduled → partial_sent → completed
                                                    └→ cancelled / archived
marketing_touches:                pending → scheduled → sent → cancelled | failed
```

- `generate.post.ts` creates `campaign(status=draft)` + N `touches(status=pending)` once. Idempotent — re-call on a drafted rec returns the saved campaign without burning tokens.
- `schedule.post.ts` requires an existing draft (rec.resulting_campaign in `draft`). If absent, returns 409 with "run Generate first".
- `discard.post.ts` requires the campaign to still be in `draft` (refuses 409 otherwise).
- `touches/[id]/regenerate.post.ts` requires touch.status in `[pending, scheduled]`. Sent/cancelled/failed touches are immutable.
- `touches/[id]/restore.post.ts` same status constraint; refuses 409 when history is empty.

## What's NOT done (in priority order)

### 1. Per-recipient personalization (next-clearest win)
The `Personalize · ~1.7K` button in [TouchEditor.vue](app/components/Marketing/TouchEditor.vue) is wired to nothing. Build:
- New collection `marketing_touch_variants` (FK to touch + contact, holds personalized subject/preview/body).
- `POST /api/marketing/touches/[id]/personalize` — uses prompt caching (the base draft is the cached portion) and runs the per-recipient personalization prompt for each contact in the audience snapshot.
- Send cron must pick the per-contact variant when present, falling back to the base touch otherwise.
- Mirror the lifecycle pattern from regenerate: persistent rows, idempotent re-call, status field for partial completion.

### 2. Arm the send cron (manual, requires user judgment)
- Verify a few campaigns end-to-end with `dryRun: true` on production.
- Set Vercel env `MARKETING_SEND_DRY_RUN=false`.
- Add to [vercel.json](vercel.json):
  ```json
  { "path": "/api/marketing/cron/send-due-touches", "schedule": "0,15,30,45 * * * *" }
  ```
- This is intentionally NOT in vercel.json yet — see big SAFETY block at the top of [send-due-touches.ts](server/api/marketing/cron/send-due-touches.ts).

### 3. Drawer polish (low-effort, high-feel)
In [marketing-feed.vue](app/pages/marketing-feed.vue) `onScheduleAll`:
- Currently nulls `activeRec/activeDraft` immediately, leaving the closed Sheet portal hanging briefly.
- Wrap the null in `setTimeout(..., 300)` to match the Sheet close animation.

### 4. Timeline auto-scroll edge case
[marketing-timeline.vue](app/pages/marketing-timeline.vue) auto-scrolls to the now-line via `watch(() => totalCount.value, scrollToNow)`. The watcher fires once on data load, but if the user lands on the page with `selectedOrg` already set, the watcher may miss because `totalCount` doesn't change. Add `{ immediate: true }` or add a separate `onMounted(() => scrollToNow())`.

### 5. Audience-list editor + adjust-timing strip
Both surfaces are referenced in [ReviewDrawer.vue](app/components/Marketing/ReviewDrawer.vue) but not wired:
- Click the audience strip → modal to add/remove contacts from `audience_snapshot.contact_ids`.
- "Adjust timing" footer button → expand an inline strip showing each touch's `send_offset_hours` as draggable bars.

### 6. Pre-touch edits don't auto-save
The drawer holds `localTouches` in memory. Edits to subject/body in the editor only persist on Schedule (via the body's `touches[]` patch). If the user closes the drawer without Schedule or Discard, edits are lost — the reload path returns the server's last-saved version.
- Either add a debounced PATCH per field on blur, or accept this and update the "Drafts auto-save" copy to "Drafts auto-save on Schedule".
- Recommended: add `PATCH /api/marketing/touches/[id]` that accepts the same field set as regenerate (subject/body/cta/etc.) and is gated identically. Wire from `TouchEditor`'s existing `update` emit.

### 7. Token-economics tightening (post-launch)
- Cold dormant calls: ~3,700 tokens (75% over the 2,100 spec budget — `available_facts` JSON dominates).
- Warm calls (within 5-min cache window): ~1,100 tokens.
- Single-touch regenerate: ~3,300 tokens (similar input-side cost; smaller output).
- Decide: tighten facts JSON, switch dormant to Haiku 4.5, or accept higher per-card cost.
- Note: the TouchEditor pill no longer shows a token estimate (was misleading at "200" — actual is ~3K). Consider showing the *output* token portion (~600) as the user-facing number once we have telemetry.

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

# Inspect a draft campaign + its touches (use rec id from the feed)
pnpm tsx -e "
import 'dotenv/config';
async function main() {
  const url = process.env.DIRECTUS_URL!, token = process.env.DIRECTUS_SERVER_TOKEN!;
  const recId = 11; // change me
  const rec = await fetch(\`\${url}/items/marketing_recommendations/\${recId}?fields=id,status,resulting_campaign\`, { headers: { authorization: \`Bearer \${token}\` } }).then(r => r.json());
  console.log('rec', rec.data);
  if (!rec.data.resulting_campaign) return;
  const camp = await fetch(\`\${url}/items/marketing_campaigns/\${rec.data.resulting_campaign}?fields=id,status,start_date\`, { headers: { authorization: \`Bearer \${token}\` } }).then(r => r.json());
  console.log('campaign', camp.data);
  const touches = await fetch(\`\${url}/items/marketing_touches?filter[campaign][_eq]=\${rec.data.resulting_campaign}&fields=id,kind,status,email_subject,regenerate_history\`, { headers: { authorization: \`Bearer \${token}\` } }).then(r => r.json());
  console.log('touches', touches.data);
}
main().catch(e => { console.error(e); process.exit(1); });
"
```

## Critical gotchas (carry-forward + new this session)

- All `marketing_*` collections use **integer auto-increment IDs**, not uuid. FKs to them must be integer.
- All marketing endpoints route through `getTypedDirectus()` after `requireOrgMembership(event, orgId)` from [server/utils/marketing-perms.ts](server/utils/marketing-perms.ts) — collections have no row-level perms.
- Dev server: use `http://127.0.0.1:3000`, not `localhost` (ipv6 ::1 returns 426).
- Modern theme uppercases `h1/h2/h3` globally — long sentence headlines need `style="text-transform: none; letter-spacing: -0.01em"` inline (Tailwind's `!normal-case` doesn't win specificity).
- Demo Solo org id: `40c4d2e5-79d2-4008-9a97-9c14f94dfd0e`.
- **NEW:** `pnpm typecheck` OOMs on this codebase (vue-tsc memory ceiling). Don't chase it — trust HMR errors in the preview server.
- **NEW:** Demo org token cap was bumped to 100K and `ai_tokens_used_this_period` reset to 0 during 20ef3b0 verification. Revert if you want realistic token gating in demo:
  ```bash
  pnpm tsx -e "import 'dotenv/config'; (async () => { const url = process.env.DIRECTUS_URL!, token = process.env.DIRECTUS_SERVER_TOKEN!; await fetch(\`\${url}/items/organizations/40c4d2e5-79d2-4008-9a97-9c14f94dfd0e\`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: \`Bearer \${token}\` }, body: JSON.stringify({ ai_token_limit_monthly: 10000 }) }); })()"
  ```
- **NEW:** `regenerate_history` is stored as a JSONB array of `TouchHistoryEntry` (newest first), capped at 10. The shape is in [shared/marketing-persistence.ts](shared/marketing-persistence.ts).
- **NEW:** `marketing_touches.regenerate_history` previously typed `Record<string, unknown> | null` — anything that read it before 20ef3b0 expecting an object will break. Only the new endpoints touch it.
- **NEW:** A draft campaign is created the moment the user clicks Generate. If they close the drawer without scheduling, the campaign sits in DB with `status='draft'`. The 5-minute prompt cache TTL means re-opening within 5 min hits cached system prompts on any subsequent regenerate.

## Ship/no-ship status for production

**Safe to deploy from main as-is.** The send cron is dry-run by default both in code (`MARKETING_SEND_DRY_RUN` not set) and in scheduling (no entry in vercel.json). The refresh cron is in vercel.json and will fire Mondays 13:00 UTC, but it too defaults to dry-run unless `MARKETING_REFRESH_DRY_RUN=false` is set.

To go live: set both env vars and add the send-cron entry to vercel.json (only after verifying audiences are real opted-in recipients).

A side effect of 20ef3b0: feature is now safer to demo. Manager clicks Generate → draft persists → review at leisure → Schedule promotes the same rows into `scheduled_for`. No accidental sends from button-mashing the drawer.

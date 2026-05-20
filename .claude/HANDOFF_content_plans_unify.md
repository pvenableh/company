# Handoff — Content Plans: unify with existing Studio + add Camila tutorial

## Why we're here

This session shipped a new `content_plans` collection + `/social/plans/[id]` editor + `/portal/plans/[token]` plan-level review on top of the existing Retainer + Social Content Studio (which already had per-post review at `/portal/content`). Result: Camila now has **two create flows** ("+ New Draft" vs "+ New Plan" on the Studio surface) and the client has **two portal review surfaces**. We need to collapse the duplication and add a tutorial so this is genuinely intuitive for Camila.

Read first:
- `MEMORY.md` entry for "Retainer + Social Content Studio plan" (file: `project_retainer_social_plan.md`) — covers all 6 phases that shipped 2026-05-18, including `/portal/content` and per-post approve. Phase 5 is the relevant section.
- This session's work landed on the prior phase 6 foundation. **Files added this session (uncommitted, on `main`):**
  - `scripts/setup-content-plans.ts` (RAN on prod Hue Directus, idempotent)
  - `server/utils/content-plans.ts`
  - `server/api/social/plans/index.ts` + `[id].ts` + `[id]/send-for-review.post.ts` + `[id]/portal-approve.post.ts` + `[id]/portal-post-action.post.ts` + `by-token/[token].get.ts`
  - `app/components/Social/InstagramGridPreview.vue`
  - `app/pages/social/plans/[id].vue`
  - `app/pages/portal/plans/[token].vue`
  - Modified: `app/components/apps/marketing/StudioSurface.vue`, `shared/social.ts`, `scripts/patch-tenant-row-perms.ts`

## Current state — the duplication

Three surfaces over `social_posts`:
1. `/social/compose` — legacy single-post composer (still wired)
2. `/apps/marketing?floor=studio` — review queue, now with **both** "+ New Draft" (loose post, target_month-grouped) AND "+ New Plan" (plan-bundle)
3. `/social/plans/[id]` — new plan editor

Two portal review surfaces:
- `/portal/content` — portal-logged-in client, lists posts per-post (existing, shipped Phase 5)
- `/portal/plans/[token]` — anonymous emailed link, plan-level view with IG wall preview (new this session)

Camila must mentally distinguish "loose draft" vs "plan post." Clients hit different UI depending on whether you handed them an emailed token link or directed them to the portal. That's the friction to remove.

## Goal — pick ONE canonical model

### Decision 1: collapse loose drafts into plans

Every `social_posts` row belongs to a `content_plans` row. No loose drafts.

- **Migration:** for each existing post that lacks `content_plan`, find-or-create an "Inbox" plan for that (`project`, `target_month`) and attach. Plans have `plan_type='monthly_cadence'`. If a post has no `project`, attach to a per-org "Unsorted" plan keyed by `target_month` only (project nullable on plan would require a small migration — see schema work below).
- **Schema:** make `social_posts.content_plan` NOT NULL after backfill. OR keep it nullable but never show "loose posts" in any UI — server lists default-filter to posts with a plan, and the find-or-create runs on post create.
- **Studio surface:** delete the "+ New Draft" CTA. Single CTA: "+ New Plan." Inside a plan, "Quick add post" inline-creates a new post bound to that plan. The legacy `groups` computed (project + target_month) in `StudioSurface.vue` goes away; replace with a list of plan cards.
- **`/social/compose`:** still useful for one-offs. Make it always create-and-attach to the matching project's current-month Inbox plan. Drop the project/target_client picker (inherit from plan).

This means `content_plans.project` should become **nullable** to support the "Unsorted" bucket — OR we require a project on every post (cleaner, matches the retainer model). Recommend the latter: posts without a project are an anti-pattern in this system.

### Decision 2: one portal review surface

Keep `/portal/content` as the canonical surface for logged-in portal users. Restructure it so the listing groups posts by their plan:

```
[ Plan card — May 2026 Social — RKC ]
  [IG wall preview at full width]
  Strategy excerpt + objective + themes
  Posts list (each with Approve / Request Changes)
  Plan-level "Approve Plan" CTA
```

The emailed link `/portal/plans/[token]` either:
- (a) Stays as the anonymous-friendly variant of the same UI (preferred — copy-paste the body of `/portal/content`'s plan card into `/portal/plans/[token]`), OR
- (b) Redirects to `/portal/content?plan=<plan-id>&token=<token>` when a token is present, with logged-in users seeing the same view.

Recommend (a) — keeps the anonymous code path narrow and the logged-in path policy-gated. Extract the shared plan-card body into `app/components/Portal/PlanReviewCard.vue` so both surfaces render identically.

### Decision 3: keep `content_plans` as the structural primitive

Don't roll back the new collection — it's the future-proofing piece (campaign/launch via `project_event`, hours per deliverable via `time_entries.source_content_plan`). The fix is upstream: make plans the only surface, not a parallel one.

## Tutorial — Camila's first run

**Layer 1: Empty-state walkthrough**
- `StudioSurface.vue` empty state (no plans, no posts): swap the current "Your studio is quiet" card for a 3-step numbered list ("Create a plan • Add posts with the wall preview • Send the link for client approval") with a primary "+ Create your first plan" CTA. Keep the existing `studio-empty` CSS — just replace the body.
- `/social/plans/[id]` empty posts state: same pattern. Headline "Your wall is empty — let's fill it." Steps: ("Write the strategy at the top • Drop in posts with cover images • Approve & schedule when the client signs off"). Primary CTA focuses the caption input.

**Layer 2: First-visit intro modal on `/social/plans/[id]`**
- 4-slide carousel inside a `UModal`. Slides: (1) "This is your monthly content plan" — annotated screenshot of strategy card; (2) "Add posts inline" — annotated screenshot of post row; (3) "See the wall fill out" — annotated screenshot of `InstagramGridPreview` with arrow; (4) "Share for review" — annotated screenshot of Send for Review button + copy-link toast.
- Persist dismissal via a new `directus_users.app_pref_studio_intro_dismissed_at` (timestamp; null = not seen). Pattern: copy `scripts/setup-user-pref-perms.ts` to add the field + perm 28 patch (the memory entry `reference_directus_user_pref_perm_gap.md` is the canonical add-a-field path).
- Add a small "i" badge in the plan editor header that re-opens the intro.

No external library. Native `<UModal>` + Embla (already in the project per memory — Session 20 marketing slider) or a plain manual carousel.

## Concrete next-session task list

1. **Decide nullable vs required `project` on plans** — pick one. Recommendation: required (matches retainer model + lets plans live entirely under "Project › Plans").
2. **Backfill migration** — `scripts/backfill-content-plans.ts`: walk every `social_posts` row, find-or-create plan by `(project, target_month)`, set `social_posts.content_plan` FK. Skip rows without project (or attach to a per-org Inbox; decide upfront).
3. **Studio surface rewrite** — remove "+ New Draft", remove the `groups` computed, replace with plan cards. The detail-modal post-edit flow stays.
4. **Portal unification** — extract `app/components/Portal/PlanReviewCard.vue`; render it in both `/portal/content` (logged-in path) and `/portal/plans/[token]` (anonymous path).
5. **`/social/compose` auto-attach** — when a project is selected, find-or-create the current-month plan and attach the new post. Drop manual target_month/project pickers where they're now redundant.
6. **Empty-state walkthroughs** — both pages.
7. **First-visit intro modal** — `app/components/Social/StudioIntroModal.vue` + the new user-pref field + perm patch + dismissal logic.
8. **Live verify on Hue** — Camila's flow: empty Studio → create plan → add 3 posts → IG wall fills → Send for Review → open the emailed link in private browsing → Approve Plan → confirm posts flip to `scheduled`.

## Constraints to respect

- The `content_plans.id` is `integer` (not uuid) — Directus's `schema: {}` collection-create defaults to integer-autoincrement and the createField workaround for UUIDs silently no-ops. Don't try to "fix" this to UUID; the existing FK columns (`social_posts.content_plan`, `time_entries.source_content_plan`) are integer to match. (Memory: this gotcha cost us an hour this session.)
- The Directus admin token is required for any `/relations` POST after a collection create — non-admin tokens get "doesn't exist." This session's setup script handles it; mirror its pattern in any new schema work.
- Dev preview is at `http://127.0.0.1:3000` ONLY (see `feedback_dev_preview_host.md`). `localhost` returns HTTP 426.
- All client-facing reads/writes go through Nuxt server routes that use the Directus server token — no `useDirectusItems('content_plans')` on the client side, ever. Portal permissions are token-validated, not policy-gated.
- Existing per-post portal endpoints (`POST /api/social/posts/:id/portal-approve`, `portal-request-changes`) are still in use by `/portal/content` and must stay working post-unification.

## Open design questions (resolve with user before coding)

- "Inbox plan" auto-creation: every project gets a permanent `target_month`-keyed Inbox plan? Or a single rolling "no-month" plan per project? Either works, but pick one before backfilling.
- Should `/portal/content` show ONLY plans, or both plans and "stray" loose posts during the transition? Recommend plans-only, with a one-time backfill into Inbox plans.
- Tutorial scope: just Camila (staff)? Or also a one-time hint on `/portal/plans/[token]` for the client? Recommend staff-only — the client surface should be self-explanatory or it's failing.
- `social_posts.target_month` field — once plans own the month, this field is redundant. Drop it after backfill, or keep as denormalized cache? Recommend drop.

## Verification when done

End-to-end on Hue:
1. Log in as Peter, navigate to `/apps/marketing?floor=studio` — empty Studio shows the new 3-step walkthrough.
2. Click "+ Create your first plan" → modal opens → pick RKC retainer project + May 2026 → "Create & Open" → lands on `/social/plans/<id>`.
3. First-visit modal appears with 4 slides. Dismiss. Verify it doesn't re-open on reload.
4. Type strategy, add 6 posts inline with cover images. IG wall preview fills 3-col grid.
5. Click "Send for Review" → toast shows copyable URL.
6. Copy URL → open in incognito window → see `/portal/plans/[token]` review surface with strategy + IG wall + per-post actions.
7. Click "Approve Plan" → toast confirms, plan state flips to `approved`.
8. Back in staff Studio, plan card shows "Approved" state. Posts with future scheduled_at + IG account now `status='scheduled'`.
9. Log in as the RKC portal user, navigate to `/portal/content` — same plan view renders (the unified `PlanReviewCard`).

## When in doubt

The user is Peter (peter@huestudios.com), running Hue Studios. Camila is a real teammate at Hue who manages RKC's social retainer. The Figma reference is at https://www.figma.com/proto/TaHsRsGlQoOBmYSbxD85dN/RKC-MAY-SOCIAL — that's the visual target for what a "monthly plan" should feel like.

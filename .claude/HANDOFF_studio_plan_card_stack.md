# Handoff — Studio plan groups → collapsible flip-card stacks

## Why we're here

The marketing-IA reorg ([[HANDOFF_marketing_ia_reorg]]) just landed: Studio
is the canonical home for every social post, with sub-views for Approval /
Upcoming / Calendar / Inbox / Analytics folded in from the legacy `/social/*`
pages.

Inside the Approval sub-view, posts are grouped by their `content_plan`.
Each plan renders a header chip + a grid of post tiles (current code:
`app/components/apps/marketing/StudioSurface.vue` lines ~807–925, the
`v-for="bucket in postsByPlan"` block). For Hue today (4 plans, ~10
posts) this fits on one screen. For Camila's agency workflow — multiple
clients, several plans per client, 20+ posts per plan — Studio will
become a scrolling wall of identical tiles. The grouping signal is
already getting lost in the noise.

Goal: let the user collapse each plan group into a single stacked-deck
card preview that shows the top post, lets them flip through the rest
without leaving Studio, and provides a one-click route into the plan
detail page when they want to act on it.

## The recommended pattern

When collapsed, a plan group becomes:

```
┌─────────────────────────────────────┐
│  📅 May Retainer · Atlas Fintech    │ ← plan header chip (unchanged)
│  In Review · 12 posts               │
├─────────────────────────────────────┤
│                                     │
│         ╭───────────╮               │
│        ╭───────────╮│               │
│       ╭───────────╮││  ← stacked    │
│       │  [media]  │││     deck      │
│       │  caption  │││     (2-3       │
│       ╰───────────╯╯╯     peek)     │
│                                     │
│       ‹  1 / 12  ›                  │ ← arrow nav + counter
│                                     │
│       [ Open Plan → ]               │ ← CTA into /social/plans/[id]
└─────────────────────────────────────┘
```

The deck illusion comes from rendering two or three "back" copies behind
the front card, each with a small Y-offset (`translate-y-1`, `-2`) and
opacity drop. Front card shows the first post by `display_order` (or by
`scheduled_at` if order is unset). Arrow buttons cycle the front card;
counter shows position; "Open Plan" CTA navigates to the detail page.

When expanded, the existing grid renders as today. Toggle is a caret/
chevron button in the plan header next to the post count.

## Concrete next-session task list

1. **Collapse state + toggle** (≈15 min)
   - Add `useState<Record<string, boolean>>('studio-plan-collapsed', () => ({}))`
     keyed by plan id. Persist via the existing user-pref pattern
     (`directus_users.app_pref_*` — see [[reference_directus_user_pref_perm_gap]]
     for how to add a field). Cheaper alternative: localStorage with a
     `studio-plan-collapsed-v1` key. Pick localStorage for v1 — the
     state isn't valuable enough cross-device to justify a Directus
     round-trip.
   - In the plan header (`studio-group__header`) add a chevron button:
     collapsed → `lucide:chevron-right`, expanded → `lucide:chevron-down`.
     Click toggles the entry for this plan id.
   - Default state: **collapsed for plans in `approved` / `archived` state,
     expanded for everything in active workflow (`draft`, `in_review`,
     `requested_changes`).** Camila's working set should be eyes-on by
     default; finished or shelved plans collapse out of the way.

2. **Card stack rendering** (≈45 min)
   - New component: `app/components/apps/marketing/PlanCardStack.vue`.
     Props: `plan: ContentPlanRecord`, `posts: SocialPost[]`.
   - Internal `frontIndex` ref. Render three layered cards absolutely
     positioned (top: 0, transform offsets for the back two). Front
     card is `posts[frontIndex]`; back cards are
     `posts[(frontIndex + 1) % posts.length]` and `+ 2`. Skip back cards
     if `posts.length < 2`.
   - Card visual = the existing `.studio-card` markup (media + caption +
     state badge). Lift that into a sibling `StudioPostCard.vue` so both
     the existing grid and the new stack reuse it instead of duplicating
     the template. Pure visual extract — no logic move.
   - Arrow buttons + counter ("1 / 12") below the stack. Disable arrows
     when `posts.length === 1`.
   - Keyboard: when the stack has focus, ← and → cycle. `Enter` opens
     the per-post detail modal (same `openDetail(post)` the grid uses).

3. **Empty + single-post states** (≈10 min)
   - `posts.length === 0`: render the existing `studio-group__empty`
     NuxtLink (`No posts yet — add some inside the plan`).
   - `posts.length === 1`: render a single card, no stack, no arrows,
     counter just shows "1 post". Open Plan CTA still appears.

4. **"Open Plan" CTA** (≈5 min)
   - Below the stack, a single primary button: `NuxtLink :to="/social/plans/${plan.id}"`.
     Style: same as `UiActionButton variant="primary"` used in the hero.
   - Hide the CTA when there's no plan (the "Unattached posts" bucket
     stays as today's grid — there's nothing to open).

5. **Swipe gesture (mobile)** (≈30 min, optional v1 stretch)
   - Use `@vueuse/core`'s `useSwipe` on the stack container. Left swipe
     advances `frontIndex`, right swipe goes back. Animate the front
     card off-screen during the gesture (`transform: translateX()` +
     `opacity`).
   - Desktop drag deferred — keyboard arrows + buttons are enough.
     Note in the component docstring that the touch path is the only
     non-button entry point.

6. **A11y + polish** (≈15 min)
   - Stack container gets `role="region"` + `aria-label="Posts in {plan.title}"`.
   - Arrow buttons get `aria-label="Previous post" / "Next post"`.
   - `aria-live="polite"` on the counter so screen readers announce
     position changes when the user cycles.

Total estimate: **2 hrs** for steps 1-4 + 6, plus ~30 min if the touch
swipe ships in v1.

## Read first

- `MEMORY.md` entries:
  - `project_content_plans_unification.md` — Plans are the canonical primitive; Studio is plan-only.
  - `project_retainer_social_plan.md` — Studio's origin story; Camila is the target user.
  - `feedback_universal_button_hierarchy.md` — Use `<Button size="sm">` for the Open Plan CTA, not `UiActionButton`.
- Files to read:
  - `app/components/apps/marketing/StudioSurface.vue` lines ~697–926 — current plan group render + the `studio-group` / `studio-card` CSS.
  - `app/pages/social/plans/[id].vue` — the destination of the Open Plan CTA. Confirms the route exists and accepts deep links.
  - `app/components/Social/InstagramGridPreview.vue` — existing card-shaped layout pattern for inspiration on visual weight.

## Constraints to respect

- **No new top-level routes.** The IA reorg just killed `/social/*` as a parallel mini-app — don't reintroduce drill-out behavior. The Open Plan CTA links to `/social/plans/[id]` because that's a deep-link route, not an app shell route. Future work (Phase 2 of the IA reorg) makes that a slide-over panel too.
- **Don't fork the post-card markup.** Pull the existing `.studio-card` template into a shared `StudioPostCard.vue` first. Both the grid (when expanded) and the stack (when collapsed) consume it. Otherwise styling drifts.
- **Animations come from CSS, not JS libraries.** The transform/opacity offsets for the stack are static classes; the cycle animation is a `transition: transform 200ms` on the front card. Don't pull in a flip-card lib.
- **Counter is `N of M`, not just `N/M`** — accessibility tools read the latter as "n divided by m." Use a visible separator like `1 / 12` but pair it with a visually-hidden `1 of 12`.
- **Hue verify rule.** First-load on the user's Hue session should render: 4 plans, each collapsed unless `in_review`, each showing a peeking deck on top of the first scheduled post. Take a screenshot at desktop 1280x800 to compare against the current grid screenshot in this conversation.

## Open design questions (resolve with user before coding)

1. **Default-collapse rule.** Recommend collapsing finished plans (`approved`, `archived`) by default and expanding everything else. Alternative: collapse everything except the current-month plan. Pick one; the rule lives in `defaultCollapsedFor(plan)`.
2. **Cover post selection.** First by `display_order` if set, otherwise earliest `scheduled_at`. Should an explicitly featured post (e.g. `is_cover: true` field on `social_posts`) override that? Not in v1 — keep the selection rule deterministic from existing data.
3. **Empty stack at collapsed default.** A plan with zero posts that defaults to collapsed shouldn't show an empty deck. Either auto-expand it, or render a flat "No posts in this plan yet" card. Recommend auto-expand — zero-post plans are the exact case where the user needs the "add some" CTA visible.
4. **Where does the "approval state" pill go?** Today it's on the plan header chip. Should the *front card's* approval state also be visible in the collapsed view? Yes — it's the most useful signal at a glance. Render it as the existing `.studio-card__state` corner badge, no change.
5. **Should the Approval state-pill filter (the row above the stacks) apply inside collapsed groups?** I.e. if user filters to "In Review", a collapsed plan's stack should only cycle through `in_review` posts. Recommend yes — apply `stateFilter` to the stack's posts array. If the filter empties the plan entirely, collapse the group entirely (zero-height) rather than showing an empty card.

## Verification (live, on Hue, post-implementation)

1. `/apps/marketing?floor=studio` loads with 4 plans. Approved/archived plans default to collapsed; in-review plan(s) default to expanded.
2. Click the chevron on an expanded plan → grid animates away, card stack fades in. URL doesn't change; shell doesn't remount.
3. Click the right arrow → front card slides off, next post becomes front. Counter ticks from 1/12 to 2/12.
4. Press `←` with keyboard focus on the stack → counter ticks back to 1/12. Press `Enter` → per-post detail modal opens (same as clicking a grid tile).
5. Touch device: swipe left on the stack → counter advances. Swipe right → goes back.
6. Click "Open Plan" → navigates to `/social/plans/<id>` cleanly.
7. Reload the page → collapsed state persists per-plan via localStorage.
8. Apply state filter "In Review" → stacks now only cycle through in-review posts; plans with no matching posts hide entirely.

## When in doubt

- "Should the stack be 2D-flat or use perspective transforms?" → Flat. CSS `perspective` on stacked cards looks great on desktop and terrible on iPad Safari. Stick with `translate` + `scale` + opacity.
- "Should the user be able to reorder posts by dragging the front card?" → No. That's a `/social/plans/[id]` operation. Stack is read-only preview.
- "What if posts in a plan span multiple sub-views (some scheduled, some published)?" → Cycle through all of them in `display_order`. The state badge on each card communicates where each post is in the workflow.

User: Peter (peter@huestudios.com), Hue Studios. Camila is the agency social manager. The stack is for her: 5 clients × 2 plans/month × 15 posts each = a wall of 150 tiles she doesn't want to scroll. The stack collapses that to 10 deck cards she can flip through in seconds.

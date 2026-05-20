# Handoff — Marketing IA reorg: kill `/social/*` as a parallel mini-app

## Why we're here

The Apps Layout (Work / Marketing / Money / Organization) shipped as the
canonical shell — but the **Marketing app's Social floor is acting like a
launcher dashboard** that bounces users to standalone `/social/*` pages
(`/social/calendar`, `/social/compose`, `/social/inbox`, `/social/analytics`,
`/social/settings`, `/social/diagnostics`). Every drill-down navigates *out*
of the app shell. That breaks the "this is an app" promise on every click and
defeats the purpose of the Apps Layout.

Simultaneously, the just-shipped content-plans unification (see memory
[[project_content_plans_unification]]) made the Marketing app's **Studio floor**
the canonical home for every social post. The Social floor still renders a
post grid grouped by platform — that's now duplicate surface area on top of
duplicate routes.

Goal: make Marketing feel like an actual app — top-level floors, in-place
sub-views, slide-over drill-downs, **nothing leaves `/apps/marketing` for
day-to-day work.** `/social/*` becomes redirects.

## Read first

- `MEMORY.md` entries:
  - `project_apps_layout_plan.md` — INITIATIVE CLOSED 2026-05-09. Floors, AppRail, dock, slide-over composable foundation, hat deprecation. This reorg lives on top of it.
  - `project_slide_over_stack_v2.md` + `project_slide_over_stack_v2_1.md` — the panel-registry pattern. New panels (`SocialComposePanel`, `SocialAccountPanel`, `ContentPlanPanel`) plug into `AppsAppSlideOverStack` with the same iOS push/pop animation.
  - `feedback_ia_one_destination.md` — the IA principle being applied here. Every noun gets exactly one home.
  - `project_session26_ia_consolidation.md` — a worked example of similar consolidation (`/people` folded into `/contacts`, `/marketing-feed` folded into `/marketing`). Use the same redirect pattern.
  - `project_content_plans_unification.md` — the predecessor work. Studio is already plan-only.
- Files to skim:
  - `app/pages/apps/marketing/index.vue` — the floor host; floors array on line ~53, Social floor body lines ~578-704, template branches lower down.
  - `app/components/apps/marketing/StudioSurface.vue` — current Studio surface; we'll add sub-view branches inside this same component.
  - `app/pages/social/*` — the seven legacy pages to consume (`analytics.vue`, `calendar.vue`, `compose.vue`, `diagnostics.vue`, `inbox.vue`, `index.vue`, `settings.vue`).
  - `app/components/apps/AppsAppSlideOverStack.vue` + the panel registry (search `panelRegistry` to find it).

## The recommended IA

Two dimensions of nesting, never a navigate-away:

- **In-place sub-views** via `?view=` — different lens on the same data (`Approval` / `Upcoming` / `Calendar` / `Analytics`). Shell never remounts.
- **Slide-over panels** via `?slide=<panel>:<id>` — drill into a single object (one post, one account, the compose drawer).

### Floors after the reorg

| Floor       | Purpose                                                                                   | Sub-views (`&view=`)                                                         |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Pulse       | unchanged                                                                                  | —                                                                            |
| Campaigns   | unchanged                                                                                  | —                                                                            |
| Email       | unchanged                                                                                  | —                                                                            |
| **Accounts** *(renamed from Social)* | Channels grid + per-channel analytics + connection management + settings | `overview` (default) · `settings`                                            |
| **Studio**  | Every post. Production AND post-mortem.                                                   | `approval` (default) · `upcoming` · `calendar` · `inbox` · `analytics`       |
| Audience    | unchanged                                                                                  | —                                                                            |

### Slide-over panels (new)

- **`compose`** — folds `/social/compose` into a slide-over. Summonable from Studio header, AppRail dock (so it's reachable from any floor), and any URL via `?slide=compose`. This is the highest-leverage piece: ad-hoc post creation no longer pulls Camila out of whatever floor she's in.
- **`account:<id>`** — clicking an account in the Accounts grid opens the per-account detail (analytics, posts on this account, settings) as a slide-over.
- **`plan:<id>`** *(deferred to Phase 2)* — currently `/social/plans/[id]` is a standalone page. Eventually it should also be reachable as a slide-over from Studio, matching the client/contact pattern. Out of scope for this initiative; track as a follow-up.

## Concrete next-session task list (5 steps, do in order)

1. **Floor rename + post-grid removal** (≈10 min, lowest risk)
   - In `apps/marketing/index.vue`: rename floor key `social` → `accounts` (label `'Accounts'`, icon `lucide:radio` or keep `share-2`). Update `floors` array + the `if (floor.value === 'social')` branches.
   - Delete the post grid sections from the Social floor body (lines ~578-704 + the matching template branch). Keep the connected-accounts grid, the 4-stat strip, AI compose wizard wiring.
   - Drop the AI compose wizard from this floor — it gets the compose slide-over treatment in step 4.
   - Add a `view` ref (default `'overview'`) and a `<AppFloorStrip>` sub-strip inside the Accounts floor with `[overview, settings]`. Settings sub-view body is a placeholder until step 3.

2. **Studio sub-view tabs** (≈30 min)
   - In `StudioSurface.vue`, expand the existing `view` ref union: `'approval' | 'upcoming' | 'calendar' | 'inbox' | 'analytics'`.
   - Add the sub-view buttons to `studio-view-toggle`.
   - **Don't re-author** the bodies — import the existing `/social/calendar` `/social/inbox` `/social/analytics` page bodies as components. Move the script + template into `app/components/Social/CalendarSurface.vue` (etc.), strip the `definePageMeta` + `AppHeader` chrome, render the body inside Studio's view branch. The standalone pages then re-import the same component for backward compat (Phase 5 redirects them eventually).
   - Verify each sub-view loads its own data lazily (don't fetch all 5 on mount).

3. **Settings sub-view inside Accounts** (≈20 min)
   - Extract `/social/settings.vue` body into `app/components/Social/SettingsSurface.vue`. Mount it inside Accounts when `view === 'settings'`.
   - `/social/settings` route → thin wrapper that renders the same component (Phase 5 will redirect it).

4. **Compose slide-over panel** (≈45-60 min, most complex)
   - Extract `/social/compose.vue` body into `app/components/Social/ComposePanel.vue`. The page is big (~600 LOC); preserve all behavior: media picker, multi-platform target picker, AI generator, schedule picker, post-now flow.
   - Register `compose` in the slide-over panel registry. Panel emits `close` when navigating after submit.
   - Add `+ Compose` button to Studio header AND to the AppRail dock (right next to Search or Notifications). Per [[project_apps_layout_plan]] the dock is the right home for cross-app actions.
   - `/social/compose` route → wrapper that opens the slide-over on mount + a "Close" affordance to navigate back where they came from. Future: full redirect.

5. **Redirects** (≈10 min)
   - For each `/social/<page>` route, replace the page body with a `definePageMeta({ middleware: 'redirect-to-apps' })` or inline `navigateTo`. Map:
     - `/social` → `/apps/marketing?floor=studio`
     - `/social/calendar` → `/apps/marketing?floor=studio&view=calendar`
     - `/social/inbox` → `/apps/marketing?floor=studio&view=inbox`
     - `/social/analytics` → `/apps/marketing?floor=studio&view=analytics`
     - `/social/settings` → `/apps/marketing?floor=accounts&view=settings`
     - `/social/compose` → `/apps/marketing?floor=studio&slide=compose`
     - `/social/diagnostics` → keep as standalone (dev tool, low traffic, deep-linked)
     - `/social/plans/[id]` — leave alone (still a standalone deep-link, gets slide-over treatment in Phase 2)
   - Follow the redirect pattern from [[project_session26_ia_consolidation]] so external bookmarks don't break.

## Constraints to respect

- **Don't fork the data layer.** Sub-views call the same `/api/social/*` endpoints the standalone pages used. Same composables (`useSocialAccounts`, etc.). The reorg is structural, not a rewrite.
- **The dock is global.** A `+ Compose` button in the AppRail dock fires the slide-over from any app (not just Marketing). Confirm with the rail dock pattern — `app/components/apps/AppsDock.vue` or similar.
- **Slide-over registry is centralized.** Don't roll a new modal pattern. New panels register in the same place as `client_detail`, `contact`, `project_detail`, `proposal`, etc.
- **No data migration needed.** This is pure IA/structural work. Nothing in Directus changes.
- **Backward compat on URLs.** Step 5 redirects must work for both clicked links and email/Slack-shared bookmarks. Test at least three: `/social`, `/social/calendar`, `/social/compose?account=X` (the compose page accepts query params for pre-fill — make sure the redirect carries them through to the slide-over).

## Open design questions (resolve with user before coding)

1. **Floor label**: `Accounts` vs `Channels` vs keep `Social` (rename only the *internal* role)? Recommend `Accounts` — clearest noun for what lives there. But "Social" is the user's mental model already.
2. **Compose button placement**: dock only, Studio header only, or both? Recommend both — Studio is the natural home but the dock makes it cross-app.
3. **`+ Compose` icon**: `lucide:plus-square`, `lucide:pen-line`, `lucide:send`? Pick one and use consistently.
4. **AI wizard placement**: today it lives on the Social floor as an inline modal. After reorg: lives inside the Compose slide-over (one place), or stays as a separate "AI Draft" button in Studio header? Recommend inside Compose — fewer surfaces.

## Verification (live, on Hue, post-implementation)

End-to-end on Hue:
1. `/apps/marketing` → all six floors render including renamed Accounts; Studio is default.
2. Click Studio → see sub-view toggle with 5 lenses. Click each — data loads, URL updates, shell doesn't remount, no flash of empty state.
3. Click Accounts → see channels grid + sub-view toggle with overview/settings. Settings sub-view shows the same controls the standalone /social/settings did.
4. Click `+ Compose` in Studio header → slide-over opens with full compose form. Pick a platform + caption + schedule, save as draft → toast confirms, slide-over closes, post appears in the appropriate Inbox plan in Studio (auto-attach from previous initiative).
5. Click `+ Compose` from the AppRail dock while on the Work app → same slide-over opens, behavior identical.
6. Hit `/social/calendar` directly → redirect to `/apps/marketing?floor=studio&view=calendar` lands cleanly.
7. Hit `/social/compose?prefill=foo` → redirects to `/apps/marketing?floor=studio&slide=compose` with the prefill query preserved and applied inside the panel.

## When in doubt

- "Should this be a sub-view or a slide-over?" → sub-view if it's a *different lens on the same dataset*; slide-over if it's a *detail on one object* or a *focused action*.
- "Should I refactor the legacy page body or rewrite?" → refactor. Extract into a component, render in both the legacy route (for now) and the new sub-view. Step 5 deletes the legacy route.
- "What if a standalone page has deep links inside it (e.g., `/social/inbox/conversation/[id]`)?" → those become `?slide=inbox_conversation:<id>` on the Studio inbox sub-view. Same registry pattern.

User: Peter (peter@huestudios.com), Hue Studios. Camila is the agency social manager whose workflow this reorg is for. The Studio + plan flow she'll learn first; this reorg is what makes that flow stop feeling like islands.

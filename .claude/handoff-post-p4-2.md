# Composition Canvas — Post-P4.2 follow-on (kickoff prompt)

> P4.2 (mailing-list-based email targeting / Item B) SHIPPED 2026-05-26 (`8aed884`
> on main). The Composition Canvas's email composer can now actually deliver
> end-to-end on canvas-created one-off emails — see [[project_composition_canvas_redesign]]
> for the load-bearing surprise that bit P4.2.
>
> **Three items remain** from the original post-P3.6 follow-on plan:
> - **Item A** — Per-segment email variants (B was its prereq; now unblocked)
> - **Item C** — Tiptap rich-text email body
> - **Item D** — z=0 lens-grid view
>
> Working tree should be clean going in.

## Status going in

- **P1 (river timeline)** SHIPPED `64590b8`
- **P2 (master-variant composer for social)** SHIPPED `4d6abf1`
- **P3.0–P3.5** SHIPPED `ec476aa`/`eeb02c8`/`a4e7671`/`6bde523`/`247c947`/`b69ff66`
- **P3.6 (Studio segmented control → hero LensChip)** SHIPPED `58fc5a1`
- **P4.2 (mailing-list-based email targeting)** SHIPPED `8aed884`

All three remaining items are pure additive — none should touch the URL
contract or break P3 invariants (CompositionCanvas wraps every lens; `?view=`
source-of-truth; deep-link `?z=3&id=<…>` mounts composer).

## Read these first (regardless of which item you pick)

- `project_composition_canvas_redesign` memory — full P1–P4.2 ship logs + "Five
  liquid principles" + "What to cut" + the P4.2 load-bearing surprise.
- `feedback_ios_native_strategy` memory — single-spring policy + seven primitives.
- `feedback_motion_stack_policy` memory — compositor-only inline transform; reserve
  GSAP for gestural paths; no Vue Transition / no RAF-dependent CSS class swaps.
- `feedback_zod_silent_drop` memory — Zod PATCH schemas drop unknown fields. Any
  new column you add server-side must land in create AND update schemas.
- `app/composables/useComposition.ts` — polymorphic Composition view-model
  (discriminated by `kind: 'social' | 'email'`). Source of truth for read/write
  shape.
- `app/components/Social/CompositionCanvas.vue` — canvas host. Kind-dispatch in
  `loadActive` swaps EmailLiftedCard/EmailComposer vs LiftedCard/CompositionComposer.
- `app/components/Social/EmailComposer.vue` — post-P4.2 it has the tabbed
  Recipients picker; per-segment variants (Item A) will replace its single body
  textarea with a per-target chip row.
- `shared/composition.ts` — Composition / CompositionTarget / CompositionResults
  types and `statusFromSocial`/`statusFromTouch` mappers.

## Sequencing recommendation

If you're tackling more than one item this session, do them in this order:

1. **Item A** — now the prereq (B) is shipped, A is the natural next step. The
   tabbed Recipients picker from P4.2 is the lane axis variants will hang off.
2. **Item C** — independent of A and the lowest-risk email item; ship it
   standalone if you only have appetite for one. Won't conflict with A in code.
3. **Item D** — independent of email work, pure delight, re-enters the depth-zoom
   mechanic from P3.1.

The lazy default is A → C → D since that's the closing arc of the email
ergonomics bucket plus the delight cherry on top. If in doubt, ask.

---

# Item A — Per-segment email variants

## Context

`EmailComposition.variants` is declared null in 3.3+ — the type exists on the
shared model but no plumbing reads or writes it. The social side (P2,
`4d6abf1`) is the pattern to clone:

- `social_posts.caption_variants` JSON (nullable, `Partial<Record<SocialPlatform, string>>`)
- Server-side normalizer collapses in-sync variants (variant equal to master → drop)
- `MasterVariantComposer.vue` per-platform chip row: Master + chip per selected platform
- In-sync chips wear gold filament; forked switch to channel-hue ribbon + `lucide:git-branch`
- "Resync to master" link in forked lanes deletes the variant
- Per-platform `SocialPostPreview` reads `variants[platform] ?? caption`

**Now that B has shipped**, an email touch's recipients are picked via the
tabbed Recipients picker (Mailing list | Audience segment), with single-target
v1. That means in v1, A's "variant lane axis" is functionally just *master vs
nothing else* — there's only ever one target to fork against. **Item A only
makes practical sense once multi-target is also in.**

So the load-bearing question is: should Item A scope grow to include
multi-target, or stay narrow on variants and document that they only become
useful post-multi-target?

## UX question to resolve first

**Option 1 — Variant lanes WITHOUT multi-target (narrow).**
Plumb `body_variants` end-to-end, render the lane chip row even with a single
target so the affordance exists, but warn that variants only matter when a
touch targets more than one list/segment. UI is mostly future-proofing.
Smallest scope, but the value lands only when multi-target follows.

**Option 2 — Multi-target FIRST, then variants on top.**
First widen the Recipients picker to a tagger (multi-list-and-segment-mix per
touch), then add `body_variants`. Doubles the scope but the per-segment
variant axis becomes immediately useful.

**Option 3 — Defer A indefinitely; ship C + D first.**
Concede that per-segment variants on email aren't urgent enough yet. Park A
until multi-target email becomes a real ask from a real customer.

**Recommendation:** **Option 2**. Half-shipping (Option 1) builds infrastructure
that doesn't help anyone. Option 3 is reasonable but leaves the closing arc of
the email ergonomics bucket open without a clear retirement. Multi-target is a
delivery problem — needs send-time dedupe, per-target send tracking,
partial-failure handling — but the P4.2 send-path (with its single-list
resolution) is well-positioned to extend.

## What ships (assuming Option 2)

### A.1 Multi-target Recipients

1. **Schema:** new `marketing_touch_targets` junction table (touch_id m2o,
   target_kind enum ('mailing_list'|'audience_segment'), mailing_list m2o
   nullable, audience_filter string nullable). One row per target on a touch.
   Keep `marketing_touches.mailing_list` + `audience_filter` for back-compat
   (auto-mirror the first target on write for one release).
2. **Server:** POST + PATCH Zod schemas accept `targets: Array<{kind, list_id?, filter?}>`.
   Validate cross-org on every list_id in the array. Mirror create→update.
3. **Send path:** `resolveAudience` reads from junction first (union of contacts
   across all targets, deduped by contact email at the recipient level).
   Falls back to the single-FK path for unmigrated rows. The single-list path
   from P4.2 becomes a special case of the general resolver.
4. **UI:** swap the segmented-control tab picker for a tagger. Each "chip" in
   the row is one target; "+ Add list" / "+ Add segment" opens the same
   typeahead/radio from P4.2 but additively.

### A.2 Per-target variants

1. **Schema:** new `marketing_touches.body_variants` JSON column, nullable,
   `Partial<Record<string, { subject?: string; body_markdown: string }>>` keyed
   by the target's stable id (`list:<int>` or `segment:<filter>`). Subject is
   also variant-able since per-segment subject lines are a real ergonomic win.
   Mirror P2's `caption_variants` normalization (variant equal to master →
   drop).
2. **Server:** add `body_variants` to create + PATCH Zod schemas. Normalizer
   collapses lane keys whose body+subject match effective-master. Send-path
   reads `body_variants[target_key] ?? body_markdown` when fanning out per
   target.
3. **UI:** new `EmailMasterVariantComposer.vue` (sibling of
   `MasterVariantComposer.vue`). Per-target chip row: Master + one chip per
   target in `comp.targets[]`. Lane state transitions (insync → forked →
   resync), per-lane subject + body inputs. Reuse the gold-filament-vs-channel-hue
   chip styling so the visual language is shared with social.
4. **Composer integration:** swap `EmailComposer.vue`'s single subject/body
   inputs for `EmailMasterVariantComposer`. Save handler normalizes variants
   against effective-master before sending to `useComposition().update`.

## What this does NOT do

- ❌ Per-lane CTA, per-lane scheduled_at (subject + body only; CTAs are global).
- ❌ Multi-language variants (the lane axis is target, not locale).
- ❌ Refactor `MasterVariantComposer` to share code with the email variant
  (intentional — "one form, two configs" warning from P3.3 still applies; ship
  as a sibling).
- ❌ Send-time tracking per target (delivery analytics stays per-touch in v1).

## Implementation plan

1. Confirm Option 1/2/3 with user (the load-bearing question is real).
2. If Option 2: A.1 (multi-target) lands first as its own commit. Migration
   script for `marketing_touch_targets` junction + back-compat mirror.
3. Server: schemas + cross-org checks + send-path generalization.
4. UI: tagger replacing segmented control. Live-verify multi-target send path
   resolves union of recipients, deduped.
5. A.2 (variants): `body_variants` column + `EmailMasterVariantComposer.vue` +
   send-path read.
6. Memory + commit `feat(marketing): multi-target + per-segment email variants
   (composition canvas P4.1)`. (Numbered 4.1 because A logically precedes B in
   the original handoff letter order — this is purely cosmetic but keeps the
   memory readable.)

## Done criteria

- ✅ Multi-target touches deliver: send-path resolves union of recipients across
  targets, deduped.
- ✅ Variant lane forks/resyncs visually in the composer (matches social UX).
- ✅ Round-trip preserves variants and collapses in-sync lanes server-side.
- ✅ Send path reads variant for each target's actual delivery.
- ✅ No regression on single-target touches (lane row hides when `targets.length <= 1`).
- ✅ Back-compat: pre-junction touches keep reading from `mailing_list`/`audience_filter`.

---

# Item C — Tiptap rich-text email body

## Context

`EmailComposer.vue` still uses `UTextarea` for the body, storing markdown in
`marketing_touches.email_body_markdown`. The send path compiles markdown →
MJML → inlined HTML (see `server/utils/mjml-compiler.ts` and
`server/utils/email-shell.ts`). FormTiptap already exists in this repo (used in
InvoiceWorkspace per the invoicing-overhaul project memory) — reuse it.

## UX question to resolve first

**Storage format: keep markdown, or switch to HTML?**

- **Markdown (Tiptap-Markdown extension):** preserves the existing column;
  Tiptap round-trips through markdown on save. Risk: complex formatting can
  lose structure on the markdown round-trip (tables, alignment, inline styles).
- **HTML:** add `email_body_html` TEXT column alongside the markdown one;
  deprecate markdown over time with a one-time migration. Most faithful to
  what the user composed; cleanest long-term.

**Recommendation:** HTML storage. Markdown was a convenience for the
plain-textarea era; once Tiptap is in, HTML is the natural storage. One-time
migration: `markdown → HTML` for existing rows (use `marked` or similar; one
script under `scripts/`).

## What ships

1. **Schema:** add `marketing_touches.email_body_html` TEXT column. Keep
   `email_body_markdown` for one release as a fallback read source; delete in
   the next phase.
2. **Migration script:** `scripts/migrate-email-body-markdown-to-html.ts` —
   reads each touch, converts `email_body_markdown` → HTML via `marked` or
   similar, writes to `email_body_html`. Idempotent (skip rows already
   populated). Dry-run by default; `--apply` flag commits.
3. **Server:** create + PATCH Zod schemas accept `email_body_html` (per
   [[feedback_zod_silent_drop]]). Send path reads `email_body_html ?? markdownToHtml(email_body_markdown)`.
4. **UI:** `EmailComposer.vue` swaps `UTextarea` for `FormTiptap` (find the
   exact import path in InvoiceWorkspace.vue). Bind to a local `bodyHtml` ref;
   save through `useComposition().update` writes `email_body_html`.
5. **Toolbar policy:** start lean — bold/italic/links/lists/headings only. No
   images-in-body for v1 (email image handling has CID/CDN complexity not worth
   solving until needed). No tables (Tiptap tables look great in editor and
   break in Gmail/Outlook).

## What this does NOT do

- ❌ Drop the markdown column (next phase).
- ❌ Image insertion in the email body (separate scope).
- ❌ MJML block insertion via Tiptap nodes (would be elegant but big scope).
- ❌ Per-org default styling — body inherits the existing email-shell chrome.

## Implementation plan

1. Confirm UX option (markdown vs HTML storage — recommend HTML).
2. Migration script + dry-run on prod data; review diff; apply.
3. Add column to Directus + Zod schemas + send-path read.
4. Swap UTextarea → FormTiptap in EmailComposer.
5. Live-verify: edit existing touch's body in Tiptap, save, GET round-trips,
   send rendered email to a test inbox via `/api/email/test-send` or the touch
   send endpoint.
6. Memory + commit `feat(marketing): tiptap rich-text email body (composition canvas P4.3)`.

## Done criteria

- ✅ Existing touches render in Tiptap with their content preserved.
- ✅ Edits round-trip cleanly through create + PATCH.
- ✅ Sent email matches Tiptap WYSIWYG (allowing for Gmail/Outlook quirks).
- ✅ Toolbar is intentionally lean — no surprises hidden behind menus.

---

# Item D — z=0 lens-grid view

## Context

P3.0 originally deferred z=0 indefinitely ("year/quarter heat-map is a future
lens, not P3 scope"). P3.6 explicitly preserved Option A (z=0 lens-grid) as a
"future delight" when the LensChip ate the lens-switching job. This item ships
that delight: reclaim z=0 as a 5-thumbnail lens grid; pinch-out from z=1
reveals it; click a thumbnail drops back to z=1 with that lens active.

## UX question to resolve first

**Does the LensChip stay alongside z=0, or retire when z=0 ships?**

- **Stay:** LensChip is the keyboard-friendly desktop affordance; z=0 is the
  gesture delight for trackpad/touch users. Redundant but with different
  ergonomic strengths.
- **Retire:** simplification — one lens-switching mechanism, lean into depth as
  the canonical model. Cost: no desktop affordance without learning the pinch
  gesture (or Cmd+- when at z=1).

**Recommendation:** keep both. LensChip stays; z=0 is the additional delight.
Same pattern as macOS having both a Dock and Spotlight — different ergonomic
strengths, both legitimate.

Second UX question: **thumbnails — static or live mini-renders?**

- **Static** (icon + label, like the LensChip's popover options): trivial, ships
  fast, conveys the right idea.
- **Live mini-render** (actual mini-river, mini-approval grid, etc.): visually
  stunning but expensive — each lens has its own data fetches and renderers.

**Recommendation:** static in v1. Live mini-render is a polish-on-polish item.

## What ships

1. **`useCompositionZoom.ts`:** drop `Z_MIN` from 1 to 0. URL serialization:
   z=0 drops the param same as z=1 today (or pick a canonical default and
   drop *only* that — needs a small decision). All clamping math + integer
   snap-on-release continues to work.
2. **`CompositionCanvas.vue`:** new z=0 surface layer. Renders a 5-thumbnail
   grid centered in the viewport; clicking a thumbnail calls
   `zoom.setLens(key)` + `zoom.setZ(1)` in one beat. Visual transitions: as
   z drops from 1 → 0, the lens surface fades opacity 1→0 + scales 1→1.2
   (zoom-OUT continues the depth metaphor — the user is "rising above" the
   lens). The z=0 grid fades 0→1 + scales 0.96→1 across z=0.4→0.
3. **Gesture wiring:** existing wheel+ctrlKey / pinch / Cmd+- paths continue to
   ramp z; they just have one more integer to land on. Two-finger swipe-up on
   trackpad at z=1 is natural; verify it produces the same wheel event sequence.
4. **Desktop affordance (non-gesture):** when at z=1, an "Overview" icon at the
   top-right of the canvas (lucide:layout-grid?) ramps to z=0 on click. Hides
   at z=0. Keyboard: ESC at z=0 returns to the previously active lens at z=1.

## What this does NOT do

- ❌ Retire the LensChip.
- ❌ Live mini-render thumbnails.
- ❌ z=0 for any non-Studio canvas surface (the canvas is currently Studio-only).
- ❌ Year/quarter heat-map (the original "future lens" — still future).

## Implementation plan

1. Confirm both UX questions with user.
2. `useCompositionZoom.ts`: Z_MIN drop + URL drop-canonical decision.
3. New z=0 thumbnail-grid surface inside CompositionCanvas (component or inline).
4. Compositor transforms for the z=1↔z=0 transition.
5. Desktop "Overview" icon + ESC keyboard binding.
6. Live-verify: trackpad pinch-out from z=1 lands at z=0; thumbnail clicks
   land back at z=1 with right lens; ESC returns; URL respects z=0 drop policy;
   no regression on z=1→z=2→z=3 path or `?z=3&id=…` deep-links.
7. Memory + commit `feat(social): z=0 lens-grid view (composition canvas P4.4)`.

## Done criteria

- ✅ Pinch-out from z=1 (or Cmd+-) lands at z=0; grid of 5 thumbnails visible.
- ✅ Clicking a thumbnail returns to z=1 with that lens active.
- ✅ LensChip in the Studio hero continues to work (no regression).
- ✅ `?z=3&id=<…>` deep-links continue to mount composer (no regression).
- ✅ ESC at z=0 returns to previously active lens at z=1.

---

# Shared constraints (apply to all items)

- **One spring policy** — `cubic-bezier(0.36, 0.66, 0.04, 1) @ 400ms` for any
  motion. Don't roll a second curve. (Per [[feedback_ios_native_strategy]].)
- **Compositor-only motion** — transform / opacity only. No Vue Transition class
  swaps for canvas state. (Per [[feedback_motion_stack_policy]].)
- **`?view=` URL contract preserved** — bidirectional watchers in StudioSurface
  stay intact. None of these items should touch the lens-switching axis (D
  extends z but not view).
- **Zod symmetry** — anything you add to a create schema lands in the matching
  PATCH schema too. (Per [[feedback_zod_silent_drop]].)
- **No auth-bypass scratch endpoints** — use real signed-in sessions for verify.
  (Per [[feedback_no_auth_bypass_no_replay_mutations]].)
- **No new auth gaps** — every new endpoint uses `requireOrgMembership` and
  org-scopes its queries. Cross-org bleed has bit us multiple times this year.
- **No deep-nested field walks on junction tables** — the server token's
  policy on collections like `mailing_list_contacts` rejects expansions like
  `contact_id.organizations.organizations_id`. Split into two queries when
  possible (P4.2 pattern: junction → id list → loadEligibleContacts).

## Demo session details

- User: `demo@earnest.guru` (via `POST /api/auth/demo-login`)
- Org: `40c4d2e5-79d2-4008-9a97-9c14f94dfd0e` (Earnest Demo — Solo)
- Demo mailing list seeded for P4.2: `id=10`, name "Composition Canvas test list"
  with 2 subscribed contacts. Reuse for Item A multi-target tests (add a second
  list as needed).
- Demo org has scattered social posts + email touches across May. Reuse for
  end-to-end verifies — create one new test row per item, edit it, send/save,
  GET round-trip, delete to clean up.

## When you're stuck

- **Variant collapse logic looks off (Item A):** mirror the existing
  `normalizeVariantsForRead` / effective-master pattern in
  `server/utils/social-directus.ts` — don't re-derive the algorithm from
  scratch. The exact-equality comparison is per-field (subject AND body must
  both match master to collapse the lane).
- **Multi-target send fanout looks slow (Item A):** the P4.2 send path is a
  serial for-loop over recipients. For multi-target it'll be even slower
  (union of all targets). That's fine for v1 — the worker is bounded at 100
  touches/cron tick and each touch hits SendGrid serially anyway. If it
  becomes a problem, parallelize within a touch.
- **Tiptap markdown round-trip loses formatting (Item C):** that's why the
  recommendation is HTML storage. If user picks markdown, accept the
  limitation and document which constructs round-trip cleanly (bold/italic/
  lists/headings yes; tables/alignment/inline styles maybe not).
- **z=0 hydration mismatch (Item D):** the same SSR/CSR `z` race that hit
  P3.1–P3.3 will resurface if Z_MIN changes and the SSR-init isn't kept in
  sync. P3.3's fix lives in `useCompositionZoom.ts` — touch carefully.
- **Compose/Lens chooser popovers don't open in headless verify:** known —
  Reka-UI's PopoverTrigger requires trusted events. Verify the structure
  (`data-state="closed"` + `aria-haspopup="dialog"`); real-user clicks work.
  See the P3.4 + P3.5 + P3.6 ship logs.

## Carry-over items (still un-exercised across P3 + P4)

- 6× CPU throttle smoke test on depth-zoom transitions — un-run since P3.1.
- Two-pointer pinch on a real touchscreen — un-exercised since P3.1.
- Hydration mismatch on `.composition-canvas__surface` — partial fix in P3.3
  SSR-init; cosmetic-only, no UX impact. Re-verify after any of these items.
- `RiverSurface` email leaf tooltip showing list name (P4.2 deferred — timeline
  GET still bare-int). Low-priority polish.

## When the broader follow-on is done

The Composition Canvas initiative fully closes once at least Items A + C ship.
Item D (z=0 lens-grid) is true delight territory — a "nice to have" that
extends the depth metaphor end-to-end but isn't blocking anything.

After A + C: the next initiative-shaped opportunity is either:

- **Cross-channel touch composer** (the "campaign moment" the P3.4 handoff
  punted on — author one piece that fans out to social + email together via a
  synthetic shared campaign + content_plan).
- **Block library bottom dock** (item #5 from the original recommended order
  — would replace BlockBuilder's left sidebar with a Mac-Dock-style live-tile
  picker; high visual payoff, scoped to BlockBuilder).
- **Portal canvas rollout** (currently canvas is staff-only; surfacing
  approval lenses to portal users would unify the two-audience review flow).
- **Marketing send-path arming** — `MARKETING_SEND_DRY_RUN=false` + the
  vercel.json cron entry. Currently sends are gated to dry-run; flipping the
  switch makes mailing-list-targeted touches actually deliver. Needs SendGrid
  `from` auth verification + a careful first-touch dry-run review.

Each is its own initiative, not a P4 phase.

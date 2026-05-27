# Composition Canvas — Post-P4.1b follow-on (kickoff prompt)

> Item A (multi-target + per-target body variants) SHIPPED 2026-05-27.
> - **P4.1** (`78f50f9`) — `marketing_touch_targets` junction, tagger UI, send-path union+dedupe.
> - **P4.1b** (`e5a4020`) — `marketing_touches.body_variants` JSON, normalizer, tri-layer send precedence, disclosure UI.
>
> See [[project_composition_canvas_redesign]] for full ship logs.
>
> **Two items remain** from the original post-P3.6 follow-on plan:
> - **Item C** — Tiptap rich-text email body
> - **Item D** — z=0 lens-grid view
>
> Both are independent of each other and of Item A. The Composition Canvas
> initiative reaches "fully closed" once at least Item C lands; Item D is
> true-delight territory and doesn't block anything.
>
> Working tree should be clean going in.

## Status going in

- **P1 (river timeline)** SHIPPED `64590b8`
- **P2 (master-variant composer for social)** SHIPPED `4d6abf1`
- **P3.0–P3.5** SHIPPED `ec476aa`/`eeb02c8`/`a4e7671`/`6bde523`/`247c947`/`b69ff66`
- **P3.6 (Studio segmented control → hero LensChip)** SHIPPED `58fc5a1`
- **P4.2 (mailing-list-based email targeting)** SHIPPED `8aed884`
- **P4.1 (multi-target email recipients)** SHIPPED `78f50f9`
- **P4.1b (per-target body+subject variants)** SHIPPED `e5a4020`

Both remaining items are pure additive — neither should touch the URL
contract or break P3 invariants (CompositionCanvas wraps every lens;
`?view=` source-of-truth; deep-link `?z=3&id=<…>` mounts composer).

## Sequencing recommendation

The lazy default is **C → D** since C closes the email ergonomics bucket
and D is delight on top of that. But the items don't depend on each
other — pick C alone, D alone, or both. If only one is in scope this
session, **ship C** — it's the bigger user-facing win and what an
outside observer would call "the obvious gap."

If in doubt, ask before starting code.

## Read these first (regardless of which item you pick)

- `project_composition_canvas_redesign` memory — full P1–P4.1b ship logs +
  "Five liquid principles" + "What to cut" + the P4.2 load-bearing
  surprise + the P4.1 + P4.1b sections at the bottom.
- `feedback_ios_native_strategy` memory — single-spring policy + seven
  primitives.
- `feedback_motion_stack_policy` memory — compositor-only inline
  transform; reserve GSAP for gestural paths; no Vue Transition / no
  RAF-dependent CSS class swaps.
- `feedback_zod_silent_drop` memory — Zod PATCH schemas drop unknown
  fields. Any new column you add server-side must land in create AND
  update schemas.

## Item-specific files

- **Item C** — `app/components/Social/EmailComposer.vue` (the `UTextarea`
  body input you'll swap out); `server/utils/marketing-send.ts` (the
  `mdToHtml` shim you may not need post-Tiptap); `server/utils/email-shell.ts`
  (the shell that wraps the body HTML — leave alone, just feed it cleaner
  HTML); `server/utils/mjml-compiler.ts` (separate path used by
  newsletters — not the touch send-path).
- **Item D** — `app/composables/useCompositionZoom.ts` (URL serialization +
  clamping math; the load-bearing piece); `app/components/Social/CompositionCanvas.vue`
  (canvas host, lens-switching layer); `app/components/Social/LensChip.vue`
  (the desktop affordance to keep alongside z=0, per recommendation).

---

# Item C — Tiptap rich-text email body

## Context

`EmailComposer.vue` still uses `UTextarea` for the body, storing
markdown in `marketing_touches.email_body_markdown`. The send path
compiles markdown → plain HTML via the simple-paragraph-and-list shim
in `server/utils/marketing-send.ts` (`mdToHtml`). The branded email
shell (`server/utils/email-shell.ts`) is the canonical chrome wrapper
and works on any HTML you feed it.

FormTiptap already exists in this repo (used in InvoiceWorkspace per
the invoicing-overhaul project memory). Reuse it.

P4.1b added per-target `body_variants` with `body_markdown` lane fields.
If you switch storage to HTML (recommended below), those lane fields
also need to migrate to `body_html` (or stay markdown but with the
Tiptap-Markdown extension). Either way the variant shape needs a
consistent decision — the master and the lanes must share storage
format.

## UX question to resolve first

**Storage format: keep markdown, or switch to HTML?**

- **Markdown (Tiptap-Markdown extension)**: preserves the existing
  column shape; Tiptap round-trips through markdown on save. Risk:
  complex formatting can lose structure on the markdown round-trip
  (tables, alignment, inline styles). Variants stay
  `{ subject?, body_markdown }`.
- **HTML**: add `email_body_html` TEXT column alongside the markdown one;
  deprecate markdown over time with a one-time migration. Most faithful
  to what the user composed; cleanest long-term. Variants migrate to
  `{ subject?, body_html }` — needs a Zod schema rev + normalizer
  update on top of Tiptap.

**Recommendation:** **HTML storage.** Markdown was a convenience for
the plain-textarea era; once Tiptap is in, HTML is the natural storage.
The migration adds scope but keeps the variant shape coherent.

## What ships (assuming HTML)

1. **Schema:** add `marketing_touches.email_body_html` TEXT column.
   Keep `email_body_markdown` for one release as a fallback read source
   (delete in a follow-up phase).
2. **Variants:** rename `body_markdown` → `body_html` inside
   `EmailBodyVariant` (or add `body_html` alongside `body_markdown` and
   prefer HTML at read time). Update `normalizeBodyVariants` in
   `shared/composition.ts` to compare on the same field as master.
3. **Migration script:** `scripts/migrate-email-body-markdown-to-html.ts` —
   reads each touch + each `body_variants` lane, converts markdown → HTML
   via `marked` or similar, writes to `email_body_html` /
   `body_variants[*].body_html`. Idempotent (skip rows already populated).
   Dry-run by default; `--apply` flag commits.
4. **Server:** create + PATCH Zod schemas accept `email_body_html` +
   the new lane shape (per [[feedback_zod_silent_drop]]). Send path
   reads `email_body_html ?? markdownToHtml(email_body_markdown)`.
   `mdToHtml` shim in `server/utils/marketing-send.ts` becomes the
   markdown-fallback path only.
5. **Composable:** `useComposition.ts` adapter passes through the new
   field on read + write; `EmailComposition.body` becomes the HTML
   string (rename to `body_html` if you want — touches the canvas's
   ambient-preview pass).
6. **UI:** `EmailComposer.vue` swaps `UTextarea` for `FormTiptap` (find
   the exact import path in `InvoiceWorkspace.vue`). Bind to a local
   `bodyHtml` ref; save handler routes the HTML through
   `useComposition().update`. The per-target variant disclosure (P4.1b)
   reuses the same Tiptap surface for each lane editor.
7. **Toolbar policy:** start lean — bold/italic/links/lists/headings
   only. No images-in-body for v1 (email image handling has CID/CDN
   complexity not worth solving until needed). No tables (Tiptap tables
   look great in editor and break in Gmail/Outlook).

## What this does NOT do

- ❌ Drop the markdown column (next phase).
- ❌ Image insertion in the email body (separate scope).
- ❌ MJML block insertion via Tiptap nodes (would be elegant but big
  scope).
- ❌ Per-org default styling — body inherits the existing email-shell
  chrome.
- ❌ Touch the newsletter MJML compiler (`server/utils/mjml-compiler.ts`)
  — that's a separate audience path.

## Implementation plan

1. Confirm UX option (markdown vs HTML storage — recommend HTML).
2. Migration script + dry-run on prod data; review diff; apply.
3. Add column to Directus + Zod schemas + send-path read.
4. Swap UTextarea → FormTiptap in EmailComposer (both master + variant
   lane editors).
5. Live-verify: edit existing touch's body in Tiptap, save, GET
   round-trips, send rendered email to a test inbox via
   `/api/email/test-send` or the touch send endpoint.
6. Memory + commit `feat(marketing): tiptap rich-text email body (composition canvas P4.3)`.

## Done criteria

- ✅ Existing touches render in Tiptap with their content preserved.
- ✅ Edits round-trip cleanly through create + PATCH.
- ✅ Sent email matches Tiptap WYSIWYG (allowing for Gmail/Outlook quirks).
- ✅ Toolbar is intentionally lean — no surprises hidden behind menus.
- ✅ Per-target variant lane editors share the Tiptap surface (no
  divergence between master and lane editing).

---

# Item D — z=0 lens-grid view

## Context

P3.0 originally deferred z=0 indefinitely ("year/quarter heat-map is a
future lens, not P3 scope"). P3.6 explicitly preserved Option A (z=0
lens-grid) as a "future delight" when the LensChip ate the
lens-switching job. This item ships that delight: reclaim z=0 as a
5-thumbnail lens grid; pinch-out from z=1 reveals it; click a thumbnail
drops back to z=1 with that lens active.

## UX question to resolve first

**Does the LensChip stay alongside z=0, or retire when z=0 ships?**

- **Stay:** LensChip is the keyboard-friendly desktop affordance; z=0
  is the gesture delight for trackpad/touch users. Redundant but with
  different ergonomic strengths.
- **Retire:** simplification — one lens-switching mechanism, lean into
  depth as the canonical model. Cost: no desktop affordance without
  learning the pinch gesture (or Cmd+- when at z=1).

**Recommendation:** **keep both.** LensChip stays; z=0 is the
additional delight. Same pattern as macOS having both a Dock and
Spotlight — different ergonomic strengths, both legitimate.

Second UX question: **thumbnails — static or live mini-renders?**

- **Static** (icon + label, like the LensChip's popover options):
  trivial, ships fast, conveys the right idea.
- **Live mini-render** (actual mini-river, mini-approval grid, etc.):
  visually stunning but expensive — each lens has its own data fetches
  and renderers.

**Recommendation:** **static in v1.** Live mini-render is a
polish-on-polish item.

## What ships

1. **`useCompositionZoom.ts`:** drop `Z_MIN` from 1 to 0. URL
   serialization: z=0 drops the param same as z=1 today (or pick a
   canonical default and drop *only* that — needs a small decision).
   All clamping math + integer snap-on-release continues to work.
2. **`CompositionCanvas.vue`:** new z=0 surface layer. Renders a
   5-thumbnail grid centered in the viewport; clicking a thumbnail
   calls `zoom.setLens(key)` + `zoom.setZ(1)` in one beat. Visual
   transitions: as z drops from 1 → 0, the lens surface fades opacity
   1→0 + scales 1→1.2 (zoom-OUT continues the depth metaphor — the user
   is "rising above" the lens). The z=0 grid fades 0→1 + scales
   0.96→1 across z=0.4→0.
3. **Gesture wiring:** existing wheel+ctrlKey / pinch / Cmd+- paths
   continue to ramp z; they just have one more integer to land on.
   Two-finger swipe-up on trackpad at z=1 is natural; verify it
   produces the same wheel event sequence.
4. **Desktop affordance (non-gesture):** when at z=1, an "Overview"
   icon at the top-right of the canvas (lucide:layout-grid?) ramps to
   z=0 on click. Hides at z=0. Keyboard: ESC at z=0 returns to the
   previously active lens at z=1.

## What this does NOT do

- ❌ Retire the LensChip.
- ❌ Live mini-render thumbnails.
- ❌ z=0 for any non-Studio canvas surface (the canvas is currently
  Studio-only).
- ❌ Year/quarter heat-map (the original "future lens" — still future).

## Implementation plan

1. Confirm both UX questions with user.
2. `useCompositionZoom.ts`: Z_MIN drop + URL drop-canonical decision.
3. New z=0 thumbnail-grid surface inside CompositionCanvas (component
   or inline).
4. Compositor transforms for the z=1↔z=0 transition.
5. Desktop "Overview" icon + ESC keyboard binding.
6. Live-verify: trackpad pinch-out from z=1 lands at z=0; thumbnail
   clicks land back at z=1 with right lens; ESC returns; URL respects
   z=0 drop policy; no regression on z=1→z=2→z=3 path or
   `?z=3&id=…` deep-links.
7. Memory + commit `feat(social): z=0 lens-grid view (composition canvas P4.4)`.

## Done criteria

- ✅ Pinch-out from z=1 (or Cmd+-) lands at z=0; grid of 5 thumbnails
  visible.
- ✅ Clicking a thumbnail returns to z=1 with that lens active.
- ✅ LensChip in the Studio hero continues to work (no regression).
- ✅ `?z=3&id=<…>` deep-links continue to mount composer (no regression).
- ✅ ESC at z=0 returns to previously active lens at z=1.

---

# Shared constraints (apply to both items)

- **One spring policy** — `cubic-bezier(0.36, 0.66, 0.04, 1) @ 400ms`
  for any motion. Don't roll a second curve. (Per
  [[feedback_ios_native_strategy]].)
- **Compositor-only motion** — transform / opacity only. No Vue
  Transition class swaps for canvas state. (Per
  [[feedback_motion_stack_policy]].)
- **`?view=` URL contract preserved** — bidirectional watchers in
  StudioSurface stay intact. Neither item should touch the
  lens-switching axis (D extends z but not view).
- **Zod symmetry** — anything you add to a create schema lands in the
  matching PATCH schema too. (Per [[feedback_zod_silent_drop]].)
- **No auth-bypass scratch endpoints** — use real signed-in sessions
  for verify. (Per [[feedback_no_auth_bypass_no_replay_mutations]].)
- **No new auth gaps** — every new endpoint uses `requireOrgMembership`
  and org-scopes its queries. Cross-org bleed has bit us multiple
  times this year.
- **Dev preview host is always 127.0.0.1, never localhost** — Nuxt dev
  server only binds IPv4 loopback; localhost resolves to IPv6 and
  returns HTTP 426. (Per [[feedback_dev_preview_host]].)

## Demo session details

- User: `demo@earnest.guru` (via `POST /api/auth/demo-login`)
- Org: `40c4d2e5-79d2-4008-9a97-9c14f94dfd0e` (Earnest Demo — Solo)
- Demo mailing list seeded for P4.2: `id=10`, name "Composition Canvas
  test list" with 2 subscribed contacts.
- Demo org has scattered social posts + email touches across May. Reuse
  for end-to-end verifies — create one new test row per item, edit it,
  send/save, GET round-trip, delete to clean up.
- For Item C live-verify: edit an existing touch's body in Tiptap, save,
  GET round-trips, send a test inbox via `/api/email/test-send`.
- For Item D live-verify: pinch-out on trackpad at z=1 lands at z=0;
  click thumbnail to dive back into the chosen lens.

## When you're stuck

- **Tiptap markdown round-trip loses formatting (Item C):** that's why
  the recommendation is HTML storage. If user picks markdown, accept
  the limitation and document which constructs round-trip cleanly
  (bold/italic/lists/headings yes; tables/alignment/inline styles maybe
  not).
- **HTML migration of body_variants gets tricky (Item C):** the lane
  shape is `{ subject?, body_markdown }` post-P4.1b. Migrating each
  lane through `marked` is one-pass; just remember to update the
  `normalizeBodyVariants` helper in `shared/composition.ts` to compare
  on the new field name and re-test the lane collapse round-trip.
- **z=0 hydration mismatch (Item D):** the same SSR/CSR `z` race that
  hit P3.1–P3.3 will resurface if Z_MIN changes and the SSR-init isn't
  kept in sync. P3.3's fix lives in `useCompositionZoom.ts` — touch
  carefully.
- **Compose/Lens chooser popovers don't open in headless verify:**
  known — Reka-UI's PopoverTrigger requires trusted events. Verify the
  structure (`data-state="closed"` + `aria-haspopup="dialog"`);
  real-user clicks work. See the P3.4 + P3.5 + P3.6 ship logs.

## Carry-over items (still un-exercised across P3 + P4)

- 6× CPU throttle smoke test on depth-zoom transitions — un-run since
  P3.1.
- Two-pointer pinch on a real touchscreen — un-exercised since P3.1.
- Hydration mismatch on `.composition-canvas__surface` — partial fix in
  P3.3 SSR-init; cosmetic-only, no UX impact. Re-verify after Item D
  (which extends Z_MIN).
- `RiverSurface` email leaf tooltip showing list name (P4.2 deferred —
  timeline GET still bare-int). Low-priority polish.

## When the broader follow-on is done

The Composition Canvas initiative fully closes once Item C ships. Item
D is true delight territory — a "nice to have" that extends the depth
metaphor end-to-end but isn't blocking anything.

After C (and optionally D): the next initiative-shaped opportunity is
either:

- **Cross-channel touch composer** (the "campaign moment" the P3.4
  handoff punted on — author one piece that fans out to social + email
  together via a synthetic shared campaign + content_plan).
- **Block library bottom dock** (item #5 from the original recommended
  order — would replace BlockBuilder's left sidebar with a Mac-Dock-
  style live-tile picker; high visual payoff, scoped to BlockBuilder).
- **Portal canvas rollout** (currently canvas is staff-only; surfacing
  approval lenses to portal users would unify the two-audience review
  flow).
- **Marketing send-path arming** — `MARKETING_SEND_DRY_RUN=false` + the
  vercel.json cron entry. Currently sends are gated to dry-run;
  flipping the switch makes mailing-list-targeted + multi-target
  touches actually deliver. Needs SendGrid `from` auth verification +
  a careful first-touch dry-run review.

Each is its own initiative, not a P4 phase.

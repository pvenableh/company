# Session 20 — Marketing screenshot gallery + widget restyle

**Status:** Not started
**Repo:** `~/Sites/earnest/earnest-marketing` (separate from the app)
**App-repo reference (read-only here):** `~/Sites/earnest/earnest`
**Ships:** (1) a gallery section on the marketing site that surfaces all 19 product screenshots; (2) restyled "ambient" widgets in `SellSheetModern.vue` whose visual language matches the actual Earnest app components 1:1.

## Why

Session 19 captured 19 fresh screenshots, but only the homepage hero shot and the per-feature `/features/[slug]` pages reference them today. The marketing site has a "See it in action" showcase grid and a hero widget cloud that are entirely hand-drawn SVG mocks — they look generic and don't match the actual app. Two parallel gaps:
1. The full screenshot library is invisible to anyone who lands on `earnest.guru` and doesn't drill into a feature page.
2. The on-page widgets are generic-SaaS aesthetic (gradient revenue charts, abstract pills) rather than the **Clean Gantt** language the app actually uses.

## Track 1 — Screenshot gallery / slideshow

### Goal

A new gallery section on the homepage (or a dedicated `/gallery` route, your call — defend the choice) that lets visitors browse all 19 captures.

### Inputs

All 19 captures live at:
- `~/Sites/earnest/earnest-marketing/public/screenshots/latest/<slug>.png`
- (Dated archive at `public/screenshots/2026-05/<slug>.png`.)

Slug list (also in `app/data/features.ts` `DemoShot` union):

**Solo demo (Member role):** `command-center`, `leads-pipeline`, `contact-detail`, `client-detail`, `project-timeline`, `tickets-kanban`, `financials-overview`, `people-dashboard`, `scheduler-day`, `proposals-composer`, `proposals-preview`, `contracts-list`, `contracts-signed`, `ai-sidebar`

**Agency demo (Admin role):** `marketing-overview`, `organization-overview`, `organization-teams`, `organization-branding`, `team-detail`

`getScreenshotSrc(shot)` already returns the correct `latest/` URL — use it.

### Pick a format

Two reasonable approaches — choose one and ship it cleanly:

**Option A — Bento grid** (recommended): a single tall section with all 19 shots laid out at varying sizes. Asymmetric grid, no controls needed. Easier to scan, no JS. Hover to lift; click to open lightbox at full resolution.

**Option B — Carousel / slideshow**: horizontal scroll-snap or auto-advancing slideshow with thumbnail strip + label captions per slot. More compact vertically but adds interaction state.

Whichever you pick: **caption every shot** with the human-readable feature name (derived from `features.ts` — there's already a slug→shot mapping you can reverse). Don't ship a wall of unlabeled images.

Place the section between the existing `sm-showcase` ("See it in action") and `sm-marquee` regions in [`SellSheetModern.vue`](../../../earnest-marketing/app/components/SellSheetModern.vue). Or excise the showcase mocks entirely and replace with the gallery — see Track 2 for the case for excision.

### Constraints

- Must be performant: the 19 PNGs at 1440×900 / 1280×720 are ~150KB each. Lazy-load below the fold (`loading="lazy" decoding="async"`). Consider `<picture>` with WebP if you add a build step — but Nuxt's image optimization isn't wired today, so don't introduce a new dep without justification.
- Keep the existing `sm-hero-shot` (single command-center image at the top) — that's the proof shot, separate concern.
- Respect the design system: same border-radius, same chrome treatment, same caption typography as `sm-hero-shot-frame` (lines ~161-177 of SellSheetModern.vue).
- Mobile: the bento should reflow to a single column at sm breakpoint.

## Track 2 — Restyle the widgets to match the actual app

### Goal

The hero widget cloud (`sm-hero-widgets`, lines ~96-157), the auto-scrolling carousel (`sm-widget-carousel`, lines ~180-298), and the "See it in action" showcase grid (`sm-showcase`, lines ~564-1003) all use bespoke, generic SaaS visuals (gradient line charts, abstract circles, made-up brand names like "Acme Corp" and "Nova Labs"). Restyle each so the visual language matches the actual Earnest components.

### Source of truth — clone the styling from these app files

The app uses a **Clean Gantt** aesthetic (per memory): sticky labels, 12px flat bars, opacity-based status, hidden scrollbars, smooth scroll, role-aware editable modals, 2-level nesting. Concrete reference components in `~/Sites/earnest/earnest/app/components/`:

| Mock widget | What to clone styling from | Notes |
| --- | --- | --- |
| Projects gantt | `Scheduler/DayTimeline.vue` | The day-Gantt with hour axis, 12px bars, milestone diamonds, now-line. Honor the spec: opacity-based status, sticky row labels. |
| CRM Intelligence card | `Leads/LeadPipelineCard.vue` + `Leads/PipelineBoard.vue` | Real Kanban card style — corner radius, status chip, contact dot, value pill. |
| Tickets row | `Tickets/Activity.vue` + the kanban view captured in `tickets-kanban.png` | Ticket cards: priority chip color, assignee avatar, status dot. |
| Revenue trend / stats | The financials dashboard captured in `financials-overview.png` — find the source widgets in `app/components/Financials/` or `app/pages/financials/` | Use the actual chart palette and stat-card padding. |
| Earnest Score / Health | `app/components/EarnestScore/` (if present) — search for `useEarnestScore` callers | Six-dimension radial / level pill / streak counter. |
| Goals progress | `app/components/Teams/` for `team_goals` widget — real progress bar treatment | |
| Pipeline bars | The mini bars in `Leads/LeadStats.vue` or the `/leads` page hero | |
| Channels chat | `app/components/Channels/` message bubbles | Match the actual spacing + sender treatment. |
| Calendar dots | `Scheduler/` calendar grid components | |
| Invoicing rows | `app/components/Invoices/` row treatment from `Invoice.vue` or invoice list | |
| AI chip | The `Earnest sidebar` ai-sidebar.png shows the real chat panel — match its bubble style + sparkle icon size | |
| People list | The `people-dashboard.png` capture — real donut + funnel + top-clients table | |

Replace fake brand names ("Acme Corp", "Nova Labs", etc.) with the names that already appear in the demo seed (search `scripts/lib/demo-seed.ts` — Atlas Fintech, Helios, etc.). Consistency between the marketing-site widgets and what users see when they click "Try the demo" is the win.

### Approach

1. Read the named app components and capture their layout, spacing, color palette, typography weights, status-chip styles. Don't copy DOM — recreate the **visual** in static HTML/SVG so the marketing site stays dependency-free.
2. Update the widgets in `SellSheetModern.vue` in-place. Keep the existing GSAP reveal hooks and the carousel auto-scroll mechanism — only the inner markup + CSS changes.
3. Where a mock widget no longer earns its place once Track 1 ships the screenshot gallery, **delete it** rather than restyling. Prefer fewer, more accurate widgets over many generic ones. The "See it in action" showcase grid (lines 564-1003) is a strong candidate for excision — let the gallery do that job.
4. Keep CSS scoped under the existing `sm-*` prefix. New tokens go in the same `:root` / scope block at the top of the `<style>` section.

### What "matches" means

The judge: a screenshot of the marketing-site widget side-by-side with a screenshot of the real app component should read as obviously the same product. Same border-radius, same shadow depth, same status-chip language, same typography hierarchy. Not pixel-identical (the marketing widgets are smaller and decorative), but visually unambiguous.

## Local dev

```sh
cd ~/Sites/earnest/earnest-marketing
pnpm dev
```

The app dev server holds port `3000` (see `~/Sites/earnest/earnest/.claude/launch.json` `earnest-dev`); Nuxt will auto-bump the marketing site to `3001` or `3002`. Watch the terminal for the actual URL. **Use `127.0.0.1`, not `localhost`** in scripts — see `reference_dev_server_ipv6.md`.

If you need to A/B against the real app components, the app preview server (`earnest-dev` on port 3000) is already running — open it in another tab.

## Verification

- All 19 PNGs render in the gallery with correct captions — manually inspect each.
- Lighthouse / network tab: the gallery section doesn't pull all 19 images on initial paint (lazy-load works).
- Side-by-side visual check: open the marketing widget and the matching app component in adjacent tabs; the styling reads as the same product.
- Responsive: 1440px, 1024px, 768px, 375px breakpoints all reflow cleanly.

## DoD

- [ ] Track 1 — gallery section ships, all 19 captures visible with captions, lazy-loaded, mobile reflows
- [ ] Track 2 — every restyled widget has a named app component as its source of truth (document the mapping in a comment near each widget block)
- [ ] Fake brand names replaced with seeded demo brands
- [ ] Showcase grid (`sm-showcase`) either restyled or removed in favor of the gallery
- [ ] Visual smoke on `pnpm dev` at all four breakpoints
- [ ] Commit + push earnest-marketing repo
- [ ] Memory: archive this launch-queue file, write closure note in a new `project_session20_*.md`, add MEMORY.md index line, refresh "Next up"

## Reference files

**Marketing repo:**
- [`app/components/SellSheetModern.vue`](../../../earnest-marketing/app/components/SellSheetModern.vue) — single 1700-line component containing all the widgets and showcase
- [`app/data/features.ts`](../../../earnest-marketing/app/data/features.ts) — `DemoShot` union, `getScreenshotSrc(shot)`, `FEATURE_DEMO_MAP`
- [`public/screenshots/latest/`](../../../earnest-marketing/public/screenshots/latest/) — the 19 PNGs

**App repo (read-only reference):**
- `app/components/Scheduler/DayTimeline.vue` — Clean-Gantt canonical
- `app/components/Leads/PipelineBoard.vue`, `Leads/LeadPipelineCard.vue`, `Leads/LeadStats.vue`
- `app/components/Tickets/`
- `app/components/Channels/` (channel message bubbles)
- `app/components/Invoices/Invoice.vue`
- `scripts/lib/demo-seed.ts` — real demo brand names

**Memory pointers:**
- `feedback_ui_patterns.md` — Compact pill buttons, rounded-full selects, no cancel in modals
- `feedback_label_styling.md` — `text-[10px] uppercase tracking-wider` for card labels
- "Design direction" entry in `MEMORY.md` — Clean Gantt aesthetic spec

## Notes for Claude

- This is the marketing site, not the app. No Directus calls, no backend changes, no auth — just HTML/CSS/SVG inside a single Vue component.
- Don't introduce new dependencies (no `swiper`, no `embla-carousel`, no image library) without explicit justification. Native CSS scroll-snap and `<dialog>` cover the gallery + lightbox needs.
- The user values terse responses and dislikes trailing summaries — see `feedback_ui_patterns.md`.
- Keep the existing GSAP reveal animations on the showcase / carousel — they're tuned and working.
- When in doubt about an app component's exact styling, open the matching screenshot (e.g. `tickets-kanban.png`) and pixel-inspect.

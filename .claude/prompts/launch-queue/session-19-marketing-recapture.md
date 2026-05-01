# Session 19 — Marketing-site recapture + content refresh

**Status:** Not started
**Blocker:** none. Prereqs: app demo orgs are seeded (`pnpm tsx scripts/setup-demo-org.ts` and `setup-demo-agency-org.ts` if they need a refresh — see `project_demo_mode.md`). Marketing-site repo is at `~/Sites/earnest/earnest-marketing` (separate repo from the app).
**Ships:** fresh screenshot set (covering Sessions 13–18 surfaces), updated `features.ts`, real README replacing the stale `UPDATE_INSTRUCTIONS.md`.

## Context — what's drifted

The marketing site at `~/Sites/earnest/earnest-marketing` was last updated content-wise around Apr 14 (`UPDATE_INSTRUCTIONS.md`). Since then, the app shipped:

- **Session 13** — Marketing dashboard rebuild + People Intelligence dashboard (charts-driven /people)
- **Session 14** — Onboarding wizard polish
- **Session 15** — OAuth screen recording (not user-visible)
- **Session 16** (proposals/contracts foundations) — Document blocks, service templates, `<DocumentHeader>`, `<BlockComposer>`, `<BlockRenderer>`, AI proposal-drafter, Powered-by-Earnest footer
- **Session 17** — Tenant-perm cleanup (not user-visible)
- **Session 18** — Document-system finish: contracts list/detail/preview/sign + convert-from-proposal, whitelabel opt-out, cover-page styling, AI library-ref fuzzy match

The current screenshot set in `earnest-marketing/public/screenshots/latest/` is from `2026-04` and covers 11 surfaces: client-detail, command-center, contact-detail, financials-overview, leads-pipeline, marketing-overview, organization-overview, organization-teams, project-timeline, team-detail, tickets-kanban.

**Missing from the screenshot set** (post-April additions worth showing):
- `/proposals` (composer + preview)
- `/contracts` (list + detail + signed-state)
- `/people` (intelligence dashboard, post-rebuild)
- `/scheduler` (Clean-Gantt day timeline)
- AI sidebar on a client or lead (entity-scoped chat)
- Earnest Score dashboard (gamification surface) — if not already covered by the homepage
- `/marketing` post-rebuild (not just the old overview)
- `/organization` Branding card + Subscription card (whitelabel toggle)

`features.ts` has 22 entries; the old UPDATE_INSTRUCTIONS doc claimed it should reach 23 — but post-Session-18 additions (contracts, AI proposal-drafter, whitelabel, document blocks) aren't represented at all. So the right number is closer to ~26 once filled in.

## Track 1 — Recapture screenshots

### 1a. Audit the existing capture script

`scripts/capture-demo-screenshots.ts` and `scripts/CAPTURE-SCREENSHOTS.md` are in the **app** repo (not marketing). Read them first. The script:
- Logs in to both demo orgs (Solo + Agency) using `DEMO_USER_PASSWORD` and `DEMO_AGENCY_USER_PASSWORD` (in `.env`).
- Drives Playwright through a list of routes, screenshots each at 1440×900.
- Writes to BOTH `earnest-marketing/public/screenshots/<YYYY-MM>/<slug>.png` AND `latest/<slug>.png`.
- Skips Admin-only shots if `DEMO_AGENCY_USER_PASSWORD` is unset.

### 1b. Extend the capture list

Add these surfaces to the script. For each, decide whether it's Member-role (Solo demo) or Admin-role (Agency demo):

| New slug | Route | Demo org | Notes |
| --- | --- | --- | --- |
| `proposals-composer` | `/proposals/<id>` (pick a seeded proposal) | Solo | Show the BlockComposer with library + inline blocks |
| `proposals-preview` | `/proposals/preview/<id>` | Solo | Branded client view (DocumentHeader + cover + footer) |
| `contracts-list` | `/contracts` | Solo | Card grid; seed 2–3 contracts in different statuses |
| `contracts-signed` | `/contracts/<id>` of a signed contract | Solo | Show the green "Signed" callout + signed-by name |
| `people-dashboard` | `/people` | Solo | Donut + funnel + top clients + 90-day line |
| `scheduler-day` | `/scheduler` (today, with a few seeded events) | Solo | Clean-Gantt day timeline |
| `ai-sidebar` | `/clients/<id>?sidebar=1` (or a lead) | Solo | Open the contextual AI chat panel |
| `marketing-rebuild` | `/marketing` | Solo | Post-Session-13 dashboard (replace existing `marketing-overview.png`) |
| `organization-branding` | `/organization` (overview tab, scrolled to Branding card) | Agency | Whitelabel toggle visible |

Update the seed scripts (`scripts/lib/demo-seed.ts`) if needed so the demo orgs have the necessary fixtures: seeded proposals with blocks, at least one signed contract, contacts with email engagement, scheduler events for "today."

### 1c. Run the capture

```sh
cd ~/Sites/earnest/earnest
DEMO_USER_PASSWORD=<from .env> \
DEMO_AGENCY_USER_PASSWORD=<from .env> \
APP_URL=http://127.0.0.1:3000 \
pnpm tsx scripts/capture-demo-screenshots.ts
```

(Use `127.0.0.1`, not `localhost` — see `reference_dev_server_ipv6.md`.)

Verify the new files land in `earnest-marketing/public/screenshots/2026-05/` AND `latest/`. Inspect each PNG manually before committing — Playwright sometimes captures mid-load states.

### 1d. Optional: replace stale dated folders

If `2026-04/` is fully superseded, leave it (history reference). The script already clears + rewrites the current month's folder on each run.

## Track 2 — Update `features.ts`

`~/Sites/earnest/earnest-marketing/app/data/features.ts` currently has 22 entries. Add these:

- **Contracts & E-Signing** (`slug: 'contracts'`, category: `productivity`) — list/detail/preview/public-sign flow, convert-from-proposal, signature audit log (name + email + IP + timestamp), no third-party dep
- **AI Proposal Drafter** (`slug: 'ai-proposal-drafter'`, category: `ai`) — composes a proposal from a lead's full context (contact, prior activities, sourced attribution, brief) using the org's service templates as the spine and the document-blocks library for terms/bio/references; outputs an editable `BlockComposer` draft
- **Reusable Document Blocks** (`slug: 'document-blocks'`, category: `productivity`) — bio, references, deliverables, terms, NDA, case studies; library is per-org, blocks compose into proposals + contracts via the `BlockComposer`
- **Whitelabel** (`slug: 'whitelabel'`, category: `productivity`, plan-gated to studio/agency/enterprise) — single org-level toggle that hides "Powered by Earnest." across every client-facing document (proposals, contracts, invoices)

Refresh the existing CRM Intelligence and AI Strategy Engine entries — they predate the Context Broker shipping and the Phase C₃ AI-sidebar parity rollout.

Bump the feature-count references wherever they appear in `SellSheetModern.vue` or other copy (search for `21 features`, `22 features`, `23 features` — the right number after this pass is whatever `features.length` ends up at).

## Track 3 — Replace `UPDATE_INSTRUCTIONS.md` with a real README

`UPDATE_INSTRUCTIONS.md` is a stale TODO checklist from Apr 14. Most of its tasks are done; the remaining ones are about content drift this session is closing. There is no README in the marketing repo today — write one.

Write a **proper README.md** at the marketing-site repo root, structured like:

```
# earnest-marketing

Marketing site for Earnest. Static Nuxt 4, deployed to <where>.

## Repo layout
- app/pages — routes (index, features/[slug], blog/[slug], privacy, terms)
- app/components — SiteNav, SiteFooter, SellSheetModern (homepage), Logo
- app/data/features.ts — feature definitions consumed by /features and SellSheetModern
- public/screenshots — product screenshots (see "Screenshot pipeline")
- public/llms.txt — opt-in directives for LLM crawlers

## Where content lives
- Feature copy → `app/data/features.ts`
- Homepage hero + sections → `app/components/SellSheetModern.vue`
- Blog posts → Directus CMS (admin.earnest.guru, `posts` collection)
- Privacy/Terms → `app/pages/privacy-policy.vue`, `app/pages/terms-of-service.vue`

## Screenshot pipeline
Captures live in the app repo, not here:
- Script: `~/Sites/earnest/earnest/scripts/capture-demo-screenshots.ts`
- Docs: `~/Sites/earnest/earnest/scripts/CAPTURE-SCREENSHOTS.md`
- Output: this repo's `public/screenshots/<YYYY-MM>/` + `latest/`

To refresh, see Session 19 in the app repo's launch-queue.

## Local dev
pnpm dev → http://localhost:3001 (or whatever port nuxt picks)

## Deploy
<deploy command / target — confirm with peter@huestudios.com>
```

Delete `UPDATE_INSTRUCTIONS.md` once the README covers everything actionable.

## Track 4 — (Optional) Blog posts

If time, draft 1–2 short blog posts in Directus `posts`:
- "Contracts in Earnest: from proposal to signature without a third-party tab" — explain the convert-from-proposal flow + the typed-name sign UX + audit log
- "Whitelabel for paid plans" — short note, links to /pricing

These are post-launch nice-to-haves, not blockers.

## DoD

- [ ] `earnest-marketing/public/screenshots/2026-05/` exists with the 9 new captures + the existing 11 (or replaced versions)
- [ ] `earnest-marketing/public/screenshots/latest/` mirrors the May set
- [ ] `features.ts` has entries for contracts, ai-proposal-drafter, document-blocks, whitelabel; CRM Intelligence + AI Strategy Engine refreshed
- [ ] Feature-count references match `features.length`
- [ ] `README.md` at marketing-site root replaces `UPDATE_INSTRUCTIONS.md`
- [ ] (Optional) 1–2 blog posts in Directus
- [ ] Memory updated with closure note + this launch-queue file removed/archived

## Reference files (in the app repo)

- Capture: `scripts/capture-demo-screenshots.ts`, `scripts/CAPTURE-SCREENSHOTS.md`
- Demo seed: `scripts/setup-demo-org.ts`, `scripts/setup-demo-agency-org.ts`, `scripts/lib/demo-seed.ts`
- Memory: `project_marketing_people_dashboards.md`, `project_demo_mode.md`, `project_session18_document_system.md`

## Notes for Claude

- Run against prod `admin.earnest.guru`. Demo creds: `DEMO_USER_PASSWORD` / `DEMO_AGENCY_USER_PASSWORD` (in `.env`).
- Solo demo org `40c4d2e5-79d2-4008-9a97-9c14f94dfd0e`; Agency `d409875b-01d7-4f85-84c8-01c9badbb338`.
- Dev server: `http://127.0.0.1:<port>`, never `localhost` (`reference_dev_server_ipv6.md`).
- Marketing site is a **separate repo** at `~/Sites/earnest/earnest-marketing` — `cd` into it for the README + features.ts work, but the capture script lives in the app repo.

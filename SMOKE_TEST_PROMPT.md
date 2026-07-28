# Pre-launch smoke test — Earnest demo

You are QA-testing the Earnest app before it goes live. A large **slide-over
unification** just shipped to `main` (commits `9e7c224a`, `7cb1fefa`,
`ade6e225`, `1851f63e`): nearly every "add/create" and several "edit" flows were
moved onto the stacked slide-over panel, plus a glass-nesting visual fix and a
calendar meeting rework. Your job is to smoke-test that work **and** the app's
core flows, then give a go / no-go.

Full detail on what changed lives in your memory: read
`memory/project_detail_glass_and_create_panel_unification.md` first — it lists
every converted flow, the file locations, and the known gotchas.

## Setup

1. **Point the in-app browser at the deployed app host** (`app.` hostname — the
   auto-deployed `main`). No dev server needed; use `preview_start` with a
   `{url}` for that host (or `navigate` if the pane is already open). Only start
   the local dev server (`preview_start {name: "earnest-dev"}`, host 127.0.0.1)
   if you need the local fallback described above.
2. **Log in to the demo — passwordless, no credentials to type.** On the deployed
   host, navigate to `/try-demo?persona=solo`, then poll until the URL leaves
   `/try-demo` (it lands on `/?tour=1`). The server holds `DEMO_USER_PASSWORD`
   and logs in server-side. Two personas to cover:
   - `?persona=solo` — Solo studio (Member role).
   - `?persona=agency` — Agency team (Admin role; exercises teams/marketing/billing).
   If a nav races and bounces to `/auth/signin`, just re-run `/try-demo` and wait
   for the redirect before navigating on.

## Where to test — deployed demo is the target

**Primary target: the deployed demo on the live app host (`app.` hostname).**
`main` auto-deploys, so the same passwordless demo login works there and — unlike
local dev — **create POSTs actually persist and lists refresh**. Run the whole
checklist here, including every create/edit/attach flow, so you're verifying real
end-to-end behavior, not just that a panel opened. Confirm the latest deploy
finished (the unification commits are live) before trusting it.

- **Local dev** is a *fallback only* — use it if the deploy is mid-flight or a
  surface is unreachable, and only for pure UI / render / no-overlay checks.
  ⚠️ On local dev, create POSTs to `/api/directus/items` return **404** (local
  Directus isn't fully wired), so records won't persist — that's an *environment*
  issue, **not** a bug. Never judge persistence from local dev; move the check to
  the deployed demo.

State clearly in your report which target you used for each check (it should be
the deployed demo for nearly everything; flag any check you had to fall back to
local for, and why).

## Data seeding (only if a surface is empty)

The demo orgs already ship with seed data (the solo org has projects incl.
**"Helios — Website Build"** `c03dc85b-42f2-48a8-bd05-ca5aae47ed3b`, proposals,
contacts, calendar events). Before deep-testing a surface, glance that it has
data. If something is empty and blocks a test, seed via `scripts/setup-demo-org.ts`
or the Directus MCP (`mcp__directus__*`) — **do not** rely on the UI create to
seed locally (it 404s). Note in your report anything you had to seed.

## How to verify (harness tips)

- Drive the in-app browser: `read_page` (get `ref_N` handles), `computer`
  (click by `ref`), `javascript_tool` (inspect state), screenshots for proof.
- **Prefer `ref`-based or JS clicks over raw coordinates** — the viewport
  scales and coordinate clicks miss.
- A flow is "on the stack" when, after triggering it:
  - the URL gains `?slide=<type>:<id>[:<mode>]` (e.g. `contact:new:create`,
    `work-meeting:...:edit`),
  - `document.querySelectorAll('.app-slide-over-stack__panel').length` ≥ 1
    (≥ 2 means it stacked *on top of* another panel — the desired effect),
  - `.app-slide-over-shell__title` reads the expected title,
  - there is **no** `[data-slot="sheet-overlay"]` / `[data-slot="dialog-overlay"]`
    (those mean the OLD elevated-modal pattern — a regression).
- **Expected console noise — do NOT report as bugs:** `Hydration completed but
  contains mismatches`, `[WS Manager] Auth failed`. Anything else in the console
  (especially Vue warnings, failed component mounts, unhandled errors) IS a finding.

## Smoke-test checklist

Run for **both personas**. For each app, confirm the page loads with no unexpected
console errors, then exercise the flows.

### A. The unified create flows (priority — this is the shipped work)
Each "New X" must open as a **stacked slide-over** (not an elevated overlay), the
form must render, and (on a persistence-capable target) create → panel pops →
list refreshes. Test from a **detail panel** and from **list/floor pages**:
- **Contact** — People → Contacts → "Add Contact"; also from a Project/Client panel.
- **Invoice** — Money floor "New Invoice"; also Project/Client panel.
- **Proposal / Contract** — Money → Documents "New Proposal"/"New Contract";
  also Project/Client/Lead. Note: proposal/contract create does a **post-create
  edit-hop** — after create it should transition straight into the new doc's
  composer (the create panel is replaced by the edit panel).
- **Ticket** — open a Project panel → Tickets tab → "New Ticket"; also the Work
  floor tickets CTA and the standalone **Board** "New Ticket" (`/tickets`).
- **Project Event** — Project panel → Timeline → "New Event".
- **Channel** — Project panel → Channels → "New Channel".
- **Touchpoint** — Project/Client/Contact → "Log touchpoint" (rich form: type
  picker, tag-people, default contact pre-tagged).
- **Meeting** — Project/Client/Lead → "New Meeting".

### B. Calendar meeting (the newest, riskiest work)
On `/scheduler` (and the Work-floor calendar, `?floor=calendar`):
- **Create**: "New Meeting" and day-cell "+ Event"/"+ Video" → stacked
  `work-meeting:new:create` panel; form initializes (video toggle, date/time/members).
- **Edit**: click a calendar event chip → a small **popover** opens → click its
  **pencil (edit)** icon → stacked **"Edit Meeting"** panel that is **pre-filled**
  with that event's title / date / time. (This pre-fill is the highest-risk item —
  verify the title input is populated, not blank.)

### C. Edit-in-place (no overlay)
- **Contact panel** → "Edit": the read view should **swap to the form in place**
  (still one panel, a "Cancel" appears in the header, no overlay).
- **Proposal / Contract** workspace → "Details": body swaps to the metadata form
  in place, with Cancel in the action bar + Save in the footer. Test both inside
  the slide-over panel **and** on the full page (`/proposals/[id]`, `/contracts/[id]`).

### D. Attach / bottom sheet (should stay a bottom sheet, not a blurring modal)
- Project panel → "Attach Existing" (tasks/tickets/contacts) → bottom sheet, no
  background blur.
- Project → Files & Docs → **"Attach file"** → now a **bottom sheet** (verify NO
  dialog overlay / no background blur).

### E. Glass visual fix
- Open a **Project** and a **Client** detail → Overview tab: the Money widgets
  (Collected / Pipeline / Hunt) should read as clean cards **floating on the page
  background**, not a card-inside-a-card with a doubled edge/shadow. Check light
  and dark mode.

### F. Regression / general health
- Each primary app loads and its main list renders: Dashboard, People, Work,
  Channels, Money, Marketing, Scheduler, Organization, Account.
- Opening entities (project, client, contact, ticket, proposal, invoice, meeting)
  still works — view mode intact.
- Back/close on a stacked panel pops correctly (URL `?slide=` param clears one
  level; a second panel returns to the first).
- Spot-check dark mode + a mobile viewport (`resize_window`) on a couple of the
  converted flows.

### G. Client portal — full pass
The portal (`/portal/*`) has **no** slide-over stack (the unification doesn't
touch it), so here you're verifying the client-facing app still works end-to-end,
not looking for stacked panels. It's a separate auth surface: portal users are
Client-Manager Directus-role accounts with no org junction (read-mostly). Cover:
- Every `/portal/*` page loads with no unexpected console errors.
- **Messages** (TipTap): open a thread, compose a message, @mention, send →
  confirm it posts and renders.
- **Invoices / pay**: list renders; open an invoice; the pay handoff reaches
  Stripe (do **not** complete a real payment — stop at the Stripe checkout/hosted
  page and confirm the redirect is correct).
- **Tickets / comments / reactions**: open a ticket, add a comment, react →
  confirm it persists.
- **CSAT / feedback**: the CSAT prompt renders and a rating submits
  (`/api/portal/csat`).
- **Notifications**: the portal notification surface loads and reflects activity.
- Note the portal is its own login — if you don't have portal demo credentials,
  say so and mark the portal checks Blocked rather than guessing. **Do not**
  create accounts or enter passwords yourself; if a credential is needed, ask.

### H. Onboarding — new-org creation & activation
Onboarding lives in **two** surfaces; there is **no** persisted `onboarded`
flag (state is derived). Cover both.

- **Signup → org bootstrap** (`register.vue` → `POST /api/auth/register`):
  the register form makes **org name required**, so a normal signup creates the
  user + org (auto-slug, plan `free`) + 5 system roles + owner membership +
  contact inline, then auto-logs in and lands on `/`. ⚠️ **Do not create real
  accounts on the deployed host** — verify the form renders and validates
  (blank org name blocks submit); confirm bootstrap behavior against the code /
  a throwaway env only. Note: **Google signup is coded but UI-hidden**
  (`RegisterForm.vue` `hasSso = false`) — confirm the button is intentionally
  absent.
- **Org-creation wizard** (`/organization/new`, for org-less users): walk
  steps **1 Name+Industry → 2 Plan (Solo/Studio/Agency, Monthly/Annual) → 3
  Details (Location, Website, **Brand Color** only) → 4 Payment ("Skip — Start
  Free" vs Stripe) → 5 Add-ons → 6 Invite**. Each step renders + advances.
  ⚠️ **Stop before the commit step** (step 4's "Start Free"/payment creates a
  real org) unless on a throwaway env.
  - **Add-ons purchasable in-flow?** YES, but **only on the paid path** —
    step 5 appears only if you chose to pay; free-tier skips plan→invite and
    never sees add-ons. Offered: Extra Seats, Communications, Client Packs, and
    **Companion White-Label ($19, agency-plan only)**. Confirm the add-on grid
    renders and `white_label` shows **only** when plan = agency.
  - **Brand info / target audience prompt?** The wizard collects **Brand Color
    only** (step 3). It does **NOT** prompt for brand direction/voice, target
    audience, or goals — those org fields power AI context and are set later in
    the Organization app, not during onboarding. Flag if that's a gap.
- **Activation checklist** (`useOnboardingProgress` → dashboard): 4 steps
  (invite teammate / add client / start project / send invoice), **derived from
  live record counts**, not a flag. ⚠️ It is **hidden on seeded demo orgs** (all
  counts satisfied), so it's not exercisable on the demo personas — needs an
  **empty org**. Verify on a fresh org or mark Blocked.

### I. White-label vs non-white-label (client-facing branding)
White-label is a **single-source-of-truth entitlement** — Earnest branding is
hidden ⟺ `organizations.whitelabel === true` **AND** the org is entitled (plan
`enterprise` **or** the `white_label` add-on). Gate helper:
`isEarnestBrandingHidden(org)` / `orgEntitledToWhitelabel(org)` in
`shared/branding.ts`. **Every** client-facing surface must agree.

Test both states. Neither passwordless demo persona is white-label by default
(only `hue` is). To test white-label on a demo, **temporarily** set the demo-org
`whitelabel:true` + `active_addons:{white_label:{}}` (+ optional `brand_color`)
via Directus, verify, then **revert** — note it in the report.

- **Toggle gating** (Org → Email/Communications → White-label): the toggle is
  **disabled with an entitlement explainer** when the org isn't entitled
  (non-enterprise, no add-on); **enabled** once entitled. Confirm a
  free/solo/agency-without-add-on org **cannot** enable it.
- **Client portal shell** (staff "Preview as client": `POST
  /api/portal/enter-preview {clientId}` → `/portal?previewAs=<clientId>`):
  non-white-label shows the org logo **+ "Client Portal"** mark; white-label
  **drops the "Client Portal" mark** and applies the brand accent.
- **Invoice / contract / proposal footers**: non-white-label shows **"Powered
  by Earnest."**; white-label (entitled) **hides** it. Check an invoice
  (`/portal/invoices/[id]`), a contract, and a proposal.
- **Transactional emails**: preview via
  `/api/email/preview-mjml?template=notification&brand=org` (footer shows
  "Powered by Earnest") vs `…&whitelabel=1` (entitled sample → footer hidden).
- **Invite-accept page** (`/auth/accept-org-invite`) + **public booking page**:
  the "Powered by Earnest" mark follows the same gate.
- ⚠️ **Regression to catch:** any surface that hides Earnest branding on the
  **raw `whitelabel` flag alone** (ignoring the entitlement) — they must all go
  through `isEarnestBrandingHidden`, so a non-entitled org that flips the flag
  should still show Earnest everywhere.
- **Note:** the demo orgs' seed **logo is itself an "E." mark**, so a branded
  demo portal still shows an "E" — that's the seed placeholder, not an Earnest
  fallback. A real white-label org shows its own logo.

## Deliverable

Produce a **go / no-go report**:
- A table of each flow above (sections A–I, including the full portal pass) →
  Pass / Fail / Blocked (with the target used — should be the deployed demo).
- For every failure: the exact repro (page + action), a screenshot, and the
  console error if any.
- Call out anything that still shows an **elevated overlay** where a stacked
  panel is expected (that's the key regression to catch).
- Separate "must-fix before launch" from "cosmetic / follow-up".
- List anything you had to seed, and any surface that was too empty to test.

Do not push, deploy, or change app code unless explicitly asked — this is a test
pass. If you find a bug and the fix is obvious and low-risk, note it and *propose*
it; wait for the user before editing.
